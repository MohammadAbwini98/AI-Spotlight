import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getNearestResultScrollTop } from '../src/features/search/search-scroll'

describe('search result keyboard scrolling', () => {
  it('scrolls down just enough to reveal the next selected result', () => {
    expect(
      getNearestResultScrollTop(40, { top: 100, bottom: 300 }, { top: 280, bottom: 340 })
    ).toBe(80)
  })

  it('scrolls up just enough to reveal the previous selected result', () => {
    expect(
      getNearestResultScrollTop(140, { top: 100, bottom: 300 }, { top: 60, bottom: 120 })
    ).toBe(100)
  })

  it('does not move the list when the selected result is already visible', () => {
    expect(
      getNearestResultScrollTop(80, { top: 100, bottom: 300 }, { top: 140, bottom: 200 })
    ).toBeNull()
  })

  it('does not let pointer entry override keyboard scrolling', () => {
    const resultRow = readFileSync('src/features/search/SearchResultRow.tsx', 'utf8')
    const results = readFileSync('src/features/search/SearchResults.tsx', 'utf8')

    expect(resultRow).toContain('onPointerMove={() => onHover(index)}')
    expect(resultRow).not.toContain('onPointerEnter={() => onHover(index)}')
    expect(results).toContain('[role="option"][aria-selected="true"]')
    expect(results).toContain('if (selectedIndex === 0)')
    expect(results).toContain('list.scrollTop = list.scrollHeight - list.clientHeight')
    expect(results).toContain('list.scrollTop = nextScrollTop')
  })

  it('keeps category disclosure state aligned with visible keyboard results', () => {
    const searchView = readFileSync('src/features/search/SearchView.tsx', 'utf8')
    const results = readFileSync('src/features/search/SearchResults.tsx', 'utf8')

    expect(searchView).toContain('collapsedCategories')
    expect(searchView).toContain('visibleOrderedResults')
    expect(results).toContain('aria-expanded={!collapsedCategories.has(category.id)}')
    expect(results).toContain('hidden={collapsedCategories.has(category.id)}')
    expect(results).toContain('visibleIndexById')
  })

  it('opens selected paths through history-aware IPC instead of only revealing Explorer', () => {
    const searchView = readFileSync('src/features/search/SearchView.tsx', 'utf8')

    expect(searchView).toContain('window.electronAPI.search.openFile(entry.id)')
    expect(searchView).not.toContain('window.electronAPI.search.showInExplorer(entry.id)')
    expect(searchView).toContain('void loadRecentFiles()')
  })
})
