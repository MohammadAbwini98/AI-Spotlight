import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateIpcArguments } from '../electron/main/ipc/security'
import { IPC } from '../electron/shared/ipc-channels'
import { plainTextToHtml, tabSeparatedTextToHtml } from '../src/features/todo/rich-text-dom'

describe('integrated rich task notes', () => {
  it('keeps rich editing inside the existing Task note panel and flushes before task changes', () => {
    const noteEditor = readFileSync('src/features/todo/NoteEditor.tsx', 'utf8')
    const todoView = readFileSync('src/features/todo/TodoView.tsx', 'utf8')

    expect(noteEditor).toContain('<TaskNotesEditor')
    expect(noteEditor).toContain("contentFormat: 'html'")
    expect(noteEditor).not.toContain('<textarea')
    expect(todoView).toContain('await notePanelRef.current?.flush()')
    expect(todoView).toContain('notePanelRef.current?.contains(target)')
  })

  it('validates bounded rich HTML, plain text, Markdown, and the content format at IPC', () => {
    expect(() =>
      validateIpcArguments(IPC.TODO_UPSERT_NOTE, [
        {
          taskId: 1,
          content: '<p><strong>Plan</strong></p>',
          contentFormat: 'html',
          plainText: 'Plan',
          markdown: '**Plan**'
        }
      ])
    ).not.toThrow()

    expect(() =>
      validateIpcArguments(IPC.TODO_UPSERT_NOTE, [
        { taskId: 1, content: '<p>Plan</p>', contentFormat: 'script' }
      ])
    ).toThrow(/contentFormat/i)
  })

  it('migrates existing notes losslessly and maintains an FTS-backed plain-text projection', () => {
    const migration = readFileSync('electron/main/db/migrations/010_rich_task_notes.sql', 'utf8')
    const todoIpc = readFileSync('electron/main/ipc/todo.ipc.ts', 'utf8')

    expect(migration).toContain("content_format TEXT NOT NULL DEFAULT 'plain'")
    expect(migration).toContain('SET plain_text = content')
    expect(migration).toContain('SET notes = (')
    expect(todoIpc).toContain("UPDATE tasks SET notes = ?, updated_at = datetime('now')")
    expect(todoIpc).toContain("COALESCE(NULLIF(n.markdown, ''), n.plain_text, n.content, '')")
  })

  it('exposes contextual selection, slash, list, table, and keyboard interactions', () => {
    const editor = readFileSync('src/features/todo/TaskNotesEditor.tsx', 'utf8')

    expect(editor).toContain('selectionchange')
    expect(editor).toContain('slashCommandAtCaret')
    expect(editor).toContain("event.key === 'Tab' && context.cell")
    expect(editor).toContain("event.shiftKey ? 'outdent' : 'indent'")
    expect(editor).toContain("['Add row above', 'table:row-above']")
    expect(editor).toContain("['Merge with next cell', 'table:merge-right']")
    expect(editor).toContain('aria-label="Text formatting"')
    expect(editor).not.toContain('RichTextEditorPage')
  })
})

describe('rich note clipboard fallbacks', () => {
  it('converts tab-separated spreadsheet data into an editable HTML table', () => {
    expect(tabSeparatedTextToHtml('Name\tStatus\nAlpha\tReady')).toBe(
      '<table><tbody><tr><td>Name</td><td>Status</td></tr><tr><td>Alpha</td><td>Ready</td></tr></tbody></table>'
    )
    expect(tabSeparatedTextToHtml('one column')).toBeNull()
  })

  it('escapes plain text before inserting it as rich paragraphs', () => {
    expect(plainTextToHtml('<draft>\nline 2')).toBe('<p>&lt;draft&gt;<br>line 2</p>')
  })
})
