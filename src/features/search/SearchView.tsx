import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LiquidGlassSurface } from '../../components/LiquidGlassSurface/LiquidGlassSurface'
import type { FileEntry, IndexerProgress, SyncStatus } from '../../../electron/shared/types'
import { SearchBar } from './SearchBar'
import { SearchResults } from './SearchResults'
import { categorizeEntries, type FileCategory } from './file-category'
import { RecentFrequentSection } from './RecentFrequentSection'
import { SyncStatusBar } from './SyncStatusBar'
import { SEARCH_HEIGHT, springs, spotlightContent } from '../../design/motion'
import styles from './SearchView.module.css'

interface SearchViewProps {
  isExpanded: boolean
  onExpand: (expanded: boolean) => void
  onOpenTodo: () => void
  onOpenSettings: () => void
  onOpenAi: () => void
}

let requestId = 0

interface RecentFilesState {
  recent: FileEntry[]
  frequent: FileEntry[]
  isLoading: boolean
}

let recentFilesCache: RecentFilesState = {
  recent: [],
  frequent: [],
  isLoading: true
}

export function SearchView({
  isExpanded,
  onExpand,
  onOpenTodo,
  onOpenSettings,
  onOpenAi
}: SearchViewProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FileEntry[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isSearching, setIsSearching] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<FileCategory>>(() => new Set())
  const [syncProgress, setSyncProgress] = useState<IndexerProgress | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [recentFiles, setRecentFiles] = useState<RecentFilesState>(recentFilesCache)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentLoadRef = useRef<Promise<void> | null>(null)
  const categorizedResults = useMemo(() => categorizeEntries(results), [results])
  const orderedResults = useMemo(
    () => categorizedResults.flatMap((category) => category.entries.map(({ entry }) => entry)),
    [categorizedResults]
  )
  const visibleOrderedResults = useMemo(
    () =>
      categorizedResults
        .filter((category) => !collapsedCategories.has(category.id))
        .flatMap((category) => category.entries.map(({ entry }) => entry)),
    [categorizedResults, collapsedCategories]
  )

  const loadRecentFiles = useCallback((): Promise<void> => {
    if (recentLoadRef.current) return recentLoadRef.current

    if (recentFilesCache.recent.length === 0 && recentFilesCache.frequent.length === 0) {
      recentFilesCache = { ...recentFilesCache, isLoading: true }
      setRecentFiles(recentFilesCache)
    }

    const request = Promise.all([
      window.electronAPI.search.getRecent(5),
      window.electronAPI.search.getFrequent(5)
    ]).then(([recentResult, frequentResult]) => {
      recentFilesCache = {
        recent: recentResult.ok ? recentResult.data : recentFilesCache.recent,
        frequent: frequentResult.ok ? frequentResult.data : recentFilesCache.frequent,
        isLoading: false
      }
      setRecentFiles(recentFilesCache)
    })

    recentLoadRef.current = request.finally(() => {
      recentLoadRef.current = null
    })
    return recentLoadRef.current
  }, [])

  // Subscribe to indexer progress
  useEffect(() => {
    const unsubscribe = window.electronAPI.indexer.onProgress((progress) => {
      setSyncProgress(progress)
      if (
        progress.state === 'complete' ||
        progress.state === 'complete_with_warnings' ||
        progress.state === 'failed' ||
        progress.state === 'cancelled'
      ) {
        setTimeout(
          () => setSyncProgress((current) => (current?.runId === progress.runId ? null : current)),
          3000
        )
      }
    })
    // Load initial sync status
    window.electronAPI.indexer.getStatus().then((r) => {
      if (r.ok) setSyncStatus(r.data)
    })
    return unsubscribe
  }, [])

  // Prefetch once while the compact Spotlight UI is idle so Recent Files opens immediately.
  useEffect(() => {
    void loadRecentFiles()
  }, [loadRecentFiles])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }

    onExpand(true)
    setIsSearching(true)
    const currentId = ++requestId

    debounceRef.current = setTimeout(async () => {
      const res = await window.electronAPI.search.query({ text: query, requestId: currentId })
      if (res.ok && res.data.requestId === currentId) {
        setResults(res.data.entries)
        setSelectedIndex(0)
      }
      setIsSearching(false)
    }, 120)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, onExpand])

  const openFile = useCallback(
    async (entry: FileEntry) => {
      const res = await window.electronAPI.search.openFile(entry.id)
      if (!res.ok) {
        console.error('Open failed:', res.error.message)
        return
      }
      void loadRecentFiles()
    },
    [loadRecentFiles]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isExpanded || visibleOrderedResults.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, visibleOrderedResults.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          setSelectedIndex((i) => Math.max(i - 1, 0))
        } else {
          setSelectedIndex((i) => Math.min(i + 1, visibleOrderedResults.length - 1))
        }
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (visibleOrderedResults[selectedIndex]) openFile(visibleOrderedResults[selectedIndex])
      } else if (e.key === 'Home') {
        e.preventDefault()
        setSelectedIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setSelectedIndex(visibleOrderedResults.length - 1)
      }
    },
    [isExpanded, openFile, selectedIndex, visibleOrderedResults]
  )

  const handleSync = useCallback(() => {
    window.electronAPI.indexer.startSync()
  }, [])

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (!value) {
        onExpand(false)
        setResults([])
      }
    },
    [onExpand]
  )

  const handleSearchFocus = useCallback(() => {
    if (query) onExpand(true)
  }, [onExpand, query])

  const handleRecentClick = useCallback(() => {
    // Give the native transparent window its final bounds before React starts
    // the panel transition so Windows resizing cannot interrupt the first frame.
    window.electronAPI.app.setHeight(SEARCH_HEIGHT)
    onExpand(true)
    void loadRecentFiles()
  }, [loadRecentFiles, onExpand])

  const handleBackFromRecent = useCallback(() => onExpand(false), [onExpand])
  const handleToggleCategory = useCallback((category: FileCategory) => {
    setCollapsedCategories((current) => {
      const next = new Set(current)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
    setSelectedIndex(0)
  }, [])

  return (
    <div className={styles.container} onKeyDown={handleKeyDown}>
      <LiquidGlassSurface
        className={`${styles.shell} ${isExpanded ? styles.shellExpanded : ''}`}
        variant={isExpanded ? 'strong' : 'transparent'}
        elevated={isExpanded}
        layout
        transition={springs.spotlight}
      >
        <SearchBar
          query={query}
          onChange={handleQueryChange}
          onFocus={handleSearchFocus}
          onAiClick={onOpenAi}
          onTodoClick={onOpenTodo}
          onSyncClick={handleSync}
          onSettingsClick={onOpenSettings}
          onRecentClick={handleRecentClick}
          isSyncing={Boolean(
            syncProgress &&
            ['preparing', 'scanning', 'reconciling', 'paused', 'cancelling'].includes(
              syncProgress.state
            )
          )}
          isExpanded={isExpanded}
        />

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              className={styles.expandedContent}
              variants={spotlightContent}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              {query.trim() ? (
                <SearchResults
                  results={orderedResults}
                  selectedIndex={selectedIndex}
                  isLoading={isSearching}
                  query={query}
                  onSelect={openFile}
                  onHover={setSelectedIndex}
                  collapsedCategories={collapsedCategories}
                  onToggleCategory={handleToggleCategory}
                />
              ) : (
                <RecentFrequentSection
                  recent={recentFiles.recent}
                  frequent={recentFiles.frequent}
                  isLoading={recentFiles.isLoading}
                  onSelect={openFile}
                  onBack={handleBackFromRecent}
                />
              )}

              <SyncStatusBar
                progress={syncProgress}
                syncStatus={syncStatus}
                onCancel={() => void window.electronAPI.indexer.cancelSync()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </LiquidGlassSurface>
    </div>
  )
}
