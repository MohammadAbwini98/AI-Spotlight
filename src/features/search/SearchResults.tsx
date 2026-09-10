import React, { useLayoutEffect, useMemo, useRef } from 'react'
import type { FileEntry } from '../../../electron/shared/types'
import { Icon } from '../../components/Icon/Icon'
import { categorizeEntries, type FileCategory } from './file-category'
import { SearchResultRow } from './SearchResultRow'
import { getNearestResultScrollTop } from './search-scroll'
import styles from './SearchResults.module.css'

interface SearchResultsProps {
  results: FileEntry[]
  selectedIndex: number
  isLoading: boolean
  query: string
  onSelect: (entry: FileEntry) => void
  onHover: (index: number) => void
  collapsedCategories: ReadonlySet<FileCategory>
  onToggleCategory: (category: FileCategory) => void
}

function SearchResultsComponent({
  results,
  selectedIndex,
  isLoading,
  query,
  onSelect,
  onHover,
  collapsedCategories,
  onToggleCategory
}: SearchResultsProps): React.ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null)
  const categories = useMemo(() => categorizeEntries(results), [results])
  const visibleIndexById = useMemo(() => {
    const indices = new Map<number, number>()
    let index = 0
    categories.forEach((category) => {
      if (collapsedCategories.has(category.id)) return
      category.entries.forEach(({ entry }) => {
        indices.set(entry.id, index)
        index += 1
      })
    })
    return indices
  }, [categories, collapsedCategories])
  const visibleResultCount = visibleIndexById.size

  useLayoutEffect(() => {
    const list = listRef.current
    const selectedResult = list?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')

    if (!list || !selectedResult) return

    if (selectedIndex === 0) {
      list.scrollTop = 0
      return
    }

    if (selectedIndex === visibleResultCount - 1) {
      list.scrollTop = list.scrollHeight - list.clientHeight
      return
    }

    const nextScrollTop = getNearestResultScrollTop(
      list.scrollTop,
      list.getBoundingClientRect(),
      selectedResult.getBoundingClientRect()
    )

    if (nextScrollTop !== null) {
      list.scrollTop = nextScrollTop
    }
  }, [results, selectedIndex, visibleResultCount])

  if (isLoading && results.length === 0) {
    return (
      <div className={styles.empty} aria-live="polite" aria-label="Searching…">
        <div className={styles.spinner} aria-hidden="true" />
        <span>Searching…</span>
      </div>
    )
  }

  if (!isLoading && results.length === 0 && query.trim()) {
    return (
      <div className={styles.empty} aria-live="polite">
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={styles.emptyIcon}
        >
          <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <path
            d="M21 21L28 28"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.4"
          />
          <path
            d="M14 10v4M14 16v1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span>
          No results for <strong>"{query}"</strong>
        </span>
        <span className={styles.emptyHint}>
          Try a different term, or run Sync to update the index
        </span>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      id="search-results"
      className={styles.list}
      role="region"
      aria-label="Search results"
    >
      {categories.map((category) => (
        <section
          className={styles.category}
          aria-labelledby={`search-category-${category.id}`}
          key={category.id}
        >
          <button
            className={styles.categoryHeader}
            id={`search-category-${category.id}`}
            type="button"
            aria-expanded={!collapsedCategories.has(category.id)}
            aria-controls={`search-category-results-${category.id}`}
            onClick={() => onToggleCategory(category.id)}
          >
            <Icon name={category.icon} size={13} />
            <span>{category.label}</span>
            <span className={styles.categoryCount}>{category.entries.length}</span>
            <svg
              className={styles.disclosure}
              data-collapsed={collapsedCategories.has(category.id)}
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3.5 4.75L6 7.25L8.5 4.75"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div
            id={`search-category-results-${category.id}`}
            role="listbox"
            aria-labelledby={`search-category-${category.id}`}
            hidden={collapsedCategories.has(category.id)}
          >
            {category.entries.map(({ entry }) => {
              const visibleIndex = visibleIndexById.get(entry.id)
              if (visibleIndex === undefined) return null
              return (
                <SearchResultRow
                  key={entry.id}
                  entry={entry}
                  index={visibleIndex}
                  isSelected={visibleIndex === selectedIndex}
                  query={query}
                  onSelect={onSelect}
                  onHover={onHover}
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export const SearchResults = React.memo(SearchResultsComponent)
SearchResults.displayName = 'SearchResults'
