import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Note } from '../../../electron/shared/types'
import { Icon } from '../../components/Icon/Icon'
import { springs } from '../../design/motion'
import { TaskNotesEditor, type TaskNotesEditorHandle } from './TaskNotesEditor'
import { plainTextToHtml, type RichTextSnapshot } from './rich-text-dom'
import styles from './NoteEditor.module.css'

interface NoteEditorProps {
  taskId: number
  onClose: () => void
}

export interface NoteEditorHandle {
  contains: (target: Node) => boolean
  flush: () => Promise<boolean>
}

interface PendingDraft {
  taskId: number
  snapshot: RichTextSnapshot
}

type NoteFeedback = 'idle' | 'copied' | 'exported' | 'error'

export const NoteEditor = React.forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { taskId, onClose },
  ref
): React.ReactElement {
  const [note, setNote] = useState<Note | null>(null)
  const [initialHtml, setInitialHtml] = useState('<p><br></p>')
  const [editorRevision, setEditorRevision] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [feedback, setFeedback] = useState<NoteFeedback>('idle')
  const rootRef = useRef<HTMLElement>(null)
  const editorRef = useRef<TaskNotesEditorHandle>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftRef = useRef<PendingDraft | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const draftPromisesRef = useRef(new WeakMap<PendingDraft, Promise<boolean>>())
  const currentTaskIdRef = useRef(taskId)
  const loadVersionRef = useRef(0)

  currentTaskIdRef.current = taskId

  const showFeedback = useCallback((value: NoteFeedback): void => {
    setFeedback(value)
    if (feedbackRef.current) clearTimeout(feedbackRef.current)
    feedbackRef.current = setTimeout(() => setFeedback('idle'), 2200)
  }, [])

  const saveDraft = useCallback(
    (draft: PendingDraft): Promise<boolean> => {
      const existing = draftPromisesRef.current.get(draft)
      if (existing) return existing
      setIsSaving(true)
      const promise = saveQueueRef.current
        .then(() =>
          window.electronAPI.todo.upsertNote({
            taskId: draft.taskId,
            content: draft.snapshot.html,
            contentFormat: 'html',
            plainText: draft.snapshot.plainText,
            markdown: draft.snapshot.markdown
          })
        )
        .then((result) => {
          if (result.ok) {
            if (currentTaskIdRef.current === draft.taskId) setNote(result.data)
            if (pendingDraftRef.current === draft) pendingDraftRef.current = null
          } else {
            showFeedback('error')
          }
          return result.ok
        })
        .catch(() => {
          setIsSaving(false)
          showFeedback('error')
          return false
        })
        .finally(() => {
          if (!pendingDraftRef.current) setIsSaving(false)
        })
      draftPromisesRef.current.set(draft, promise)
      saveQueueRef.current = promise.then(
        () => undefined,
        () => undefined
      )
      return promise
    },
    [showFeedback]
  )

  const flushPending = useCallback(async (): Promise<boolean> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    const draft = pendingDraftRef.current
    return draft ? saveDraft(draft) : true
  }, [saveDraft])

  useImperativeHandle(
    ref,
    () => ({
      contains: (target: Node) => rootRef.current?.contains(target) ?? false,
      flush: flushPending
    }),
    [flushPending]
  )

  useEffect(() => {
    const version = ++loadVersionRef.current
    setNote(null)
    setInitialHtml('<p><br></p>')
    setEditorRevision((current) => current + 1)
    window.electronAPI.todo.getNotes(taskId, undefined).then((result) => {
      if (version !== loadVersionRef.current || currentTaskIdRef.current !== taskId) return
      if (pendingDraftRef.current?.taskId === taskId) return
      if (result.ok && result.data) {
        setNote(result.data)
        setInitialHtml(
          result.data.contentFormat === 'html'
            ? result.data.content
            : plainTextToHtml(result.data.content)
        )
      } else {
        setNote(null)
        setInitialHtml('<p><br></p>')
      }
      setEditorRevision((current) => current + 1)
    })
  }, [taskId])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (feedbackRef.current) clearTimeout(feedbackRef.current)
      const draft = pendingDraftRef.current
      if (draft) void saveDraft(draft)
    },
    [saveDraft]
  )

  const handleContentChange = useCallback(
    (snapshot: RichTextSnapshot): void => {
      const draft = { taskId: currentTaskIdRef.current, snapshot }
      pendingDraftRef.current = draft
      setIsSaving(true)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        if (pendingDraftRef.current === draft) void saveDraft(draft)
      }, 500)
    },
    [saveDraft]
  )

  const handleCopy = async (): Promise<void> => {
    try {
      await editorRef.current?.copyAll()
      showFeedback('copied')
    } catch {
      showFeedback('error')
    }
  }

  const handleExport = async (): Promise<void> => {
    setIsExporting(true)
    const saved = await flushPending()
    if (!saved) {
      setIsExporting(false)
      showFeedback('error')
      return
    }

    const result = await window.electronAPI.todo.exportNoteMarkdown(taskId)
    setIsExporting(false)
    if (result.ok && result.data) showFeedback('exported')
    else if (!result.ok) showFeedback('error')
  }

  const statusText = isSaving
    ? 'Saving…'
    : isExporting
      ? 'Exporting…'
      : feedback === 'copied'
        ? 'Copied'
        : feedback === 'exported'
          ? 'Exported'
          : feedback === 'error'
            ? 'Action failed'
            : note
              ? 'Saved'
              : ''

  return (
    <motion.aside
      ref={rootRef}
      className={styles.container}
      aria-label="Task notes"
      initial={{ x: 24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 24, opacity: 0 }}
      transition={springs.smooth}
    >
      <div className={styles.header}>
        <span className={styles.title}>Notes</span>
        <div className={styles.actions}>
          <span className={styles.saveStatus} role="status" aria-live="polite">
            {statusText}
          </span>
          <button
            className={styles.actionBtn}
            type="button"
            onClick={() => void handleCopy()}
            aria-label="Copy note content"
            title="Copy note for Outlook or Excel"
          >
            <Icon name={feedback === 'copied' ? 'check' : 'copy'} size={14} />
          </button>
          <button
            className={styles.actionBtn}
            type="button"
            onClick={() => void handleExport()}
            disabled={isExporting}
            aria-label="Export note as Markdown"
            title="Export Markdown"
          >
            <Icon name="share" size={14} />
          </button>
          <button
            className={styles.closeBtn}
            type="button"
            onClick={onClose}
            aria-label="Close notes"
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      </div>
      <TaskNotesEditor
        key={`${taskId}:${editorRevision}`}
        ref={editorRef}
        initialHtml={initialHtml}
        onChange={handleContentChange}
      />
    </motion.aside>
  )
})

NoteEditor.displayName = 'NoteEditor'
