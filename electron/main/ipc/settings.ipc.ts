import { dialog } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/database'
import { getDefaultScanRoots, sanitizeScanRoots, validateScanRoot } from '../indexer/exclusions'
import { isIndexerActive, startIndexWatchers, startSync } from '../indexer/sync'
import type { ApiResult, AppSettings, Theme } from '../../shared/types'
import { accessSync, constants, statSync } from 'fs'
import { normalize, resolve } from 'path'
import { registerTrustedHandler } from './security'

export function registerSettingsHandlers(): void {
  registerTrustedHandler(IPC.SETTINGS_GET, (): ApiResult<AppSettings> => {
    try {
      const db = getDb()
      const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
        key: string
        value: string
      }[]
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))

      let defaultListId: number | null = null
      try {
        defaultListId = map.defaultListId ? parseInt(map.defaultListId) : null
      } catch {
        /* ignore */
      }

      return {
        ok: true,
        data: {
          theme: map.theme === 'crystal' ? 'system' : ((map.theme as Theme) ?? 'system'),
          reducedMotion: map.reducedMotion === 'true',
          reducedTransparency: map.reducedTransparency === 'true',
          defaultListId,
          defaultPriority: (map.defaultPriority as AppSettings['defaultPriority']) ?? 'none',
          showCompletedTasks: map.showCompletedTasks !== 'false',
          confirmBeforeDelete: map.confirmBeforeDelete !== 'false'
        }
      }
    } catch (err) {
      return { ok: false, error: { code: 'GET_SETTINGS_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.SETTINGS_SET, (_e, key: string, value: string): ApiResult<void> => {
    try {
      getDb()
        .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
        .run(key, value)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'SET_SETTINGS_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.SETTINGS_GET_SCAN_ROOTS, (): ApiResult<string[]> => {
    try {
      const db = getDb()
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'scanRoots'").get() as
        { value: string } | undefined
      try {
        const parsed = JSON.parse(row?.value ?? 'null')
        const roots = sanitizeScanRoots(parsed)
        if (roots.length > 0) return { ok: true, data: roots }
      } catch {
        /* ignore */
      }
      return { ok: true, data: sanitizeScanRoots(getDefaultScanRoots()) }
    } catch (err) {
      return { ok: false, error: { code: 'GET_ROOTS_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.SETTINGS_ADD_SCAN_ROOT, (_e, newPath: string): ApiResult<string[]> => {
    try {
      const db = getDb()
      const canonicalPath = normalize(resolve(newPath))
      const validationError = validateScanRoot(canonicalPath)
      if (validationError)
        return { ok: false, error: { code: 'INVALID_ROOT', message: validationError } }

      try {
        accessSync(canonicalPath, constants.R_OK)
        if (!statSync(canonicalPath).isDirectory()) throw new Error('Not a directory')
      } catch {
        return {
          ok: false,
          error: { code: 'NOT_READABLE', message: 'Cannot read the selected folder.' }
        }
      }

      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'scanRoots'").get() as
        { value: string } | undefined
      let roots: string[] = sanitizeScanRoots(getDefaultScanRoots())
      try {
        const parsed = JSON.parse(row?.value ?? 'null')
        const persistedRoots = sanitizeScanRoots(parsed)
        if (persistedRoots.length > 0) roots = persistedRoots
      } catch {
        /* ignore */
      }

      if (!roots.some((root) => root.toLowerCase() === canonicalPath.toLowerCase())) {
        roots.push(canonicalPath)
      }
      db.prepare("UPDATE app_settings SET value = ? WHERE key = 'scanRoots'").run(
        JSON.stringify(roots)
      )
      refreshIndexTracking()

      return { ok: true, data: roots }
    } catch (err) {
      return { ok: false, error: { code: 'ADD_ROOT_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(
    IPC.SETTINGS_REMOVE_SCAN_ROOT,
    (_e, removePath: string): ApiResult<string[]> => {
      try {
        const db = getDb()
        const row = db.prepare("SELECT value FROM app_settings WHERE key = 'scanRoots'").get() as
          { value: string } | undefined
        let roots: string[] = sanitizeScanRoots(getDefaultScanRoots())
        try {
          const parsed = JSON.parse(row?.value ?? 'null')
          const persistedRoots = sanitizeScanRoots(parsed)
          if (persistedRoots.length > 0) roots = persistedRoots
        } catch {
          /* ignore */
        }

        const canonicalRemovePath = normalize(resolve(removePath)).toLowerCase()
        roots = roots.filter((root) => root.toLowerCase() !== canonicalRemovePath)
        db.prepare("UPDATE app_settings SET value = ? WHERE key = 'scanRoots'").run(
          JSON.stringify(roots)
        )
        refreshIndexTracking()
        return { ok: true, data: roots }
      } catch (err) {
        return { ok: false, error: { code: 'REMOVE_ROOT_ERROR', message: String(err) } }
      }
    }
  )

  registerTrustedHandler(IPC.SETTINGS_RESET_SCAN_ROOTS, (): ApiResult<string[]> => {
    try {
      const defaults = sanitizeScanRoots(getDefaultScanRoots())
      getDb()
        .prepare("UPDATE app_settings SET value = ? WHERE key = 'scanRoots'")
        .run(JSON.stringify(defaults))
      refreshIndexTracking()
      return { ok: true, data: defaults }
    } catch (err) {
      return { ok: false, error: { code: 'RESET_ROOTS_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(
    IPC.SETTINGS_SELECT_FOLDER,
    async (): Promise<ApiResult<string | null>> => {
      try {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
        if (result.canceled || result.filePaths.length === 0) return { ok: true, data: null }
        return { ok: true, data: result.filePaths[0] }
      } catch (err) {
        return { ok: false, error: { code: 'FOLDER_DIALOG_ERROR', message: String(err) } }
      }
    }
  )
}

function refreshIndexTracking(): void {
  if (isIndexerActive()) return
  startIndexWatchers()
  void startSync()
}
