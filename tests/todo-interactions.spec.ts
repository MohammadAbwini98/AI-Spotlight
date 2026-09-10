import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Todo interaction regressions', () => {
  it('dismisses notes from outside interactions while preserving task note triggers', () => {
    const todoView = readFileSync('src/features/todo/TodoView.tsx', 'utf8')
    const taskList = readFileSync('src/features/todo/TaskList.tsx', 'utf8')

    expect(todoView).toContain('onPointerDownCapture')
    expect(todoView).toContain('notePanelRef.current?.contains(target)')
    expect(todoView).toContain('target.closest(\'[data-note-trigger="true"]\')')
    expect(taskList).toContain('data-note-trigger="true"')
  })

  it('keeps native status-menu options neutral instead of inheriting the selected status color', () => {
    const styles = readFileSync('src/features/todo/TaskList.module.css', 'utf8')

    expect(styles).toMatch(/\.statusControl option\s*{[^}]*color:\s*CanvasText;/s)
    expect(styles).toMatch(/\.statusControl option\s*{[^}]*background-color:\s*Canvas;/s)
  })

  it('extends notes to the task sidebar and keeps the selected list heading left aligned', () => {
    const noteStyles = readFileSync('src/features/todo/NoteEditor.module.css', 'utf8')
    const todoStyles = readFileSync('src/features/todo/TodoView.module.css', 'utf8')

    expect(noteStyles).toContain('inset: 0 0 0 200px')
    expect(todoStyles).toMatch(/\.heading\s*{[^}]*align-items:\s*flex-start;/s)
    expect(todoStyles).toMatch(/\.title\s*{[^}]*text-align:\s*left;/s)
  })

  it('shows the system start time, omits end-date entry, and keeps dark select options visible', () => {
    const createTask = readFileSync('src/features/todo/CreateTaskView.tsx', 'utf8')
    const styles = readFileSync('src/features/todo/CreateTaskView.module.css', 'utf8')
    const todoIpc = readFileSync('electron/main/ipc/todo.ipc.ts', 'utf8')

    expect(createTask).toContain('useState(() => new Date())')
    expect(createTask).toContain('Start Date')
    expect(createTask).not.toContain('End Date')
    expect(styles).toMatch(/\.field select option\s*{[^}]*color:\s*CanvasText;/s)
    expect(styles).toMatch(/\.field select option\s*{[^}]*background-color:\s*Canvas;/s)
    expect(todoIpc).toContain("input.status === 'completed' || input.status === 'dropped'")
    expect(todoIpc).toContain('completed_at = COALESCE(completed_at, ?)')
  })
})
