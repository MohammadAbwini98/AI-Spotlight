import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { LiquidGlassSurface } from '../../components/LiquidGlassSurface/LiquidGlassSurface'
import type {
  AiConversation,
  AiConversationMessage,
  AiImportProgress,
  AiMessage as SharedAiMessage,
  AiModelInfo,
  AiRuntimeStatus
} from '../../../electron/shared/types'
import { springs, spotlightContent } from '../../design/motion'
import { AiChatHeader } from './AiChatHeader'
import { AiConversation as AiTranscript } from './AiConversation'
import { AiComposer } from './AiComposer'
import { AiRuntimeStatus as AiStatusPill } from './AiRuntimeStatus'
import type { UiChatMessage } from './AiMessage'
import styles from './AiChatView.module.css'

interface AiChatViewProps {
  onBack: () => void
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`
}

function toUi(message: AiConversationMessage): UiChatMessage {
  return {
    id: message.id,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content
  }
}

/**
 * Dedicated local-AI chat screen. Architecturally independent from Spotlight
 * file search: search IPC is never called here and opening this view is the
 * only user path that starts the AI runtime.
 */
export function AiChatView({ onBack }: AiChatViewProps): React.ReactElement {
  const [status, setStatus] = useState<AiRuntimeStatus | null>(null)
  const [model, setModel] = useState<AiModelInfo | null>(null)
  const [conversations, setConversations] = useState<AiConversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiChatMessage[]>([])
  const [generating, setGenerating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<AiImportProgress | null>(null)

  const requestIdRef = useRef<string | null>(null)
  const bufferRef = useRef('')
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stateRef = useRef({ conversationId, messages })
  stateRef.current = { conversationId, messages }

  const refreshStatus = useCallback(async (): Promise<void> => {
    const result = await window.electronAPI.ai.getStatus()
    if (result.ok) setStatus(result.data)
  }, [])

  const refreshModel = useCallback(async (): Promise<void> => {
    const result = await window.electronAPI.ai.getModelInfo()
    if (result.ok) setModel(result.data)
  }, [])

  const refreshConversations = useCallback(async (): Promise<void> => {
    const result = await window.electronAPI.ai.getConversations()
    if (result.ok) setConversations(result.data)
  }, [])

  const stopFlushTimer = useCallback((): void => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current)
      flushTimerRef.current = null
    }
  }, [])

  const setGeneratingFlag = useCallback((value: boolean): void => {
    setGenerating(value)
    document.documentElement.dataset.aiGenerating = value ? 'true' : 'false'
  }, [])

  const finishGeneration = useCallback((): void => {
    stopFlushTimer()
    bufferRef.current = ''
    requestIdRef.current = null
    setGeneratingFlag(false)
    void refreshStatus()
    void refreshConversations()
  }, [refreshConversations, refreshStatus, setGeneratingFlag, stopFlushTimer])

  // Single subscription set for the view lifetime; events are filtered by the
  // active request id so concurrent mounts can never cross streams.
  useEffect(() => {
    const offDelta = window.electronAPI.ai.onDelta((delta) => {
      if (delta.requestId !== requestIdRef.current) return
      bufferRef.current += delta.text
    })
    const offComplete = window.electronAPI.ai.onComplete((completion) => {
      if (completion.requestId !== requestIdRef.current) return
      finishGeneration()
    })
    const offError = window.electronAPI.ai.onError((error) => {
      if (error.requestId !== requestIdRef.current) return
      setNotice(error.message)
      setMessages((current) => current.filter((message) => !message.streaming))
      finishGeneration()
    })
    const offImport = window.electronAPI.ai.onImportProgress((progress) => {
      setImportProgress(progress)
    })
    return () => {
      offDelta()
      offComplete()
      offError()
      offImport()
    }
  }, [finishGeneration])

  // While generating, poll status so Thinking → Responding transitions surface
  // mid-generation (status otherwise refreshes only when generation ends).
  // Cheap synchronous IPC, active only during generation, no animation.
  useEffect(() => {
    if (!generating) return
    const timer = setInterval(() => {
      void refreshStatus()
    }, 1500)
    return () => clearInterval(timer)
  }, [generating, refreshStatus])

  // Open immediately; start the runtime in the background without freezing UI.
  useEffect(() => {
    void refreshStatus()
    void refreshModel()
    void refreshConversations()
    void window.electronAPI.ai
      .ensureReady()
      .then(() => refreshStatus())
      .catch(() => refreshStatus())
    return () => {
      stopFlushTimer()
      document.documentElement.dataset.aiGenerating = 'false'
    }
  }, [refreshConversations, refreshModel, refreshStatus, stopFlushTimer])

  const loadConversation = useCallback(async (id: string): Promise<void> => {
    setConversationId(id)
    setMessages([])
    setNotice(null)
    const result = await window.electronAPI.ai.getMessages(id)
    if (result.ok) setMessages(result.data.map(toUi))
  }, [])

  const handleNewChat = useCallback(async (): Promise<void> => {
    const result = await window.electronAPI.ai.newConversation()
    if (result.ok) {
      setConversations((current) => [result.data, ...current])
      setConversationId(result.data.id)
      setMessages([])
      setNotice(null)
    }
  }, [])

  const handleSend = useCallback(
    async (text: string): Promise<void> => {
      if (generating) return
      setNotice(null)

      let activeConversationId = stateRef.current.conversationId
      if (!activeConversationId) {
        const created = await window.electronAPI.ai.newConversation()
        if (!created.ok) {
          setNotice('Could not start a conversation. Try again.')
          return
        }
        activeConversationId = created.data.id
        setConversations((current) => [created.data, ...current])
        setConversationId(activeConversationId)
      }

      const history: SharedAiMessage[] = stateRef.current.messages
        .filter((message) => !message.streaming)
        .slice(-30)
        .map((message) => ({ id: message.id, role: message.role, content: message.content }))
      const userMessage: UiChatMessage = { id: uid(), role: 'user', content: text }
      const assistantMessage: UiChatMessage = {
        id: uid(),
        role: 'assistant',
        content: '',
        streaming: true
      }
      setMessages((current) => [
        ...current.filter((message) => !message.streaming),
        userMessage,
        assistantMessage
      ])

      const requestId = uid()
      requestIdRef.current = requestId
      bufferRef.current = ''
      setGeneratingFlag(true)

      flushTimerRef.current = setInterval(() => {
        const chunk = bufferRef.current
        if (!chunk) return
        bufferRef.current = ''
        const targetId = assistantMessage.id
        setMessages((current) =>
          current.map((message) =>
            message.id === targetId ? { ...message, content: message.content + chunk } : message
          )
        )
      }, 50)

      const started = await window.electronAPI.ai.chatStart({
        requestId,
        conversationId: activeConversationId,
        messages: [...history, { id: userMessage.id, role: 'user', content: text }]
      })
      if (!started.ok) {
        setNotice(started.error.message)
        setMessages((current) => current.filter((message) => message.id !== assistantMessage.id))
        finishGeneration()
        void refreshStatus()
      }
    },
    [finishGeneration, generating, refreshStatus, setGeneratingFlag]
  )

  const handleStop = useCallback((): void => {
    const requestId = requestIdRef.current
    if (requestId) void window.electronAPI.ai.chatCancel(requestId)
    setMessages((current) =>
      current.map((message) => (message.streaming ? { ...message, streaming: false } : message))
    )
    finishGeneration()
  }, [finishGeneration])

  const handleRetry = useCallback((): void => {
    setNotice(null)
    void window.electronAPI.ai
      .ensureReady()
      .then(() => refreshStatus())
      .catch(() => refreshStatus())
  }, [refreshStatus])

  const handleSelectModel = useCallback(async (): Promise<void> => {
    setImporting(true)
    setImportProgress(null)
    const result = await window.electronAPI.ai.selectModel()
    setImporting(false)
    if (result.ok) {
      setModel(result.data)
      setNotice(null)
      void window.electronAPI.ai.ensureReady().then(() => refreshStatus())
    } else if (result.error.code !== 'AI_GENERATION_CANCELLED') {
      setNotice(result.error.message)
    }
  }, [refreshStatus])

  const handleCancelImport = useCallback((): void => {
    void window.electronAPI.ai.cancelImport()
  }, [])

  const handleResend = useCallback((): void => {
    const lastUser = [...stateRef.current.messages]
      .reverse()
      .find((message) => message.role === 'user')
    if (lastUser && !generating) void handleSend(lastUser.content)
  }, [generating, handleSend])

  const ready = status?.state === 'ready' || status?.state === 'generating'
  const modelMissing = model !== null && !model.installed

  return (
    <div
      className={styles.container}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && generating) {
          event.stopPropagation()
          handleStop()
        }
      }}
    >
      <LiquidGlassSurface
        className={styles.shell}
        variant="strong"
        elevated
        layout
        transition={springs.spotlight}
      >
        <AiChatHeader
          conversations={conversations}
          conversationId={conversationId}
          onBack={onBack}
          onNewChat={() => void handleNewChat()}
          onSelectConversation={(id) => void loadConversation(id)}
        />
        <motion.div
          className={styles.body}
          variants={spotlightContent}
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <AiStatusPill
            status={status}
            model={model}
            generating={generating}
            onRetry={handleRetry}
            onSelectModel={() => void handleSelectModel()}
            onStop={handleStop}
          />
          {modelMissing ? (
            <div className={styles.setupPanel}>
              <div className={styles.setupTitle}>Gemma 4 12B model not found</div>
              <p className={styles.setupText}>
                DeepDive works fully offline. Select the {model.filename} file once and it is
                imported into the managed model folder — app updates never delete or re-download it.
              </p>
              {importing ? (
                <div className={styles.importProgress} role="status" aria-live="polite">
                  <div className={styles.importBar}>
                    <div
                      className={styles.importFill}
                      style={{
                        width: `${
                          importProgress && importProgress.totalBytes > 0
                            ? Math.min(
                                100,
                                Math.round(
                                  (importProgress.bytesCopied / importProgress.totalBytes) * 100
                                )
                              )
                            : 0
                        }%`
                      }}
                    />
                  </div>
                  <div className={styles.importMeta}>
                    <span>
                      {importProgress
                        ? `${Math.round(importProgress.bytesCopied / 1048576)} / ${Math.round(importProgress.totalBytes / 1048576)} MB`
                        : 'Starting import…'}
                    </span>
                    <button
                      type="button"
                      className={styles.noticeAction}
                      onClick={handleCancelImport}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.setupButton}
                  onClick={() => void handleSelectModel()}
                >
                  Select model file…
                </button>
              )}
            </div>
          ) : (
            <AiTranscript messages={messages} generating={generating} />
          )}
          {notice && (
            <div className={styles.notice} role="alert">
              <span>{notice}</span>
              <button type="button" className={styles.noticeAction} onClick={handleResend}>
                Retry
              </button>
            </div>
          )}
          {!modelMissing && (
            <AiComposer
              ready={ready}
              generating={generating}
              onSend={(text) => void handleSend(text)}
              onStop={handleStop}
              onKeyEscape={handleStop}
            />
          )}
        </motion.div>
      </LiquidGlassSurface>
    </div>
  )
}
