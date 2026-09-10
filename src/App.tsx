import React, { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion, LayoutGroup, MotionConfig } from 'framer-motion'
import { SearchView } from './features/search/SearchView'
import { TodoView } from './features/todo/TodoView'
import { SettingsView } from './features/settings/SettingsView'
import type { AppSettings } from '../electron/shared/types'
import { springs, COMPACT_HEIGHT, SEARCH_HEIGHT, TODO_HEIGHT } from './design/motion'
import { resolveTheme } from './design/theme'
import styles from './App.module.css'

type AppView = 'search' | 'todo' | 'settings'

export default function App(): React.ReactElement {
  const [view, setView] = useState<AppView>('search')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // Load persisted settings on mount.
  useEffect(() => {
    void window.electronAPI.settings
      .get()
      .then((res) => {
        if (res.ok) {
          setSettings(res.data)
          setSettingsError(null)
          if (res.data.reducedMotion) {
            document.documentElement.dataset.reducedMotion = 'true'
          }
          if (res.data.reducedTransparency) {
            document.documentElement.dataset.reducedTransparency = 'true'
          }
        } else {
          setSettingsError(res.error.message)
        }
      })
      .catch(() => setSettingsError('Settings could not be loaded.'))
  }, [])

  // Resolve "system" against the live OS preference and keep it in sync.
  useEffect(() => {
    if (!settings) return

    const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
    const applyResolvedTheme = (): void => {
      document.documentElement.dataset.theme = resolveTheme(settings.theme, colorScheme.matches)
    }

    applyResolvedTheme()
    if (settings.theme !== 'system') return

    colorScheme.addEventListener('change', applyResolvedTheme)
    return () => colorScheme.removeEventListener('change', applyResolvedTheme)
  }, [settings])

  // Handle Escape to close/collapse
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Let modal surfaces dismiss themselves before the app changes screens.
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

        if (view !== 'search' || isExpanded) {
          setView('search')
          setIsExpanded(false)
        } else {
          window.electronAPI.app.hide()
        }
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [view, isExpanded])

  const targetHeight =
    view === 'search' && !isExpanded
      ? COMPACT_HEIGHT
      : view === 'todo'
        ? TODO_HEIGHT
        : SEARCH_HEIGHT

  useEffect(() => {
    // Notify electron to resize the native window
    window.electronAPI.app.setHeight(targetHeight)
  }, [targetHeight])

  const handleSettingsUpdate = useCallback((key: string, value: string) => {
    window.electronAPI.settings.set(key, value).then((result) => {
      if (!result.ok) return
      if (key === 'reducedMotion') {
        document.documentElement.dataset.reducedMotion = value
      }
      if (key === 'reducedTransparency') {
        document.documentElement.dataset.reducedTransparency = value
      }
      setSettings((prev) =>
        prev
          ? ({
              ...prev,
              [key]: value === 'true' ? true : value === 'false' ? false : value
            } as AppSettings)
          : prev
      )
    })
  }, [])

  return (
    <MotionConfig reducedMotion={settings?.reducedMotion ? 'always' : 'user'}>
      <LayoutGroup>
        <motion.div
          className={styles.root}
          layout
          animate={{ height: targetHeight }}
          transition={springs.expand}
          style={{ width: '100%' }}
        >
          <motion.div
            className={`${styles.window} ${targetHeight === COMPACT_HEIGHT ? styles.compact : styles.expanded}`}
            layout
            style={{ height: '100%' }}
          >
            <AnimatePresence mode="wait">
              {view === 'search' && (
                <SearchView
                  key="search"
                  isExpanded={isExpanded}
                  onExpand={setIsExpanded}
                  onOpenTodo={() => {
                    setView('todo')
                    setIsExpanded(true)
                  }}
                  onOpenSettings={() => {
                    setView('settings')
                    setIsExpanded(true)
                  }}
                />
              )}
              {view === 'todo' && (
                <TodoView
                  key="todo"
                  settings={settings}
                  onBack={() => {
                    setView('search')
                    setIsExpanded(false)
                  }}
                  onOpenSettings={() => setView('settings')}
                />
              )}
              {view === 'settings' && (
                <SettingsView
                  key="settings"
                  settings={settings}
                  errorMessage={settingsError}
                  onBack={() => {
                    setView('search')
                    setIsExpanded(false)
                  }}
                  onUpdateSetting={handleSettingsUpdate}
                />
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </LayoutGroup>
    </MotionConfig>
  )
}
