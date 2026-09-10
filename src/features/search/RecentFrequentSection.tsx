import React from 'react'
import type { FileEntry } from '../../../electron/shared/types'
import { SearchResultRow } from './SearchResultRow'
import styles from './RecentFrequentSection.module.css'

interface RecentFrequentSectionProps {
  recent: FileEntry[]
  frequent: FileEntry[]
  isLoading: boolean
  onSelect: (entry: FileEntry) => void
  onBack: () => void
}

const ignoreHover = (): void => undefined

function RecentFrequentSectionComponent({
  recent,
  frequent,
  isLoading,
  onSelect,
  onBack
}: RecentFrequentSectionProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button
          className={styles.backButton}
          type="button"
          onClick={onBack}
          aria-label="Back to Spotlight"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 3.75L5.75 8L10 12.25"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <h2 className={styles.title}>Recent files</h2>
      </div>

      {recent.length === 0 && frequent.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.hint}>
            {isLoading
              ? 'Loading recent files…'
              : 'Search to find files, or run Sync if the index is empty.'}
          </span>
        </div>
      )}

      {recent.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Recently Opened</h3>
          <div className={styles.list}>
            {recent.map((entry, i) => (
              <SearchResultRow
                key={`recent-${entry.id}`}
                entry={entry}
                index={i}
                isSelected={false}
                query=""
                onSelect={onSelect}
                onHover={ignoreHover}
              />
            ))}
          </div>
        </section>
      )}

      {frequent.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Frequently Opened</h3>
          <div className={styles.list}>
            {frequent.map((entry, i) => (
              <SearchResultRow
                key={`frequent-${entry.id}`}
                entry={entry}
                index={i + recent.length}
                isSelected={false}
                query=""
                onSelect={onSelect}
                onHover={ignoreHover}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export const RecentFrequentSection = React.memo(RecentFrequentSectionComponent)
RecentFrequentSection.displayName = 'RecentFrequentSection'
