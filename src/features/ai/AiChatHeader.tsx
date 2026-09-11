import React from 'react'
import { Icon } from '../../components/Icon/Icon'
import type { AiConversation } from '../../../electron/shared/types'
import styles from './AiChatView.module.css'

interface AiChatHeaderProps {
  conversations: AiConversation[]
  conversationId: string | null
  onBack: () => void
  onNewChat: () => void
  onSelectConversation: (id: string) => void
}

/** Chat header: back navigation, title, local-model pill, chat management. */
export function AiChatHeader({
  conversations,
  conversationId,
  onBack,
  onNewChat,
  onSelectConversation
}: AiChatHeaderProps): React.ReactElement {
  return (
    <div className={styles.header}>
      <button
        type="button"
        className={styles.headerButton}
        onClick={onBack}
        aria-label="Back to Spotlight"
        title="Back to Spotlight"
      >
        <Icon name="back" size={18} />
      </button>
      <div className={styles.headerTitle}>
        <span className={styles.headerName}>DeepDive AI</span>
        <span className={styles.modelPill} title="Runs locally on this machine">
          Gemma 4 12B ● Local
        </span>
      </div>
      {conversations.length > 0 && (
        <label className={styles.chatPicker}>
          <span className={styles.srOnly}>Choose conversation</span>
          <select
            className={styles.chatSelect}
            value={conversationId ?? ''}
            onChange={(event) => onSelectConversation(event.target.value)}
            aria-label="Choose conversation"
          >
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        className={styles.headerButton}
        onClick={onNewChat}
        aria-label="New chat"
        title="New chat"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  )
}
