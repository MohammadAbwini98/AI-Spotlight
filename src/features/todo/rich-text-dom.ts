export type TextColorName =
  | 'adaptive-dark'
  | 'adaptive-light'
  | 'gray'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'amber'
  | 'orange'
  | 'red'
  | 'purple'

export type HighlightName = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple'

export interface RichTextSnapshot {
  html: string
  plainText: string
  markdown: string
}

export interface ActiveEditorContext {
  block: HTMLElement | null
  listItem: HTMLLIElement | null
  list: HTMLOListElement | HTMLUListElement | null
  cell: HTMLTableCellElement | null
  table: HTMLTableElement | null
}

export type TableAction =
  | 'row-above'
  | 'row-below'
  | 'column-before'
  | 'column-after'
  | 'delete-row'
  | 'delete-column'
  | 'merge-right'
  | 'split-cell'
  | 'delete-table'

const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BR',
  'COL',
  'COLGROUP',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'I',
  'LI',
  'OL',
  'P',
  'S',
  'SPAN',
  'STRIKE',
  'STRONG',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'U',
  'UL'
])

const DROP_WITH_CONTENTS = new Set([
  'BASE',
  'BUTTON',
  'EMBED',
  'FORM',
  'IFRAME',
  'INPUT',
  'LINK',
  'MATH',
  'META',
  'OBJECT',
  'SCRIPT',
  'STYLE',
  'SVG',
  'TEXTAREA'
])

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'LI', 'TR', 'TABLE', 'UL', 'OL'])
const TEXT_COLOR_NAMES = new Set<TextColorName>([
  'adaptive-dark',
  'adaptive-light',
  'gray',
  'blue',
  'cyan',
  'green',
  'amber',
  'orange',
  'red',
  'purple'
])
const HIGHLIGHT_NAMES = new Set<HighlightName>([
  'yellow',
  'green',
  'blue',
  'pink',
  'orange',
  'purple'
])

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function plainTextToHtml(value: string): string {
  if (!value) return '<p><br></p>'
  return value
    .replaceAll('\r\n', '\n')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')
}

function isSafeHref(value: string): boolean {
  const trimmed = value.trim()
  return /^(https?:|mailto:)/i.test(trimmed)
}

function isSafeStyleValue(value: string): boolean {
  return !/(?:url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:)/i.test(value)
}

function copySafeStyles(source: HTMLElement, target: HTMLElement): void {
  const allowed = [
    'background-color',
    'border',
    'border-bottom',
    'border-color',
    'border-left',
    'border-right',
    'border-style',
    'border-top',
    'border-width',
    'color',
    'font-style',
    'font-weight',
    'text-align',
    'text-decoration',
    'vertical-align',
    'width'
  ]

  for (const property of allowed) {
    const value = source.style.getPropertyValue(property).trim()
    if (value && isSafeStyleValue(value)) target.style.setProperty(property, value)
  }
}

function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '')
  if (!(node instanceof HTMLElement)) return null
  if (DROP_WITH_CONTENTS.has(node.tagName)) return null

  if (!ALLOWED_TAGS.has(node.tagName)) {
    const fragment = document.createDocumentFragment()
    for (const child of Array.from(node.childNodes)) {
      const sanitized = sanitizeNode(child)
      if (sanitized) fragment.append(sanitized)
    }
    return fragment
  }

  const tagName =
    node.tagName === 'B'
      ? 'strong'
      : node.tagName === 'I'
        ? 'em'
        : node.tagName === 'STRIKE'
          ? 's'
          : node.tagName
  const clean = document.createElement(tagName.toLowerCase())

  if (
    node instanceof HTMLAnchorElement &&
    isSafeHref(node.href || node.getAttribute('href') || '')
  ) {
    clean.setAttribute('href', node.getAttribute('href') ?? node.href)
    clean.setAttribute('rel', 'noreferrer noopener')
  }
  if (node.hasAttribute('colspan')) {
    const value = Math.min(
      20,
      Math.max(1, Number.parseInt(node.getAttribute('colspan') ?? '1', 10))
    )
    clean.setAttribute('colspan', String(value))
  }
  if (node.hasAttribute('rowspan')) {
    const value = Math.min(
      20,
      Math.max(1, Number.parseInt(node.getAttribute('rowspan') ?? '1', 10))
    )
    clean.setAttribute('rowspan', String(value))
  }
  if (node.tagName === 'OL' && /^\d+$/.test(node.getAttribute('start') ?? '')) {
    clean.setAttribute('start', node.getAttribute('start') ?? '1')
  }

  const textColor = node.getAttribute('data-text-color') as TextColorName | null
  if (textColor && TEXT_COLOR_NAMES.has(textColor)) clean.dataset.textColor = textColor
  const highlight = node.getAttribute('data-highlight') as HighlightName | null
  if (highlight && HIGHLIGHT_NAMES.has(highlight)) clean.dataset.highlight = highlight
  const listStyle = node.getAttribute('data-list-style')
  if (
    node.tagName === 'OL' &&
    ['decimal', 'lower-alpha', 'upper-alpha'].includes(listStyle ?? '')
  ) {
    clean.dataset.listStyle = listStyle ?? 'decimal'
  }
  copySafeStyles(node, clean)

  for (const child of Array.from(node.childNodes)) {
    const sanitized = sanitizeNode(child)
    if (sanitized) clean.append(sanitized)
  }
  return clean
}

export function sanitizeRichTextHtml(value: string): string {
  const template = document.createElement('template')
  template.innerHTML = value
  const container = document.createElement('div')
  for (const child of Array.from(template.content.childNodes)) {
    const sanitized = sanitizeNode(child)
    if (sanitized) container.append(sanitized)
  }

  if (!container.textContent?.trim() && !container.querySelector('table, img')) return '<p><br></p>'
  return container.innerHTML
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\u200b/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function nodeToPlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof HTMLElement)) return ''
  if (node.tagName === 'BR') return '\n'
  if (node.tagName === 'TABLE') {
    const table = node as HTMLTableElement
    return Array.from(table.rows)
      .map((row) =>
        Array.from(row.cells)
          .map((cell) => normalizeWhitespace(nodeToPlainText(cell)))
          .join('\t')
      )
      .join('\n')
  }

  const value = Array.from(node.childNodes).map(nodeToPlainText).join('')
  return BLOCK_TAGS.has(node.tagName) ? `${value}\n` : value
}

export function richTextHtmlToPlainText(value: string): string {
  const container = document.createElement('div')
  container.innerHTML = sanitizeRichTextHtml(value)
  return normalizeWhitespace(Array.from(container.childNodes).map(nodeToPlainText).join(''))
}

function nodeToMarkdown(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\u200b/g, '')
  if (!(node instanceof HTMLElement)) return ''
  const children = () =>
    Array.from(node.childNodes)
      .map((child) => nodeToMarkdown(child, depth))
      .join('')

  switch (node.tagName) {
    case 'BR':
      return '  \n'
    case 'STRONG':
      return `**${children()}**`
    case 'EM':
      return `_${children()}_`
    case 'U':
      return `<u>${children()}</u>`
    case 'S':
      return `~~${children()}~~`
    case 'A':
      return `[${children()}](${node.getAttribute('href') ?? ''})`
    case 'H1':
      return `# ${children()}\n\n`
    case 'H2':
      return `## ${children()}\n\n`
    case 'H3':
      return `### ${children()}\n\n`
    case 'H4':
      return `#### ${children()}\n\n`
    case 'P':
      return `${children()}\n\n`
    case 'UL':
    case 'OL': {
      const ordered = node.tagName === 'OL'
      return `${Array.from(node.children)
        .filter((child) => child.tagName === 'LI')
        .map((child, index) => {
          const marker = ordered ? `${index + 1}.` : '-'
          return `${'  '.repeat(depth)}${marker} ${nodeToMarkdown(child, depth + 1).trim()}\n`
        })
        .join('')}\n`
    }
    case 'LI':
      return Array.from(node.childNodes)
        .map((child) => nodeToMarkdown(child, depth))
        .join('')
    case 'TABLE': {
      const table = node as HTMLTableElement
      const rows = Array.from(table.rows).map((row) =>
        Array.from(row.cells).map((cell) =>
          normalizeWhitespace(nodeToPlainText(cell)).replaceAll('|', '\\|')
        )
      )
      if (!rows.length) return ''
      const width = Math.max(...rows.map((row) => row.length))
      const normalized = rows.map((row) => [...row, ...Array(width - row.length).fill('')])
      const header = normalized[0]
      return `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n${normalized
        .slice(1)
        .map((row) => `| ${row.join(' | ')} |`)
        .join('\n')}\n\n`
    }
    default:
      return children()
  }
}

export function richTextHtmlToMarkdown(value: string): string {
  const container = document.createElement('div')
  container.innerHTML = sanitizeRichTextHtml(value)
  return Array.from(container.childNodes)
    .map((node) => nodeToMarkdown(node))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function createRichTextSnapshot(editor: HTMLElement): RichTextSnapshot {
  const html = sanitizeRichTextHtml(editor.innerHTML)
  return {
    html,
    plainText: richTextHtmlToPlainText(html),
    markdown: richTextHtmlToMarkdown(html)
  }
}

export function selectionRangeWithin(editor: HTMLElement): Range | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  return editor.contains(
    container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode
  )
    ? range
    : null
}

export function restoreEditorRange(editor: HTMLElement, range: Range | null): void {
  editor.focus({ preventScroll: true })
  if (!range) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function closestWithin<T extends Element>(
  editor: HTMLElement,
  node: Node | null,
  selector: string
): T | null {
  const element = node instanceof Element ? node : node?.parentElement
  const match = element?.closest<T>(selector) ?? null
  return match && editor.contains(match) ? match : null
}

export function getActiveEditorContext(
  editor: HTMLElement,
  range?: Range | null
): ActiveEditorContext {
  const activeRange = range ?? selectionRangeWithin(editor)
  const node = activeRange?.startContainer ?? null
  const cell = closestWithin<HTMLTableCellElement>(editor, node, 'td, th')
  const listItem = closestWithin<HTMLLIElement>(editor, node, 'li')
  return {
    block: closestWithin<HTMLElement>(editor, node, 'p, h1, h2, h3, h4, li, td, th'),
    listItem,
    list: listItem?.closest<HTMLOListElement | HTMLUListElement>('ol, ul') ?? null,
    cell,
    table: cell?.closest<HTMLTableElement>('table') ?? null
  }
}

export function caretClientRect(range: Range): DOMRect {
  const rect = range.getBoundingClientRect()
  if (rect.width || rect.height) return rect
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  const probe = range.cloneRange()
  probe.collapse(true)
  probe.insertNode(marker)
  const markerRect = marker.getBoundingClientRect()
  marker.remove()
  return markerRect
}

export function executeNativeCommand(
  editor: HTMLElement,
  range: Range | null,
  command: string,
  value?: string
): void {
  if (command === 'formatBlock' && value) {
    setBlockTag(editor, range, value)
    return
  }
  restoreEditorRange(editor, range)
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand(command, false, value)
}

function setBlockTag(editor: HTMLElement, range: Range | null, value: string): void {
  const tagName = value.toLowerCase()
  if (!['p', 'h1', 'h2', 'h3', 'h4'].includes(tagName)) return
  restoreEditorRange(editor, range)
  const activeRange = selectionRangeWithin(editor)
  if (!activeRange) return
  const wasCollapsed = activeRange.collapsed
  const context = getActiveEditorContext(editor, activeRange)
  const current = context.block
  const next = document.createElement(tagName)

  if (current && ['P', 'H1', 'H2', 'H3', 'H4'].includes(current.tagName)) {
    next.append(...Array.from(current.childNodes))
    current.replaceWith(next)
  } else if (current instanceof HTMLTableCellElement || current instanceof HTMLLIElement) {
    next.append(...Array.from(current.childNodes))
    current.append(next)
  } else {
    next.append(activeRange.extractContents())
    if (!next.childNodes.length) next.append(document.createElement('br'))
    activeRange.insertNode(next)
  }

  const selection = window.getSelection()
  const nextRange = document.createRange()
  nextRange.selectNodeContents(next)
  if (wasCollapsed) nextRange.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(nextRange)
}

export function applyInlineAttribute(
  editor: HTMLElement,
  range: Range | null,
  attribute: 'data-text-color' | 'data-highlight',
  value: string | null
): void {
  restoreEditorRange(editor, range)
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const activeRange = selection.getRangeAt(0)

  if (!value) {
    const selector = `span[${attribute}]`
    for (const span of Array.from(editor.querySelectorAll<HTMLSpanElement>(selector))) {
      if (!activeRange.intersectsNode(span)) continue
      span.removeAttribute(attribute)
      if (!span.attributes.length) span.replaceWith(...Array.from(span.childNodes))
    }
    const ancestor =
      activeRange.startContainer instanceof Element
        ? activeRange.startContainer.closest<HTMLSpanElement>(selector)
        : activeRange.startContainer.parentElement?.closest<HTMLSpanElement>(selector)
    if (ancestor && editor.contains(ancestor)) ancestor.removeAttribute(attribute)
    return
  }

  if (activeRange.collapsed) {
    const span = document.createElement('span')
    span.setAttribute(attribute, value)
    span.append(document.createTextNode('\u200b'))
    activeRange.insertNode(span)
    activeRange.setStart(span.firstChild ?? span, 1)
    activeRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(activeRange)
    return
  }

  const span = document.createElement('span')
  span.setAttribute(attribute, value)
  try {
    activeRange.surroundContents(span)
  } catch {
    span.append(activeRange.extractContents())
    activeRange.insertNode(span)
  }
  selection.removeAllRanges()
  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  selection.addRange(nextRange)
}

export function clearRichFormatting(editor: HTMLElement, range: Range | null): void {
  executeNativeCommand(editor, range, 'removeFormat')
  const activeRange = selectionRangeWithin(editor)
  if (!activeRange) return
  for (const span of Array.from(
    editor.querySelectorAll('span[data-text-color], span[data-highlight]')
  )) {
    if (activeRange.intersectsNode(span)) span.replaceWith(...Array.from(span.childNodes))
  }
}

export function setListStyle(
  editor: HTMLElement,
  range: Range | null,
  style: 'bullet' | 'decimal' | 'lower-alpha' | 'upper-alpha'
): void {
  executeNativeCommand(
    editor,
    range,
    style === 'bullet' ? 'insertUnorderedList' : 'insertOrderedList'
  )
  if (style === 'bullet') return
  const context = getActiveEditorContext(editor)
  const list = context.list instanceof HTMLOListElement ? context.list : null
  if (list) list.dataset.listStyle = style
}

export function moveListItem(item: HTMLLIElement, direction: -1 | 1): void {
  const sibling = direction < 0 ? item.previousElementSibling : item.nextElementSibling
  if (!(sibling instanceof HTMLLIElement)) return
  if (direction < 0) sibling.before(item)
  else sibling.after(item)
}

export function insertTableAtRange(
  editor: HTMLElement,
  range: Range | null,
  rows: number,
  columns: number
): void {
  restoreEditorRange(editor, range)
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const activeRange = selection.getRangeAt(0)
  activeRange.deleteContents()

  const table = document.createElement('table')
  const body = table.createTBody()
  for (let rowIndex = 0; rowIndex < Math.min(12, Math.max(1, rows)); rowIndex += 1) {
    const row = body.insertRow()
    for (let columnIndex = 0; columnIndex < Math.min(12, Math.max(1, columns)); columnIndex += 1) {
      const cell = row.insertCell()
      cell.append(document.createElement('br'))
    }
  }
  activeRange.insertNode(table)
  table.after(document.createElement('p'))

  const firstCell = table.rows[0]?.cells[0]
  if (firstCell) {
    const next = document.createRange()
    next.selectNodeContents(firstCell)
    next.collapse(true)
    selection.removeAllRanges()
    selection.addRange(next)
  }
}

function insertCellAt(row: HTMLTableRowElement, index: number): HTMLTableCellElement {
  const cell = row.insertCell(Math.max(0, Math.min(index, row.cells.length)))
  cell.append(document.createElement('br'))
  return cell
}

export function performTableAction(cell: HTMLTableCellElement, action: TableAction): void {
  const row = cell.parentElement as HTMLTableRowElement | null
  const table = cell.closest('table')
  if (!row || !table) return
  const rowIndex = row.rowIndex
  const cellIndex = cell.cellIndex
  const removeTable = (): void => {
    const wrapper = table.closest('.rich-table-scroll')
    if (wrapper) wrapper.remove()
    else table.remove()
  }

  switch (action) {
    case 'row-above':
    case 'row-below': {
      const targetIndex = action === 'row-above' ? rowIndex : rowIndex + 1
      const nextRow = table.insertRow(targetIndex)
      const columns = Math.max(1, row.cells.length)
      for (let index = 0; index < columns; index += 1) insertCellAt(nextRow, index)
      break
    }
    case 'column-before':
    case 'column-after': {
      const targetIndex = action === 'column-before' ? cellIndex : cellIndex + 1
      for (const tableRow of Array.from(table.rows)) insertCellAt(tableRow, targetIndex)
      break
    }
    case 'delete-row':
      table.deleteRow(rowIndex)
      if (!table.rows.length) removeTable()
      break
    case 'delete-column':
      for (const tableRow of Array.from(table.rows)) {
        if (tableRow.cells[cellIndex]) tableRow.deleteCell(cellIndex)
      }
      if (!table.rows[0]?.cells.length) removeTable()
      break
    case 'merge-right': {
      const nextCell = row.cells[cellIndex + 1]
      if (!nextCell) break
      const separator =
        cell.textContent?.trim() && nextCell.textContent?.trim()
          ? document.createElement('br')
          : null
      if (separator) cell.append(separator)
      cell.append(...Array.from(nextCell.childNodes))
      cell.colSpan += Math.max(1, nextCell.colSpan)
      nextCell.remove()
      break
    }
    case 'split-cell': {
      if (cell.colSpan <= 1) break
      cell.colSpan -= 1
      insertCellAt(row, cellIndex + 1)
      break
    }
    case 'delete-table':
      removeTable()
      break
  }
}

export function navigateTableCell(cell: HTMLTableCellElement, backwards: boolean): void {
  const table = cell.closest('table')
  if (!table) return
  const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('td, th'))
  const index = cells.indexOf(cell)
  let next = cells[index + (backwards ? -1 : 1)]
  if (!next && !backwards) {
    const row = table.insertRow()
    const columns = Math.max(1, table.rows[0]?.cells.length ?? 1)
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1)
      insertCellAt(row, columnIndex)
    next = row.cells[0]
  }
  if (!next) return
  const range = document.createRange()
  range.selectNodeContents(next)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function rangeFromTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let position = 0
  let startNode: Node | null = null
  let startOffset = 0
  let endNode: Node | null = null
  let endOffset = 0
  while (walker.nextNode()) {
    const node = walker.currentNode
    const length = node.textContent?.length ?? 0
    if (!startNode && start <= position + length) {
      startNode = node
      startOffset = start - position
    }
    if (end <= position + length) {
      endNode = node
      endOffset = end - position
      break
    }
    position += length
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

export function slashCommandAtCaret(
  editor: HTMLElement,
  range: Range
): { query: string; commandRange: Range } | null {
  const context = getActiveEditorContext(editor, range)
  const block = context.block
  if (!block || !range.collapsed) return null
  const before = document.createRange()
  before.selectNodeContents(block)
  before.setEnd(range.startContainer, range.startOffset)
  const value = before.toString()
  const match = value.match(/(?:^|\s)\/([^/\n]*)$/)
  if (!match) return null
  const slashIndex = value.lastIndexOf('/')
  const commandRange = rangeFromTextOffsets(block, slashIndex, value.length)
  return commandRange ? { query: match[1], commandRange } : null
}

export function deleteRangeAndCollapse(range: Range): Range {
  range.deleteContents()
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  return range
}

export function tabSeparatedTextToHtml(value: string): string | null {
  const normalized = value.replaceAll('\r\n', '\n').trimEnd()
  const rows = normalized.split('\n').map((row) => row.split('\t'))
  if (rows.length < 1 || !rows.some((row) => row.length > 1)) return null
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><tbody>${body}</tbody></table>`
}

export function insertHtmlAtSelection(editor: HTMLElement, value: string): void {
  const range = selectionRangeWithin(editor)
  if (!range) return
  const template = document.createElement('template')
  template.innerHTML = sanitizeRichTextHtml(value)
  const fragment = template.content
  const lastNode = fragment.lastChild
  range.deleteContents()
  range.insertNode(fragment)
  if (lastNode) {
    range.setStartAfter(lastNode)
    range.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
}

function resolvedToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function clipboardHtmlFromHtml(value: string): string {
  const container = document.createElement('div')
  container.innerHTML = sanitizeRichTextHtml(value)
  for (const element of Array.from(container.querySelectorAll<HTMLElement>('[data-text-color]'))) {
    element.style.color = resolvedToken(`--rich-text-color-${element.dataset.textColor}`)
  }
  for (const element of Array.from(container.querySelectorAll<HTMLElement>('[data-highlight]'))) {
    element.style.backgroundColor = resolvedToken(`--rich-highlight-${element.dataset.highlight}`)
  }
  for (const table of Array.from(container.querySelectorAll<HTMLTableElement>('table'))) {
    table.style.borderCollapse = 'collapse'
    table.style.width = '100%'
  }
  for (const cell of Array.from(container.querySelectorAll<HTMLTableCellElement>('td, th'))) {
    cell.style.border = '1px solid #aeb7c2'
    cell.style.padding = '6px 8px'
    cell.style.verticalAlign = 'top'
  }
  return `<html><body><!--StartFragment-->${container.innerHTML}<!--EndFragment--></body></html>`
}

export async function writeRichClipboard(snapshot: RichTextSnapshot): Promise<void> {
  const html = clipboardHtmlFromHtml(snapshot.html)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([snapshot.plainText], { type: 'text/plain' })
      })
    ])
    return
  }
  await navigator.clipboard.writeText(snapshot.plainText)
}
