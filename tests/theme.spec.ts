import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../src/design/theme'

describe('resolveTheme', () => {
  it('follows the system light preference', () => {
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('follows the system dark preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
  })

  it('preserves an explicit theme regardless of the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('does not replace compact dark-theme materials with the light override', () => {
    const tokens = readFileSync('src/design/tokens.css', 'utf8')
    const searchBar = readFileSync('src/features/search/SearchBar.module.css', 'utf8')

    expect(tokens).toContain(
      ":root:not([data-theme='dark']):not([data-reduced-transparency='true'])"
    )
    expect(tokens).not.toContain(
      ":root:not([data-reduced-transparency='true']) {\n  --spotlight-search-bg"
    )
    expect(searchBar).toContain(":global([data-theme='dark']) .bar")
  })

  it('removes the native Windows frame behind the transparent application shell', () => {
    const mainProcess = readFileSync('electron/main/index.ts', 'utf8')

    expect(mainProcess).toContain('transparent: true')
    expect(mainProcess).toContain("backgroundMaterial: 'none'")
    expect(mainProcess).toContain('hasShadow: false')
    expect(mainProcess).toContain('thickFrame: false')
    expect(mainProcess).toContain('roundedCorners: false')
  })

  it('does not draw an exterior renderer shadow around the application shell', () => {
    const tokens = readFileSync('src/design/tokens.css', 'utf8')
    const surfaces = readFileSync(
      'src/components/LiquidGlassSurface/LiquidGlassSurface.module.css',
      'utf8'
    )
    const compactShadows = [...tokens.matchAll(/--spotlight-(?:search|action)-shadow:\s*([^;]+);/g)]

    expect(compactShadows).toHaveLength(8)
    compactShadows.forEach(([, value]) => expect(value.trim()).toMatch(/^inset\b/))
    expect(surfaces).toMatch(/\.elevated\s*{\s*box-shadow:\s*none;/)
  })
})
