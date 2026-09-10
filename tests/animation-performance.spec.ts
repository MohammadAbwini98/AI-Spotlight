import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readSource = (path: string): string => readFileSync(path, 'utf8')

describe('animation performance protections', () => {
  it('does not apply CSS transitions to Framer Motion action properties', () => {
    const css = readSource('src/features/search/SearchBar.module.css')
    const actionsRule = css.match(/\.actions\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(actionsRule).not.toContain('transition:')
    expect(css).not.toContain('.barExpanded .actions')
  })

  it('keeps row transforms under one animation engine', () => {
    const searchRows = readSource('src/features/search/SearchResultRow.module.css')
    const taskRows = readSource('src/features/todo/TaskList.module.css')
    const searchRowRule = searchRows.match(/\.row\s*\{([^}]*)\}/)?.[1] ?? ''
    const taskRowRule = taskRows.match(/\.row\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(searchRowRule).not.toContain('transition: all')
    expect(searchRowRule).not.toMatch(/transition:[^;]*transform/)
    expect(taskRowRule).not.toContain('transition: all')
    expect(taskRowRule).not.toMatch(/transition:[^;]*transform/)
  })

  it('preserves the original sequential screen choreography', () => {
    const app = readSource('src/App.tsx')

    expect(app).toMatch(/className=\{styles\.root\}\s+layout/)
    expect(app).toContain('<AnimatePresence mode="wait">')
  })

  it('honors both system and in-app reduced-motion preferences', () => {
    const app = readSource('src/App.tsx')
    const globalStyles = readSource('src/design/global.css')

    expect(app).toContain(
      "<MotionConfig reducedMotion={settings?.reducedMotion ? 'always' : 'user'}>"
    )
    expect(globalStyles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(globalStyles).toContain(":root[data-reduced-motion='true'] *")
    expect(globalStyles).not.toContain(
      '@media (prefers-reduced-motion: reduce), [data-reduced-motion'
    )
  })

  it('pre-sizes the native window before the Recent Files transition', () => {
    const searchView = readSource('src/features/search/SearchView.tsx')
    const resizePosition = searchView.indexOf('window.electronAPI.app.setHeight(SEARCH_HEIGHT)')
    const expandPosition = searchView.indexOf('onExpand(true)', resizePosition)

    expect(resizePosition).toBeGreaterThan(-1)
    expect(expandPosition).toBeGreaterThan(resizePosition)
  })

  it('reveals compact actions only while Spotlight owns focus', () => {
    const searchBar = readSource('src/features/search/SearchBar.tsx')
    const motion = readSource('src/design/motion.ts')

    expect(searchBar).toContain('!isExpanded && isFocusWithin')
    expect(searchBar).toContain('layout="size"')
    expect(searchBar).toContain('springs.spotlightFocus')
    expect(motion).toContain('spotlightFocus:')
  })

  it('keeps the sync button icon static while synchronization runs', () => {
    const searchBar = readSource('src/features/search/SearchBar.tsx')

    expect(searchBar).not.toContain('animate={isSyncing ? { rotate: 360 }')
    expect(searchBar).not.toContain('repeat: Infinity')
    expect(searchBar).toContain('<Icon name="sync" size={24} className={styles.actionIcon} />')
    expect(searchBar).toContain('disabled={isSyncing}')
    expect(searchBar).toContain("aria-label={isSyncing ? 'Syncing files' : 'Sync files'}")
  })
})
