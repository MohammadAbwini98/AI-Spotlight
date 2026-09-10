import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsView } from '../src/features/settings/SettingsView'

describe('Settings loading states', () => {
  it('keeps a visible panel while settings are loading', () => {
    const markup = renderToStaticMarkup(
      <SettingsView settings={null} onBack={vi.fn()} onUpdateSetting={vi.fn()} />
    )

    expect(markup).toContain('role="status"')
    expect(markup).toContain('Loading settings')
    expect(markup).toContain('Back')
  })

  it('shows an IPC failure instead of a transparent empty window', () => {
    const markup = renderToStaticMarkup(
      <SettingsView
        settings={null}
        errorMessage="Settings request failed."
        onBack={vi.fn()}
        onUpdateSetting={vi.fn()}
      />
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain('Settings unavailable')
    expect(markup).toContain('Settings request failed.')
  })
})
