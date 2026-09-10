import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecentFrequentSection } from '../src/features/search/RecentFrequentSection'

describe('RecentFrequentSection', () => {
  it('always provides an accessible back action', () => {
    const markup = renderToStaticMarkup(
      <RecentFrequentSection
        recent={[]}
        frequent={[]}
        isLoading={false}
        onSelect={() => undefined}
        onBack={() => undefined}
      />
    )

    expect(markup).toContain('aria-label="Back to Spotlight"')
    expect(markup).toContain('Recent files')
  })

  it('shows an accurate loading state while prefetched data is pending', () => {
    const markup = renderToStaticMarkup(
      <RecentFrequentSection
        recent={[]}
        frequent={[]}
        isLoading
        onSelect={() => undefined}
        onBack={() => undefined}
      />
    )

    expect(markup).toContain('Loading recent files…')
    expect(markup).not.toContain('run Sync if the index is empty')
  })
})
