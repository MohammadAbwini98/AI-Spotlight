import React, { useState } from 'react'
import { Icon } from '../../components/Icon/Icon'
import { LiquidGlassSurface } from '../../components/LiquidGlassSurface/LiquidGlassSurface'
import styles from './AiChatView.module.css'

interface AiComposerProps {
  ready: boolean
  generating: boolean
  onSend: (text: string) => void
  onStop: () => void
  onKeyEscape: () => void
}

/** Multiline composer. Enter sends, Shift+Enter adds a newline. */
export function AiComposer({
  ready,
  generating,
  onSend,
  onStop,
  onKeyEscape
}: AiComposerProps): React.ReactElement {
  const [value, setValue] = useState('')

  const submit = (): void => {
    const text = value.trim()
    if (!text || !ready || generating) return
    setValue('')
    onSend(text)
  }

  return (
    <div className={styles.composer}>
      <LiquidGlassSurface className={styles.composerBox} variant="strong" elevated={false}>
        <label className={styles.srOnly} htmlFor="ai-composer-input">
          Ask DeepDive AI
        </label>
        <textarea
          id="ai-composer-input"
          className={styles.composerInput}
          placeholder={ready ? 'Ask DeepDive AI…' : 'Starting the local model…'}
          value={value}
          rows={2}
          disabled={!ready}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            } else if (event.key === 'Escape' && generating) {
              event.preventDefault()
              onKeyEscape()
            }
          }}
        />
        {generating ? (
          <button
            type="button"
            className={styles.sendButton}
            onClick={onStop}
            aria-label="Stop generation"
            title="Stop generation"
          >
            <Icon name="close" size={16} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.sendButton}
            onClick={submit}
            disabled={!ready || value.trim().length === 0}
            aria-label="Send message"
            title="Send (Enter)"
          >
            <Icon name="back" size={16} />
          </button>
        )}
      </LiquidGlassSurface>
      <div className={styles.composerHint}>Enter sends · Shift+Enter adds a line · Esc stops</div>
    </div>
  )
}
