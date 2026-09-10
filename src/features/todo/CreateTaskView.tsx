import React, { useRef, useState } from 'react'
import {
  TASK_TITLE_MAX_LENGTH,
  type CreateTaskInput,
  type TaskPriority
} from '../../../electron/shared/types'
import { motion } from 'framer-motion'
import { sheet } from '../../design/motion'
import styles from './CreateTaskView.module.css'

interface CreateTaskViewProps {
  listId: number | null
  onClose: () => void
  onCreate: (input: CreateTaskInput) => void
  returnFocusRef: React.RefObject<HTMLButtonElement>
}

export function CreateTaskView({
  listId,
  onClose,
  onCreate,
  returnFocusRef
}: CreateTaskViewProps): React.ReactElement {
  const modalRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('')
  const [startedAt] = useState(() => new Date())
  const [priority, setPriority] = useState<TaskPriority>('none')
  const [reminder, setReminder] = useState('')
  const [notes, setNotes] = useState('')
  const startedAtLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(startedAt)

  const closeDialog = (): void => {
    onClose()
    requestAnimationFrame(() => returnFocusRef.current?.focus())
  }

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeDialog()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
      ) ?? []
    )
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    onCreate({
      listId,
      title: title.trim(),
      priority,
      reminder: reminder || null,
      notes: notes.trim() || null
    })
    closeDialog()
  }

  return (
    <motion.div
      className={styles.overlay}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={closeDialog}
    >
      <motion.div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        variants={sheet}
        initial="hidden"
        animate="visible"
        exit="hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={closeDialog} aria-label="Close task editor">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12.5 15L7.5 10L12.5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h2 id="create-task-title" className={styles.title}>
            Create task
          </h2>
        </header>

        <form className={styles.form} onSubmit={handleSave}>
          <div className={styles.fieldGroup}>
            <div className={styles.field}>
              <div className={styles.fieldLabelRow}>
                <label htmlFor="new-task-title">Task Name</label>
                <span id="task-name-limit" className={styles.characterCount}>
                  {title.length}/{TASK_TITLE_MAX_LENGTH}
                </span>
              </div>
              <input
                id="new-task-title"
                type="text"
                value={title}
                maxLength={TASK_TITLE_MAX_LENGTH}
                aria-describedby="task-name-limit"
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Design website for kodika.io"
                autoFocus
                required
              />
            </div>
            <div className={styles.field} role="group" aria-labelledby="new-task-start-label">
              <span className={styles.fieldLabel} id="new-task-start-label">
                Start Date
              </span>
              <time
                className={styles.dateValue}
                dateTime={startedAt.toISOString()}
                aria-labelledby="new-task-start-label"
              >
                {startedAtLabel}
              </time>
            </div>
            <div className={styles.field}>
              <label htmlFor="new-task-priority">Priority</label>
              <select
                id="new-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="none">None</option>
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="new-task-reminder">Set Reminder</label>
              <select
                id="new-task-reminder"
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
              >
                <option value="">No reminder</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="new-task-description">Description</label>
              <textarea
                id="new-task-description"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="- logo&#10;- landing&#10;- signup"
                rows={5}
              />
            </div>
          </div>

          <button type="submit" className={styles.saveBtn} disabled={!title.trim()}>
            Create task
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}
