import React from 'react'
import type { IndexerProgress, SyncStatus } from '../../../electron/shared/types'
import styles from './SyncStatusBar.module.css'

interface SyncStatusBarProps {
  progress: IndexerProgress | null
  syncStatus: SyncStatus | null
  onCancel: () => void
}

export function SyncStatusBar({
  progress,
  syncStatus,
  onCancel
}: SyncStatusBarProps): React.ReactElement {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never'
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(dateString))
  }

  // Active progress has priority over status
  if (progress) {
    const isActive =
      progress.state === 'preparing' ||
      progress.state === 'scanning' ||
      progress.state === 'reconciling' ||
      progress.state === 'paused' ||
      progress.state === 'cancelling'
    const isSuccess = progress.state === 'complete' || progress.state === 'complete_with_warnings'
    const isFailed = progress.state === 'failed' || progress.state === 'cancelled'

    return (
      <div className={styles.bar} role="status" aria-live="polite">
        <div className={styles.status}>
          {isActive && <div className={styles.spinner} aria-hidden="true" />}
          {isSuccess && <span className={styles.successDot} />}
          {isFailed && <span className={styles.errorDot} />}

          <span className={styles.text}>
            {isActive && formatActiveProgress(progress)}
            {isSuccess &&
              `Sync complete: ${progress.added} added, ${progress.updated} updated, ${progress.newlyUnavailable} unavailable`}
            {isFailed && `Sync ${progress.state}`}
          </span>
        </div>
        {isActive && progress.state !== 'cancelling' && (
          <button className={styles.cancelButton} type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    )
  }

  // Idle status
  return (
    <div className={styles.bar} role="status">
      <div className={styles.status}>
        <span className={styles.text}>Last sync: {formatDate(syncStatus?.lastSyncAt ?? null)}</span>
      </div>
    </div>
  )
}

function formatActiveProgress(progress: IndexerProgress): string {
  if (progress.state === 'preparing') return 'Preparing index...'
  if (progress.state === 'reconciling') return 'Reconciling unavailable files...'
  if (progress.state === 'paused') return `Paused at ${progress.discovered.toLocaleString()} items`
  if (progress.state === 'cancelling') return 'Cancelling safely...'
  return `Scanning ${progress.discovered.toLocaleString()} items · ${progress.throughputPerSecond.toLocaleString()}/s · ${progress.errors} errors`
}
