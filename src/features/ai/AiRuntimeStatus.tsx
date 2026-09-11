import React from 'react'
import type { AiModelInfo, AiRuntimeStatus } from '../../../electron/shared/types'
import styles from './AiChatView.module.css'

interface AiRuntimeStatusProps {
  status: AiRuntimeStatus | null
  model: AiModelInfo | null
  generating: boolean
  onRetry: () => void
  onSelectModel: () => void
  onStop: () => void
}

/** Compact status pill: never a bare spinner, always an understandable state. */
export function AiRuntimeStatus({
  status,
  model,
  generating,
  onRetry,
  onSelectModel,
  onStop
}: AiRuntimeStatusProps): React.ReactElement {
  const state = status?.state ?? 'stopped'
  const modelLabel = model?.name ?? 'Gemma 4 12B'

  let text = 'Checking AI status…'
  let tone: 'idle' | 'busy' | 'ready' | 'error' = 'idle'
  let action: React.ReactNode = null

  switch (state) {
    case 'starting':
      text = `Starting ${modelLabel}…`
      tone = 'busy'
      break
    case 'loading':
      text = `Loading ${modelLabel}…`
      tone = 'busy'
      break
    case 'ready':
      text = generating ? 'Generating… your files stay untouched' : `${modelLabel} ● Local`
      tone = generating ? 'busy' : 'ready'
      if (generating) {
        action = (
          <button type="button" className={styles.statusAction} onClick={onStop}>
            Stop
          </button>
        )
      }
      break
    case 'generating':
      text = 'Generating… your files stay untouched'
      tone = 'busy'
      action = (
        <button type="button" className={styles.statusAction} onClick={onStop}>
          Stop
        </button>
      )
      break
    case 'error': {
      tone = 'error'
      const code = status?.errorCode
      if (
        code === 'AI_MODEL_NOT_FOUND' ||
        code === 'AI_MODEL_INVALID' ||
        code === 'AI_MODEL_HASH_MISMATCH' ||
        code === 'AI_MODEL_UNSUPPORTED'
      ) {
        text = 'Model unavailable — select a valid GGUF to continue'
        action = (
          <button type="button" className={styles.statusAction} onClick={onSelectModel}>
            Select model
          </button>
        )
      } else if (code === 'AI_RUNTIME_NOT_FOUND') {
        text = 'AI runtime is not installed'
      } else {
        text = 'AI runtime stopped — nothing was lost'
        action = (
          <button type="button" className={styles.statusAction} onClick={onRetry}>
            Restart AI
          </button>
        )
      }
      break
    }
    case 'stopped':
      text = model?.installed === false ? 'Model not installed' : 'AI is off'
      break
  }

  return (
    <div className={styles.statusBar} role="status" aria-live="polite">
      <span className={`${styles.statusDot} ${styles[`dot-${tone}`]}`} aria-hidden="true" />
      <span className={styles.statusText}>{text}</span>
      {action}
    </div>
  )
}
