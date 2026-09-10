import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LiquidGlassSurface } from '../src/components/LiquidGlassSurface/LiquidGlassSurface'

describe('LiquidGlassSurface', () => {
  it('renders action surfaces as semantic buttons', () => {
    const markup = renderToStaticMarkup(
      <LiquidGlassSurface as="button" aria-label="Preview action">
        Preview
      </LiquidGlassSurface>
    )

    expect(markup).toMatch(/^<button/)
    expect(markup).toContain('type="button"')
    expect(markup).toContain('aria-label="Preview action"')
  })

  it('keeps content surfaces as divs by default', () => {
    expect(renderToStaticMarkup(<LiquidGlassSurface>Content</LiquidGlassSurface>)).toMatch(/^<div/)
  })
})
