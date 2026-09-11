/**
 * Minimal safe Markdown projection for AI responses.
 * Escapes all HTML first, then applies a small set of block/inline rules.
 * Output contains only these tags: p, h4, pre, code, strong, em, ul, li,
 * a (http/https only), br. No third-party renderer required.
 */
export function renderAiMarkdown(source: string): string {
  const escaped = escapeHtml(source)
  const lines = escaped.split('\n')
  const blocks: string[] = []
  let paragraph: string[] = []
  let list: string[] = []
  let code: string[] | null = null

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${inline(paragraph.join('<br />'))}</p>`)
      paragraph = []
    }
  }
  const flushList = (): void => {
    if (list.length > 0) {
      blocks.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
      list = []
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code === null) {
        code = []
        flushParagraph()
        flushList()
      } else {
        blocks.push(`<pre><code>${code.join('\n')}</code></pre>`)
        code = null
      }
      continue
    }
    if (code !== null) {
      code.push(line)
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push(`<h4>${inline(heading[2])}</h4>`)
      continue
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (bullet) {
      flushParagraph()
      list.push(bullet[1])
      continue
    }
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }
    paragraph.push(line)
  }
  if (code !== null) blocks.push(`<pre><code>${code.join('\n')}</code></pre>`)
  flushParagraph()
  flushList()
  return blocks.join('')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inline(value: string): string {
  // Order matters: code spans first so their contents are not reformatted.
  const codeSpans: string[] = []
  let text = value.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`)
    return `\u0000${codeSpans.length - 1}\u0000`
  })
  text = text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
  return text.replace(
    /\u0000(\d+)\u0000/g,
    (_match, index: string) => codeSpans[Number(index)] ?? ''
  )
}
