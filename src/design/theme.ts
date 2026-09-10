import type { Theme } from '../../electron/shared/types'

export type ResolvedTheme = Exclude<Theme, 'system'>

/** Resolves the persisted theme preference against the current OS scheme. */
export function resolveTheme(theme: Theme, systemIsDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemIsDark ? 'dark' : 'light'
  return theme
}
