export const PRIMARY_SPOTLIGHT_SHORTCUT = 'CommandOrControl+Space'
export const FALLBACK_SPOTLIGHT_SHORTCUT = 'CommandOrControl+Shift+Space'

export interface SpotlightShortcutRegistration {
  accelerator: string | null
  usedFallback: boolean
}

type ShortcutRegistrar = (accelerator: string, callback: () => void) => boolean

export function registerSpotlightShortcut(
  register: ShortcutRegistrar,
  toggleWindow: () => void
): SpotlightShortcutRegistration {
  if (register(PRIMARY_SPOTLIGHT_SHORTCUT, toggleWindow)) {
    return { accelerator: PRIMARY_SPOTLIGHT_SHORTCUT, usedFallback: false }
  }

  if (register(FALLBACK_SPOTLIGHT_SHORTCUT, toggleWindow)) {
    return { accelerator: FALLBACK_SPOTLIGHT_SHORTCUT, usedFallback: true }
  }

  return { accelerator: null, usedFallback: false }
}
