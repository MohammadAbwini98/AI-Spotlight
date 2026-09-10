import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { springs } from '../../design/motion'
import {
  applyInlineAttribute,
  caretClientRect,
  clearRichFormatting,
  clipboardHtmlFromHtml,
  createRichTextSnapshot,
  deleteRangeAndCollapse,
  executeNativeCommand,
  getActiveEditorContext,
  insertHtmlAtSelection,
  insertTableAtRange,
  moveListItem,
  navigateTableCell,
  performTableAction,
  plainTextToHtml,
  restoreEditorRange,
  richTextHtmlToPlainText,
  sanitizeRichTextHtml,
  selectionRangeWithin,
  setListStyle,
  slashCommandAtCaret,
  tabSeparatedTextToHtml,
  writeRichClipboard,
  type ActiveEditorContext,
  type HighlightName,
  type RichTextSnapshot,
  type TableAction,
  type TextColorName
} from './rich-text-dom'
import styles from './TaskNotesEditor.module.css'

export interface TaskNotesEditorHandle {
  copyAll: () => Promise<void>
  focus: () => void
  getSnapshot: () => RichTextSnapshot
}

interface TaskNotesEditorProps {
  initialHtml: string
  onChange: (snapshot: RichTextSnapshot) => void
}

interface MenuPosition {
  left: number
  top: number
  origin: 'top' | 'bottom'
}

interface SlashState {
  position: MenuPosition
  query: string
  range: Range
}

interface SlashCommand {
  id: string
  label: string
  keywords: string
  run: (range: Range) => void
}

type Palette = 'text-color' | 'highlight' | 'link' | 'table' | null

const TEXT_COLORS: Array<{ name: TextColorName | null; label: string }> = [
  { name: null, label: 'Automatic' },
  { name: 'adaptive-dark', label: 'Adaptive dark' },
  { name: 'adaptive-light', label: 'Adaptive light' },
  { name: 'gray', label: 'Gray' },
  { name: 'blue', label: 'Blue' },
  { name: 'cyan', label: 'Cyan' },
  { name: 'green', label: 'Green' },
  { name: 'amber', label: 'Amber' },
  { name: 'orange', label: 'Orange' },
  { name: 'red', label: 'Red' },
  { name: 'purple', label: 'Purple' }
]

const HIGHLIGHTS: Array<{ name: HighlightName | null; label: string }> = [
  { name: null, label: 'Remove highlight' },
  { name: 'yellow', label: 'Yellow' },
  { name: 'green', label: 'Green' },
  { name: 'blue', label: 'Blue' },
  { name: 'pink', label: 'Pink' },
  { name: 'orange', label: 'Orange' },
  { name: 'purple', label: 'Purple' }
]

const EMPTY_CONTEXT: ActiveEditorContext = {
  block: null,
  listItem: null,
  list: null,
  cell: null,
  table: null
}

function positionMenu(
  anchor: DOMRect,
  container: HTMLElement,
  width: number,
  height: number,
  preferAbove = false
): MenuPosition {
  const containerRect = container.getBoundingClientRect()
  const gap = 8
  const margin = 8
  const visibleLeft = container.scrollLeft + margin
  const visibleTop = container.scrollTop + margin
  const idealLeft =
    anchor.left + anchor.width / 2 - width / 2 - containerRect.left + container.scrollLeft
  const left = Math.min(
    Math.max(visibleLeft, idealLeft),
    Math.max(visibleLeft, container.scrollLeft + containerRect.width - width - margin)
  )
  const roomAbove = anchor.top - containerRect.top
  const roomBelow = containerRect.bottom - anchor.bottom
  const useAbove = (preferAbove && roomAbove >= height + gap) || roomBelow < height + gap
  const top = useAbove
    ? Math.max(visibleTop, anchor.top - containerRect.top + container.scrollTop - height - gap)
    : Math.min(
        container.scrollTop + containerRect.height - height - margin,
        anchor.bottom - containerRect.top + container.scrollTop + gap
      )
  return { left, top: Math.max(visibleTop, top), origin: useAbove ? 'bottom' : 'top' }
}

function keyboardNavigateMenu(event: React.KeyboardEvent<HTMLElement>): void {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    return
  }
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
  )
  if (!buttons.length) return
  event.preventDefault()
  const index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement))
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (index +
            (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) +
            buttons.length) %
          buttons.length
  buttons[nextIndex]?.focus()
}

export const TaskNotesEditor = React.forwardRef<TaskNotesEditorHandle, TaskNotesEditorProps>(
  function TaskNotesEditor({ initialHtml, onChange }, ref): React.ReactElement {
    const shellRef = useRef<HTMLDivElement>(null)
    const editorRef = useRef<HTMLDivElement>(null)
    const savedRangeRef = useRef<Range | null>(null)
    const [isFocused, setIsFocused] = useState(false)
    const [isEmpty, setIsEmpty] = useState(true)
    const [selectionPosition, setSelectionPosition] = useState<MenuPosition | null>(null)
    const [blockPosition, setBlockPosition] = useState<MenuPosition | null>(null)
    const [blockHandleTop, setBlockHandleTop] = useState<number | null>(null)
    const [blockMenuOpen, setBlockMenuOpen] = useState(false)
    const [activeContext, setActiveContext] = useState<ActiveEditorContext>(EMPTY_CONTEXT)
    const [slashState, setSlashState] = useState<SlashState | null>(null)
    const [slashIndex, setSlashIndex] = useState(0)
    const [palette, setPalette] = useState<Palette>(null)
    const [linkValue, setLinkValue] = useState('https://')
    const [tableSize, setTableSize] = useState({ rows: 3, columns: 3 })
    const reduceMotion = useReducedMotion()

    const closeMenus = useCallback((): void => {
      setSelectionPosition(null)
      setBlockMenuOpen(false)
      setSlashState(null)
      setPalette(null)
    }, [])

    const handleFloatingMenuKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLElement>): void => {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeMenus()
          const editor = editorRef.current
          if (editor) restoreEditorRange(editor, savedRangeRef.current)
          return
        }
        keyboardNavigateMenu(event)
      },
      [closeMenus]
    )

    const emitChange = useCallback((): void => {
      const editor = editorRef.current
      if (!editor) return
      const snapshot = createRichTextSnapshot(editor)
      setIsEmpty(!snapshot.plainText && !editor.querySelector('table'))
      onChange(snapshot)
    }, [onChange])

    const afterMutation = useCallback((): void => {
      requestAnimationFrame(() => {
        emitChange()
        const editor = editorRef.current
        if (editor) setActiveContext(getActiveEditorContext(editor))
      })
    }, [emitChange])

    useEffect(() => {
      const editor = editorRef.current
      if (!editor) return
      const sanitized = sanitizeRichTextHtml(initialHtml)
      editor.innerHTML = sanitized
      setIsEmpty(!richTextHtmlToPlainText(sanitized) && !editor.querySelector('table'))
      closeMenus()
    }, [closeMenus, initialHtml])

    const updateSelectionContext = useCallback((): void => {
      const editor = editorRef.current
      const shell = shellRef.current
      if (!editor || !shell) return
      const range = selectionRangeWithin(editor)
      if (!range) {
        setSelectionPosition(null)
        setBlockHandleTop(null)
        return
      }

      const context = getActiveEditorContext(editor, range)
      setActiveContext(context)
      savedRangeRef.current = range.cloneRange()
      const shellRect = shell.getBoundingClientRect()

      if (!range.collapsed && range.toString().trim()) {
        const rect = range.getBoundingClientRect()
        setSelectionPosition(positionMenu(rect, shell, 392, 42, true))
        setBlockHandleTop(null)
        setBlockMenuOpen(false)
        setSlashState(null)
        return
      }

      setSelectionPosition(null)
      if (context.block) {
        const blockRect = context.block.getBoundingClientRect()
        setBlockHandleTop(
          Math.min(
            shell.scrollTop + shellRect.height - 30,
            Math.max(shell.scrollTop + 8, blockRect.top - shellRect.top + shell.scrollTop + 1)
          )
        )
      } else {
        setBlockHandleTop(null)
      }
    }, [])

    useEffect(() => {
      const handleSelectionChange = (): void => updateSelectionContext()
      document.addEventListener('selectionchange', handleSelectionChange)
      window.addEventListener('resize', handleSelectionChange)
      return () => {
        document.removeEventListener('selectionchange', handleSelectionChange)
        window.removeEventListener('resize', handleSelectionChange)
      }
    }, [updateSelectionContext])

    const runNative = useCallback(
      (command: string, value?: string, range = savedRangeRef.current): void => {
        const editor = editorRef.current
        if (!editor) return
        executeNativeCommand(editor, range, command, value)
        savedRangeRef.current = selectionRangeWithin(editor)?.cloneRange() ?? null
        afterMutation()
      },
      [afterMutation]
    )

    const openPalette = useCallback((nextPalette: Palette): void => {
      setPalette(nextPalette)
      setSelectionPosition((current) => current)
    }, [])

    const openPaletteAtRange = useCallback(
      (nextPalette: Exclude<Palette, null>, range: Range | null): void => {
        const shell = shellRef.current
        if (!shell || !range) return
        savedRangeRef.current = range.cloneRange()
        const size = { width: 220, height: nextPalette === 'table' ? 210 : 110 }
        setSelectionPosition(positionMenu(caretClientRect(range), shell, size.width, size.height))
        setBlockMenuOpen(false)
        setPalette(nextPalette)
      },
      []
    )

    const applyTextColor = useCallback(
      (value: TextColorName | null): void => {
        const editor = editorRef.current
        if (!editor) return
        applyInlineAttribute(editor, savedRangeRef.current, 'data-text-color', value)
        setPalette(null)
        afterMutation()
      },
      [afterMutation]
    )

    const applyHighlight = useCallback(
      (value: HighlightName | null): void => {
        const editor = editorRef.current
        if (!editor) return
        applyInlineAttribute(editor, savedRangeRef.current, 'data-highlight', value)
        setPalette(null)
        afterMutation()
      },
      [afterMutation]
    )

    const clearFormatting = useCallback((): void => {
      const editor = editorRef.current
      if (!editor) return
      clearRichFormatting(editor, savedRangeRef.current)
      setPalette(null)
      afterMutation()
    }, [afterMutation])

    const applyList = useCallback(
      (
        style: 'bullet' | 'decimal' | 'lower-alpha' | 'upper-alpha',
        range = savedRangeRef.current
      ) => {
        const editor = editorRef.current
        if (!editor) return
        setListStyle(editor, range, style)
        setBlockMenuOpen(false)
        afterMutation()
      },
      [afterMutation]
    )

    const insertTable = useCallback(
      (rows: number, columns: number, range = savedRangeRef.current): void => {
        const editor = editorRef.current
        if (!editor) return
        insertTableAtRange(editor, range, rows, columns)
        setPalette(null)
        setSelectionPosition(null)
        setBlockMenuOpen(false)
        afterMutation()
      },
      [afterMutation]
    )

    const slashCommands = useMemo<SlashCommand[]>(
      () => [
        {
          id: 'paragraph',
          label: 'Paragraph',
          keywords: 'normal text paragraph',
          run: (range) => runNative('formatBlock', 'p', range)
        },
        {
          id: 'heading-1',
          label: 'Heading 1',
          keywords: 'h1 title heading 1',
          run: (range) => runNative('formatBlock', 'h1', range)
        },
        {
          id: 'heading-2',
          label: 'Heading 2',
          keywords: 'h2 subtitle heading 2',
          run: (range) => runNative('formatBlock', 'h2', range)
        },
        {
          id: 'heading-3',
          label: 'Heading 3',
          keywords: 'h3 heading 3',
          run: (range) => runNative('formatBlock', 'h3', range)
        },
        {
          id: 'section-heading',
          label: 'Small section heading',
          keywords: 'h4 small section heading',
          run: (range) => runNative('formatBlock', 'h4', range)
        },
        {
          id: 'bullet',
          label: 'Bulleted list',
          keywords: 'bullet unordered list',
          run: (range) => applyList('bullet', range)
        },
        {
          id: 'numbered',
          label: 'Numbered list',
          keywords: 'number decimal ordered list',
          run: (range) => applyList('decimal', range)
        },
        {
          id: 'alphabetical',
          label: 'Alphabetical list',
          keywords: 'alphabetical lowercase letters list',
          run: (range) => applyList('lower-alpha', range)
        },
        {
          id: 'alphabetical-upper',
          label: 'Uppercase alphabetical list',
          keywords: 'alphabetical uppercase letters list',
          run: (range) => applyList('upper-alpha', range)
        },
        {
          id: 'table',
          label: 'Insert table',
          keywords: 'table rows columns grid',
          run: (range) => {
            openPaletteAtRange('table', range)
          }
        },
        {
          id: 'highlight',
          label: 'Yellow highlight',
          keywords: 'highlight marker yellow',
          run: (range) => {
            savedRangeRef.current = range
            applyHighlight('yellow')
          }
        },
        {
          id: 'text-color',
          label: 'Blue text',
          keywords: 'text color blue foreground',
          run: (range) => {
            savedRangeRef.current = range
            applyTextColor('blue')
          }
        }
      ],
      [applyHighlight, applyList, applyTextColor, openPaletteAtRange, runNative]
    )

    const filteredSlashCommands = useMemo(() => {
      const query = slashState?.query.trim().toLocaleLowerCase() ?? ''
      return slashCommands.filter(
        (command) =>
          !query || `${command.label} ${command.keywords}`.toLocaleLowerCase().includes(query)
      )
    }, [slashCommands, slashState?.query])

    useEffect(() => setSlashIndex(0), [slashState?.query])

    const executeSlashCommand = useCallback(
      (command: SlashCommand): void => {
        if (!slashState) return
        const insertionRange = deleteRangeAndCollapse(slashState.range)
        savedRangeRef.current = insertionRange.cloneRange()
        setSlashState(null)
        command.run(insertionRange)
      },
      [slashState]
    )

    const openBlockMenu = useCallback((anchor?: DOMRect): void => {
      const editor = editorRef.current
      const shell = shellRef.current
      if (!editor || !shell) return
      const context = getActiveEditorContext(editor, savedRangeRef.current)
      setActiveContext(context)
      const reference =
        anchor ?? context.block?.getBoundingClientRect() ?? editor.getBoundingClientRect()
      setBlockPosition(positionMenu(reference, shell, 224, context.table ? 330 : 420))
      setBlockMenuOpen(true)
      setSelectionPosition(null)
      setPalette(null)
    }, [])

    const handleInput = (): void => {
      emitChange()
      const editor = editorRef.current
      const shell = shellRef.current
      if (!editor || !shell) return
      const range = selectionRangeWithin(editor)
      if (!range) return
      savedRangeRef.current = range.cloneRange()
      setActiveContext(getActiveEditorContext(editor, range))
      const slash = slashCommandAtCaret(editor, range)
      if (!slash) {
        setSlashState(null)
        return
      }
      setSlashState({
        query: slash.query,
        range: slash.commandRange,
        position: positionMenu(caretClientRect(range), shell, 276, 292)
      })
      setSelectionPosition(null)
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const editor = editorRef.current
      if (!editor) return

      if (slashState) {
        if (
          filteredSlashCommands.length > 0 &&
          (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        ) {
          event.preventDefault()
          const direction = event.key === 'ArrowDown' ? 1 : -1
          setSlashIndex(
            (current) =>
              (current + direction + filteredSlashCommands.length) % filteredSlashCommands.length
          )
          return
        }
        if (event.key === 'Enter' && filteredSlashCommands[slashIndex]) {
          event.preventDefault()
          executeSlashCommand(filteredSlashCommands[slashIndex])
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setSlashState(null)
          return
        }
      }

      const context = getActiveEditorContext(editor)
      if (event.key === 'Tab' && context.cell) {
        event.preventDefault()
        navigateTableCell(context.cell, event.shiftKey)
        afterMutation()
        return
      }
      if (event.key === 'Tab' && context.listItem) {
        event.preventDefault()
        executeNativeCommand(
          editor,
          selectionRangeWithin(editor),
          event.shiftKey ? 'outdent' : 'indent'
        )
        afterMutation()
        return
      }
      if (
        (event.key === 'Enter' || event.key === 'Backspace') &&
        context.listItem &&
        !context.listItem.textContent?.replace(/\u200b/g, '').trim()
      ) {
        event.preventDefault()
        executeNativeCommand(editor, selectionRangeWithin(editor), 'outdent')
        afterMutation()
        return
      }
      if (event.key === 'Escape' && (blockMenuOpen || palette || selectionPosition)) {
        event.preventDefault()
        closeMenus()
      }
    }

    const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>): void => {
      event.preventDefault()
      const html = event.clipboardData.getData('text/html')
      const plain = event.clipboardData.getData('text/plain')
      const table = tabSeparatedTextToHtml(plain)
      if (html) insertHtmlAtSelection(event.currentTarget, html)
      else if (table) insertHtmlAtSelection(event.currentTarget, table)
      else insertHtmlAtSelection(event.currentTarget, plainTextToHtml(plain))
      afterMutation()
    }

    const handleCopy = (event: React.ClipboardEvent<HTMLDivElement>): void => {
      const editor = editorRef.current
      const range = editor ? selectionRangeWithin(editor) : null
      if (!editor || !range || range.collapsed) return
      event.preventDefault()
      const container = document.createElement('div')
      container.append(range.cloneContents())
      const html = sanitizeRichTextHtml(container.innerHTML)
      event.clipboardData.setData('text/html', clipboardHtmlFromHtml(html))
      event.clipboardData.setData('text/plain', richTextHtmlToPlainText(html))
    }

    const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
      event.preventDefault()
      const range = selectionRangeWithin(event.currentTarget)
      if (range) savedRangeRef.current = range.cloneRange()
      openBlockMenu(new DOMRect(event.clientX, event.clientY, 1, 1))
    }

    const blockAction = (action: string): void => {
      const editor = editorRef.current
      if (!editor) return
      const context = getActiveEditorContext(editor, savedRangeRef.current)
      if (action.startsWith('table:') && context.cell) {
        performTableAction(context.cell, action.slice(6) as TableAction)
      } else if (action === 'indent' || action === 'outdent') {
        executeNativeCommand(editor, savedRangeRef.current, action)
      } else if (action === 'move-up' && context.listItem) {
        moveListItem(context.listItem, -1)
      } else if (action === 'move-down' && context.listItem) {
        moveListItem(context.listItem, 1)
      } else if (action === 'paragraph') {
        if (context.listItem) executeNativeCommand(editor, savedRangeRef.current, 'outdent')
        executeNativeCommand(editor, savedRangeRef.current, 'formatBlock', 'p')
      }
      setBlockMenuOpen(false)
      afterMutation()
    }

    const applyBlockFormat = (tagName: 'p' | 'h1' | 'h2' | 'h3' | 'h4'): void => {
      setBlockMenuOpen(false)
      runNative('formatBlock', tagName)
    }

    const submitLink = (event: React.FormEvent): void => {
      event.preventDefault()
      const value = linkValue.trim()
      if (value)
        runNative('createLink', /^(https?:|mailto:)/i.test(value) ? value : `https://${value}`)
      else runNative('unlink')
      setPalette(null)
    }

    useImperativeHandle(
      ref,
      () => ({
        copyAll: async () => {
          const editor = editorRef.current
          if (editor) await writeRichClipboard(createRichTextSnapshot(editor))
        },
        focus: () => editorRef.current?.focus(),
        getSnapshot: () =>
          editorRef.current
            ? createRichTextSnapshot(editorRef.current)
            : { html: '<p><br></p>', plainText: '', markdown: '' }
      }),
      []
    )

    const menuMotion = reduceMotion
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
      : {
          initial: { opacity: 0, scale: 0.96, y: 2 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 0.97, y: 2 }
        }

    const renderPalette = (): React.ReactNode => {
      if (!palette || !selectionPosition) return null
      const commonProps = {
        className: styles.palette,
        style: {
          left: selectionPosition.left,
          top: selectionPosition.top,
          transformOrigin: selectionPosition.origin
        },
        onKeyDown: handleFloatingMenuKeyDown,
        transition: springs.menu,
        ...menuMotion
      }

      if (palette === 'link') {
        return (
          <motion.form {...commonProps} onSubmit={submitLink} aria-label="Create link">
            <label className={styles.linkLabel} htmlFor="task-note-link">
              Link address
            </label>
            <div className={styles.linkRow}>
              <input
                id="task-note-link"
                autoFocus
                value={linkValue}
                onChange={(event) => setLinkValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setPalette(null)
                    editorRef.current?.focus()
                  }
                }}
              />
              <button type="submit">Apply</button>
            </div>
          </motion.form>
        )
      }

      if (palette === 'table') {
        return (
          <motion.div {...commonProps} role="dialog" aria-label="Choose table size">
            <div className={styles.paletteTitle} aria-live="polite">
              {tableSize.rows} × {tableSize.columns} table
            </div>
            <div className={styles.tableGrid} role="grid" aria-label="Table dimensions">
              {Array.from({ length: 36 }, (_, index) => {
                const row = Math.floor(index / 6) + 1
                const column = (index % 6) + 1
                const selected = row <= tableSize.rows && column <= tableSize.columns
                return (
                  <button
                    key={`${row}-${column}`}
                    type="button"
                    role="gridcell"
                    className={selected ? styles.tableGridSelected : ''}
                    aria-label={`${row} rows by ${column} columns`}
                    onPointerEnter={() => setTableSize({ rows: row, columns: column })}
                    onFocus={() => setTableSize({ rows: row, columns: column })}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insertTable(row, column)}
                  />
                )
              })}
            </div>
          </motion.div>
        )
      }

      const values = palette === 'text-color' ? TEXT_COLORS : HIGHLIGHTS
      return (
        <motion.div
          {...commonProps}
          role="menu"
          aria-label={palette === 'text-color' ? 'Text color' : 'Text highlight'}
        >
          <div className={styles.paletteTitle}>
            {palette === 'text-color' ? 'Text color' : 'Highlight'}
          </div>
          <div className={styles.swatches}>
            {values.map((item) => (
              <button
                key={item.label}
                className={styles.swatchButton}
                type="button"
                role="menuitem"
                title={item.label}
                aria-label={item.label}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() =>
                  palette === 'text-color'
                    ? applyTextColor(item.name as TextColorName | null)
                    : applyHighlight(item.name as HighlightName | null)
                }
              >
                <span
                  className={`${styles.swatch} ${item.name ? '' : styles.swatchReset}`}
                  data-color-kind={palette}
                  data-color-name={item.name ?? 'reset'}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </motion.div>
      )
    }

    return (
      <div ref={shellRef} className={styles.shell} onScroll={updateSelectionContext}>
        <div
          ref={editorRef}
          className={styles.editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Task notes content"
          aria-multiline="true"
          aria-placeholder="Add notes, details, or links…"
          data-empty={isEmpty ? 'true' : 'false'}
          spellCheck={false}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCopy={handleCopy}
          onContextMenu={handleContextMenu}
          onFocus={() => {
            setIsFocused(true)
            updateSelectionContext()
          }}
          onBlur={(event) => {
            if (!shellRef.current?.contains(event.relatedTarget as Node | null)) {
              setIsFocused(false)
              closeMenus()
            }
          }}
        />

        {isFocused && blockHandleTop != null && !selectionPosition && (
          <button
            className={styles.blockHandle}
            style={{ top: blockHandleTop }}
            type="button"
            aria-label="Open block formatting menu"
            title="Block options"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openBlockMenu()}
          >
            <span aria-hidden="true">⋮⋮</span>
          </button>
        )}

        {isFocused && !selectionPosition && (
          <button
            className={styles.formatTrigger}
            type="button"
            aria-label="Open formatting options"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openBlockMenu()}
          >
            Aa
          </button>
        )}

        <AnimatePresence>
          {selectionPosition && !palette && (
            <motion.div
              key="selection-toolbar"
              className={styles.selectionMenu}
              role="toolbar"
              aria-label="Text formatting"
              style={{
                left: selectionPosition.left,
                top: selectionPosition.top,
                transformOrigin: selectionPosition.origin
              }}
              onMouseDown={(event) => event.preventDefault()}
              onKeyDown={handleFloatingMenuKeyDown}
              transition={springs.menu}
              {...menuMotion}
            >
              <button
                type="button"
                aria-label="Bold"
                title="Bold"
                onClick={() => runNative('bold')}
              >
                <strong>B</strong>
              </button>
              <button
                type="button"
                aria-label="Italic"
                title="Italic"
                onClick={() => runNative('italic')}
              >
                <em>I</em>
              </button>
              <button
                type="button"
                aria-label="Underline"
                title="Underline"
                onClick={() => runNative('underline')}
              >
                <u>U</u>
              </button>
              <button
                type="button"
                aria-label="Strikethrough"
                title="Strikethrough"
                onClick={() => runNative('strikeThrough')}
              >
                <s>S</s>
              </button>
              <span className={styles.menuDivider} aria-hidden="true" />
              <button
                type="button"
                aria-label="Text color"
                title="Text color"
                onClick={() => openPalette('text-color')}
              >
                A
              </button>
              <button
                type="button"
                aria-label="Highlight"
                title="Highlight"
                onClick={() => openPalette('highlight')}
              >
                <span className={styles.marker}>H</span>
              </button>
              <button
                type="button"
                aria-label="Convert to heading"
                title="Heading"
                onClick={() => runNative('formatBlock', 'h2')}
              >
                H2
              </button>
              <button
                type="button"
                aria-label="Create link"
                title="Create link"
                onClick={() => openPalette('link')}
              >
                ↗
              </button>
              <button
                type="button"
                aria-label="Clear formatting"
                title="Clear formatting"
                onClick={clearFormatting}
              >
                Tx
              </button>
            </motion.div>
          )}

          {slashState && !palette && (
            <motion.div
              key="slash-menu"
              className={styles.commandMenu}
              role="listbox"
              aria-label="Slash commands"
              style={{
                left: slashState.position.left,
                top: slashState.position.top,
                transformOrigin: slashState.position.origin
              }}
              transition={springs.menu}
              {...menuMotion}
            >
              <div className={styles.commandTitle}>Insert or format</div>
              {filteredSlashCommands.length ? (
                filteredSlashCommands.map((command, index) => (
                  <button
                    key={command.id}
                    className={index === slashIndex ? styles.commandActive : ''}
                    type="button"
                    role="option"
                    aria-selected={index === slashIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerEnter={() => setSlashIndex(index)}
                    onClick={() => executeSlashCommand(command)}
                  >
                    <span className={styles.commandIcon} aria-hidden="true">
                      {command.label.slice(0, 2)}
                    </span>
                    {command.label}
                  </button>
                ))
              ) : (
                <div className={styles.noCommands}>No matching commands</div>
              )}
            </motion.div>
          )}

          {blockMenuOpen && blockPosition && (
            <motion.div
              key="block-menu"
              className={styles.blockMenu}
              role="menu"
              aria-label={activeContext.table ? 'Table options' : 'Block options'}
              style={{
                left: blockPosition.left,
                top: blockPosition.top,
                transformOrigin: blockPosition.origin
              }}
              onKeyDown={handleFloatingMenuKeyDown}
              transition={springs.menu}
              {...menuMotion}
            >
              {activeContext.table ? (
                <>
                  <div className={styles.commandTitle}>Table</div>
                  {[
                    ['Add row above', 'table:row-above'],
                    ['Add row below', 'table:row-below'],
                    ['Add column before', 'table:column-before'],
                    ['Add column after', 'table:column-after'],
                    ['Delete row', 'table:delete-row'],
                    ['Delete column', 'table:delete-column'],
                    ['Merge with next cell', 'table:merge-right'],
                    ['Split cell', 'table:split-cell'],
                    ['Delete table', 'table:delete-table']
                  ].map(([label, action]) => (
                    <button
                      key={action}
                      type="button"
                      role="menuitem"
                      onClick={() => blockAction(action)}
                    >
                      {label}
                    </button>
                  ))}
                </>
              ) : activeContext.listItem ? (
                <>
                  <div className={styles.commandTitle}>List item</div>
                  <button type="button" role="menuitem" onClick={() => applyList('bullet')}>
                    Bulleted list
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyList('decimal')}>
                    Numbered list
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyList('lower-alpha')}>
                    Lowercase alphabetical
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyList('upper-alpha')}>
                    Uppercase alphabetical
                  </button>
                  <button type="button" role="menuitem" onClick={() => blockAction('indent')}>
                    Indent
                  </button>
                  <button type="button" role="menuitem" onClick={() => blockAction('outdent')}>
                    Outdent
                  </button>
                  <button type="button" role="menuitem" onClick={() => blockAction('move-up')}>
                    Move item up
                  </button>
                  <button type="button" role="menuitem" onClick={() => blockAction('move-down')}>
                    Move item down
                  </button>
                  <button type="button" role="menuitem" onClick={() => blockAction('paragraph')}>
                    Convert to paragraph
                  </button>
                  <button type="button" role="menuitem" onClick={() => blockAction('outdent')}>
                    Remove list formatting
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.commandTitle}>Block</div>
                  <button type="button" role="menuitem" onClick={() => applyBlockFormat('p')}>
                    Paragraph
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyBlockFormat('h1')}>
                    Heading 1
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyBlockFormat('h2')}>
                    Heading 2
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyBlockFormat('h3')}>
                    Heading 3
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyBlockFormat('h4')}>
                    Small section heading
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyList('bullet')}>
                    Bulleted list
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyList('decimal')}>
                    Numbered list
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyList('lower-alpha')}>
                    Lowercase alphabetical
                  </button>
                  <button type="button" role="menuitem" onClick={() => applyList('upper-alpha')}>
                    Uppercase alphabetical
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => openPaletteAtRange('table', savedRangeRef.current)}
                  >
                    Insert table…
                  </button>
                </>
              )}
            </motion.div>
          )}

          {renderPalette()}
        </AnimatePresence>
      </div>
    )
  }
)

TaskNotesEditor.displayName = 'TaskNotesEditor'
