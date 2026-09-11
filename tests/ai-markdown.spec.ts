import { describe, expect, it } from 'vitest'
import { renderAiMarkdown } from '../src/features/ai/ai-markdown'

describe('AI safe Markdown projection', () => {
  it('escapes HTML before rendering', () => {
    const html = renderAiMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders code blocks, inline code, bold, and headings', () => {
    const html = renderAiMarkdown('# Title\n\n```\nconst x = 1\n```\n\nUse `code` and **bold**.')
    expect(html).toContain('<h4>Title</h4>')
    expect(html).toContain('<pre><code>const x = 1</code></pre>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('renders lists and safe links only', () => {
    const html = renderAiMarkdown(
      '- one\n- two\n\n[docs](https://example.com)\n\n[x](javascript:alert(1))'
    )
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<a href="https://example.com"')
    expect(html).not.toContain('href="javascript')
  })
})
