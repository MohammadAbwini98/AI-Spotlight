import React, { useState } from 'react'
import { Icon } from '../../components/Icon/Icon'
import { renderAiMarkdown } from './ai-markdown'
import styles from './AiChatView.module.css'

export interface UiChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

interface AiMessageProps {
  message: UiChatMessage
}

/** Single chat bubble. Assistant output uses the safe Markdown projection. */
export function AiMessage({ message }: AiMessageProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = (): void => {
    try {
      const done = (): void => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
      const result = navigator.clipboard?.writeText(message.content)
      if (result && typeof result.then === 'function') {
        result.then(done).catch(() => undefined)
      } else {
        done()
      }
    } catch {
      // Clipboard is best-effort; the message remains visible.
    }
  }

  return (
    <div className={`${styles.message} ${isUser ? styles.messageUser : styles.messageAi}`}>
      <div className={styles.messageLabel}>{isUser ? 'You' : 'Gemma'}</div>
      {isUser ? (
        <div className={styles.messageBody}>{message.content}</div>
      ) : (
        <div
          className={styles.messageBody}
          // Content is escaped then restricted to a safe tag set in ai-markdown.
          dangerouslySetInnerHTML={{ __html: renderAiMarkdown(message.content) }}
        />
      )}
      {!isUser && !message.streaming && message.content && (
        <button
          type="button"
          className={styles.copyButton}
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy response'}
          title={copied ? 'Copied' : 'Copy response'}
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}
      {message.streaming && (
        <span className={styles.streamingHint} aria-hidden="true">
          <span className={styles.streamingCaret} />
        </span>
      )}
    </div>
  )
}
