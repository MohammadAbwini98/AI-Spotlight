import React, { useEffect, useState } from 'react'
import type { AppSettings } from '../../../electron/shared/types'
import { slideUp } from '../../design/motion'
import { LiquidGlassSurface } from '../../components/LiquidGlassSurface/LiquidGlassSurface'
import styles from './SettingsView.module.css'

interface SettingsViewProps {
  settings: AppSettings | null
  errorMessage?: string | null
  onBack: () => void
  onUpdateSetting: (key: string, value: string) => void
}

export function SettingsView({
  settings,
  errorMessage = null,
  onBack,
  onUpdateSetting
}: SettingsViewProps): React.ReactElement {
  const [dataPath, setDataPath] = useState<string | null>(null)

  useEffect(() => {
    void window.electronAPI.stats.getDataPath().then((result) => {
      if (result.ok) setDataPath(result.data)
    })
  }, [])

  return (
    <LiquidGlassSurface
      className={styles.container}
      variant="strong"
      elevated
      variants={slideUp}
      initial="hidden"
      animate="visible"
      exit="hidden"
    >
      <header className={styles.header}>
        <button className={styles.backBtn} type="button" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M10 4L6 8L10 12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </button>
        <h1 className={styles.title}>Settings</h1>
      </header>

      {!settings ? (
        <div className={styles.unavailable} role={errorMessage ? 'alert' : 'status'}>
          <strong>{errorMessage ? 'Settings unavailable' : 'Loading settings…'}</strong>
          {errorMessage && <span>{errorMessage}</span>}
        </div>
      ) : (
        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Appearance</h2>

            <div className={styles.settingGroup}>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <span id="theme-setting-label" className={styles.settingName}>
                    Theme
                  </span>
                  <span className={styles.settingDesc}>Choose your preferred color theme.</span>
                </div>
                <select
                  className={styles.select}
                  value={settings.theme || 'system'}
                  onChange={(e) => onUpdateSetting('theme', e.target.value)}
                  aria-labelledby="theme-setting-label"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <span id="reduced-motion-label" className={styles.settingName}>
                    Reduced Motion
                  </span>
                  <span className={styles.settingDesc}>Use gentle fades instead of movement.</span>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={settings.reducedMotion}
                    onChange={(e) =>
                      onUpdateSetting('reducedMotion', e.target.checked ? 'true' : 'false')
                    }
                    aria-labelledby="reduced-motion-label"
                  />
                  <span className={styles.slider} />
                </label>
              </div>

              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <span id="reduced-transparency-label" className={styles.settingName}>
                    Reduced Transparency
                  </span>
                  <span className={styles.settingDesc}>
                    Use solid surfaces for better legibility.
                  </span>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={settings.reducedTransparency}
                    onChange={(e) =>
                      onUpdateSetting('reducedTransparency', e.target.checked ? 'true' : 'false')
                    }
                    aria-labelledby="reduced-transparency-label"
                  />
                  <span className={styles.slider} />
                </label>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Tasks</h2>

            <div className={styles.settingGroup}>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <span id="show-completed-label" className={styles.settingName}>
                    Show Completed Tasks
                  </span>
                  <span className={styles.settingDesc}>Display completed tasks in your lists.</span>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={settings.showCompletedTasks}
                    onChange={(e) =>
                      onUpdateSetting('showCompletedTasks', e.target.checked ? 'true' : 'false')
                    }
                    aria-labelledby="show-completed-label"
                  />
                  <span className={styles.slider} />
                </label>
              </div>

              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <span id="default-priority-label" className={styles.settingName}>
                    Default Priority
                  </span>
                  <span className={styles.settingDesc}>Priority assigned to new tasks.</span>
                </div>
                <select
                  className={styles.select}
                  value={settings.defaultPriority || 'none'}
                  onChange={(e) => onUpdateSetting('defaultPriority', e.target.value)}
                  aria-labelledby="default-priority-label"
                >
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Storage</h2>
            <div className={styles.settingGroup}>
              <div className={styles.settingRow}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Active database location</span>
                  <code className={styles.dataPath}>{dataPath ?? 'Loading…'}</code>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </LiquidGlassSurface>
  )
}
