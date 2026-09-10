import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  FALLBACK_SPOTLIGHT_SHORTCUT,
  PRIMARY_SPOTLIGHT_SHORTCUT,
  registerSpotlightShortcut
} from '../electron/main/window-shortcuts'

describe('Spotlight global shortcut recovery', () => {
  it('registers the shortcut before optional tray setup can fail', () => {
    const mainProcess = readFileSync('electron/main/index.ts', 'utf8')
    const createWindowPosition = mainProcess.indexOf('createWindow()\n  const shortcutRegistration')
    const registerPosition = mainProcess.indexOf(
      'const shortcutRegistration = registerGlobalShortcut()',
      createWindowPosition
    )
    const trayPosition = mainProcess.indexOf('createTray(shortcutRegistration)', registerPosition)

    expect(createWindowPosition).toBeGreaterThan(-1)
    expect(registerPosition).toBeGreaterThan(createWindowPosition)
    expect(trayPosition).toBeGreaterThan(registerPosition)
    expect(mainProcess).toContain('TRAY_FALLBACK_ICON_DATA_URL')
    expect(mainProcess).toContain('icon: APP_ICON_PATH')
    expect(mainProcess).toContain('`DeepDive (${shortcutLabel})`')
  })

  it('keeps the search window visible when focus moves outside the app', () => {
    const mainProcess = readFileSync('electron/main/index.ts', 'utf8')

    expect(mainProcess).not.toContain("mainWindow.on('blur'")
    expect(mainProcess).not.toContain('BLUR_HIDE_DELAY_MS')
    expect(mainProcess).not.toContain('clearBlurHideTimer')
    expect(mainProcess).toContain('if (mainWindow?.isVisible())')
    expect(mainProcess).toContain('mainWindow.hide()')
  })

  it('uses Ctrl+Space when it is available', () => {
    const toggleWindow = vi.fn()
    const register = vi.fn(() => true)

    expect(registerSpotlightShortcut(register, toggleWindow)).toEqual({
      accelerator: PRIMARY_SPOTLIGHT_SHORTCUT,
      usedFallback: false
    })
    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith(PRIMARY_SPOTLIGHT_SHORTCUT, toggleWindow)
  })

  it('registers Ctrl+Shift+Space when Ctrl+Space is already owned', () => {
    const toggleWindow = vi.fn()
    const register = vi
      .fn<(accelerator: string, callback: () => void) => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    expect(registerSpotlightShortcut(register, toggleWindow)).toEqual({
      accelerator: FALLBACK_SPOTLIGHT_SHORTCUT,
      usedFallback: true
    })
    expect(register.mock.calls.map(([accelerator]) => accelerator)).toEqual([
      PRIMARY_SPOTLIGHT_SHORTCUT,
      FALLBACK_SPOTLIGHT_SHORTCUT
    ])
  })

  it('reports when neither shortcut can be registered', () => {
    expect(registerSpotlightShortcut(() => false, vi.fn())).toEqual({
      accelerator: null,
      usedFallback: false
    })
  })
})
