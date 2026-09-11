import React, { useEffect, useRef } from 'react'
import { AiMessage, type UiChatMessage } from './AiMessage'
import styles from './AiChatView.module.css'

interface AiConversationProps {
  messages: UiChatMessage[]
  generating: boolean
}

/**
 * Scrollable transcript. Auto-follows new tokens only while the user is
 * already near the bottom; manual scroll position is otherwise preserved.
 * A single polite live region announces completion, never every token.
 */
export function AiConversation({ messages, generating }: AiConversationProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    const node = scrollRef.current
    if (node && stickRef.current) {
      node.scrollTop = node.scrollHeight
    }
  }, [messages, generating])

  const handleScroll = (): void => {
    const node = scrollRef.current
    if (!node) return
    stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96
  }

  if (messages.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyTitle}>How can I help?</div>
        <div className={styles.emptySubtitle}>
          Local answers from Gemma 4 12B. Your files are never read unless you paste text here.
        </div>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={styles.conversation}
      role="log"
      aria-label="AI conversation"
      aria-live="off"
      onScroll={handleScroll}
    >
      {messages.map((message) => (
        <AiMessage key={message.id} message={message} />
      ))}
      <span className={styles.srOnly} role="status" aria-live="polite">
        {generating ? 'Gemma is responding.' : 'Response complete.'}
      </span>
    </div>
  )
}
