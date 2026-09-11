import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '../../components/Icon/Icon'
import { LiquidGlassSurface } from '../../components/LiquidGlassSurface/LiquidGlassSurface'
import { springs, spotlightActions } from '../../design/motion'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  query: string
  onChange: (value: string) => void
  onFocus: () => void
  onAiClick: () => void
  onTodoClick: () => void
  onSyncClick: () => void
  onSettingsClick: () => void
  onRecentClick: () => void
  isSyncing: boolean
  isExpanded: boolean
}

function SearchBarComponent({
  query,
  onChange,
  onFocus,
  onAiClick,
  onTodoClick,
  onSyncClick,
  onSettingsClick,
  onRecentClick,
  isSyncing,
  isExpanded
}: SearchBarProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocusWithin, setIsFocusWithin] = useState(true)

  useEffect(() => {
    inputRef.current?.focus()
    const handleWindowBlur = (): void => setIsFocusWithin(false)
    window.addEventListener('blur', handleWindowBlur)
    return () => window.removeEventListener('blur', handleWindowBlur)
  }, [])

  return (
    <div
      className={`${styles.bar} ${isExpanded ? styles.barExpanded : ''}`}
      role="search"
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusWithin(false)
        }
      }}
    >
      <LiquidGlassSurface
        className={`${styles.searchPill} ${isExpanded ? styles.searchPillExpanded : ''}`}
        variant={isExpanded ? 'transparent' : 'strong'}
        elevated={!isExpanded}
        layout="size"
        transition={isExpanded ? springs.spotlight : springs.spotlightFocus}
      >
        <Icon name="search" size={24} className={styles.searchIcon} />

        <input
          ref={inputRef}
          id="spotlight-search-input"
          className={styles.input}
          type="search"
          placeholder="Spotlight Search"
          value={query}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Spotlight Search"
          aria-autocomplete="list"
          aria-controls="search-results"
        />

        {query && (
          <motion.button
            className={styles.clearBtn}
            type="button"
            onClick={() => onChange('')}
            whileTap={{ scale: 0.9 }}
            aria-label="Clear search"
            title="Clear"
          >
            <Icon name="close" size={12} />
          </motion.button>
        )}
      </LiquidGlassSurface>

      <AnimatePresence initial={false}>
        {!isExpanded && isFocusWithin && (
          <motion.div
            key="spotlight-actions"
            className={styles.actions}
            variants={spotlightActions}
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <LiquidGlassSurface
              className={styles.actionBtn}
              variant="strong"
              elevated
              as="button"
              onClick={onAiClick}
              title="Open AI Assistant"
              aria-label="Open AI Assistant"
            >
              <Icon name="ai" size={24} className={styles.actionIcon} />
            </LiquidGlassSurface>

            <LiquidGlassSurface
              className={styles.actionBtn}
              variant="strong"
              elevated
              as="button"
              onClick={onSyncClick}
              disabled={isSyncing}
              title={isSyncing ? 'Syncing…' : 'Sync files'}
              aria-label={isSyncing ? 'Syncing files' : 'Sync files'}
            >
              <Icon name="sync" size={24} className={styles.actionIcon} />
            </LiquidGlassSurface>

            <LiquidGlassSurface
              className={styles.actionBtn}
              variant="strong"
              elevated
              as="button"
              onClick={onTodoClick}
              title="Open Todo"
              aria-label="Open Todo"
            >
              <Icon name="tasks" size={24} className={styles.actionIcon} />
            </LiquidGlassSurface>

            <LiquidGlassSurface
              className={styles.actionBtn}
              variant="strong"
              elevated
              as="button"
              onClick={onSettingsClick}
              title="Settings"
              aria-label="Open settings"
            >
              <Icon name="settings" size={24} className={styles.actionIcon} />
            </LiquidGlassSurface>

            <LiquidGlassSurface
              className={styles.actionBtn}
              variant="strong"
              elevated
              as="button"
              onClick={onRecentClick}
              title="Recent files"
              aria-label="Show recent files"
            >
              <Icon name="recent" size={24} className={styles.actionIcon} />
            </LiquidGlassSurface>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const SearchBar = React.memo(SearchBarComponent)
SearchBar.displayName = 'SearchBar'
