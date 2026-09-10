import React, { forwardRef } from 'react'
import { motion } from 'framer-motion'
import type { FileEntry } from '../../../electron/shared/types'
import { Icon } from '../../components/Icon/Icon'
import { resultRow } from '../../design/motion'
import { getFileIcon } from './file-category'
import styles from './SearchResultRow.module.css'

interface SearchResultRowProps {
  entry: FileEntry
  index: number
  isSelected: boolean
  query: string
  onSelect: (entry: FileEntry) => void
  onHover: (index: number) => void
}

const SearchResultRowComponent = forwardRef<HTMLDivElement, SearchResultRowProps>(
  ({ entry, index, isSelected, query, onSelect, onHover }, ref) => {
    const [copied, setCopied] = React.useState(false)

    const handleCopyPath = (e: React.MouseEvent) => {
      e.stopPropagation()
      navigator.clipboard.writeText(entry.displayPath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    // Highlight matched text
    const highlightMatches = (text: string, term: string) => {
      if (!term.trim()) return text
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
      const parts = text.split(regex)
      return parts.map((part, i) =>
        regex.test(part) ? (
          <strong key={i} className={styles.highlight}>
            {part}
          </strong>
        ) : (
          part
        )
      )
    }

    return (
      <motion.div
        ref={ref}
        className={`${styles.row} ${isSelected ? styles.selected : ''} ${!entry.isAvailable ? styles.unavailable : ''}`}
        variants={resultRow}
        custom={index}
        initial="hidden"
        animate="visible"
        whileHover={{
          y: -1,
          transition: { duration: 0.14, ease: [0.25, 0.1, 0.25, 1] }
        }}
        onClick={() => onSelect(entry)}
        onPointerMove={() => onHover(index)}
        role="option"
        aria-selected={isSelected}
      >
        <div className={styles.iconWrapper} aria-hidden="true">
          <Icon
            name={getFileIcon(entry)}
            size={20}
            className={entry.entryType === 'directory' ? styles.folderIcon : styles.fileIcon}
          />
        </div>

        <div className={styles.content}>
          <div className={styles.nameLine}>
            <span className={styles.name}>{highlightMatches(entry.name, query)}</span>
            {!entry.isAvailable && <span className={styles.offlineBadge}>Unavailable</span>}
          </div>
          <div className={styles.pathLine}>
            <span className={styles.path}>{highlightMatches(entry.displayPath, query)}</span>
          </div>
        </div>

        {isSelected && (
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              onClick={handleCopyPath}
              title="Copy Path"
              aria-label="Copy Path"
            >
              {copied ? <Icon name="check" size={14} /> : <Icon name="copy" size={14} />}
            </button>
          </div>
        )}
      </motion.div>
    )
  }
)

export const SearchResultRow = React.memo(SearchResultRowComponent)
SearchResultRow.displayName = 'SearchResultRow'
