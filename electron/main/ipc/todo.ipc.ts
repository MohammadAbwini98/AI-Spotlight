import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { IPC } from '../../shared/ipc-channels'
import { getDb } from '../db/database'
import type {
  ApiResult,
  Task,
  TodoList,
  Tag,
  Note,
  CreateTaskInput,
  UpdateTaskInput,
  CreateListInput,
  UpsertNoteInput
} from '../../shared/types'
import type { TaskStatus } from '../../shared/types'
import { registerTrustedHandler } from './security'

const TASK_STATUSES = new Set<TaskStatus>([
  'pending',
  'dropped',
  'in_progress',
  'completed',
  'follow_up'
])

export function registerTodoHandlers(): void {
  // ─── Tasks ────────────────────────────────────────────────────────────────

  registerTrustedHandler(IPC.TODO_GET_TASKS, (_e, listId?: number | null): ApiResult<Task[]> => {
    try {
      const db = getDb()
      const tasks =
        listId != null
          ? db
              .prepare(
                'SELECT * FROM tasks WHERE list_id = ? ORDER BY sort_order ASC, created_at ASC'
              )
              .all(listId)
          : db.prepare('SELECT * FROM tasks ORDER BY sort_order ASC, created_at ASC').all()

      return { ok: true, data: (tasks as Record<string, unknown>[]).map(rowToTask(db)) }
    } catch (err) {
      return { ok: false, error: { code: 'GET_TASKS_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.TODO_CREATE_TASK, (_e, input: CreateTaskInput): ApiResult<Task> => {
    try {
      const db = getDb()
      const maxOrder =
        (db.prepare('SELECT MAX(sort_order) as m FROM tasks').get() as { m: number | null }).m ?? 0
      const result = db
        .prepare(
          `
        INSERT INTO tasks (list_id, title, notes, priority, due_at, reminder, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          input.listId ?? null,
          input.title,
          input.notes ?? null,
          input.priority ?? 'none',
          input.dueAt ?? null,
          input.reminder ?? null,
          maxOrder + 1
        )

      const task = db
        .prepare('SELECT * FROM tasks WHERE id = ?')
        .get(result.lastInsertRowid) as Record<string, unknown>
      return { ok: true, data: rowToTask(db)(task) }
    } catch (err) {
      return { ok: false, error: { code: 'CREATE_TASK_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.TODO_UPDATE_TASK, (_e, input: UpdateTaskInput): ApiResult<Task> => {
    try {
      const db = getDb()
      const updates: string[] = ["updated_at = datetime('now')"]
      const params: unknown[] = []

      if (input.title !== undefined) {
        updates.push('title = ?')
        params.push(input.title)
      }
      if (input.notes !== undefined) {
        updates.push('notes = ?')
        params.push(input.notes)
      }
      if (input.status !== undefined) {
        if (!TASK_STATUSES.has(input.status)) {
          return {
            ok: false,
            error: { code: 'INVALID_TASK_STATUS', message: 'Unsupported task status.' }
          }
        }
        updates.push('status = ?')
        params.push(input.status)
        if (input.status === 'completed' || input.status === 'dropped') {
          updates.push('completed_at = COALESCE(completed_at, ?)')
          params.push(new Date().toISOString())
        } else {
          updates.push('completed_at = NULL')
        }
      }
      if (input.priority !== undefined) {
        updates.push('priority = ?')
        params.push(input.priority)
      }
      if (input.dueAt !== undefined) {
        updates.push('due_at = ?')
        params.push(input.dueAt)
      }
      if (input.reminder !== undefined) {
        updates.push('reminder = ?')
        params.push(input.reminder)
      }
      if (input.listId !== undefined) {
        updates.push('list_id = ?')
        params.push(input.listId)
      }

      params.push(input.id)
      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params)

      if (input.tagIds !== undefined) {
        db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(input.id)
        for (const tagId of input.tagIds) {
          db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)').run(
            input.id,
            tagId
          )
        }
      }

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(input.id) as Record<
        string,
        unknown
      >
      return { ok: true, data: rowToTask(db)(task) }
    } catch (err) {
      return { ok: false, error: { code: 'UPDATE_TASK_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.TODO_DELETE_TASK, (_e, id: number): ApiResult<void> => {
    try {
      getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'DELETE_TASK_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.TODO_REORDER_TASKS, (_e, orderedIds: number[]): ApiResult<void> => {
    try {
      const db = getDb()
      db.transaction(() => {
        orderedIds.forEach((id, index) => {
          db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?').run(index, id)
        })
      })()
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'REORDER_ERROR', message: String(err) } }
    }
  })

  // ─── Lists ────────────────────────────────────────────────────────────────

  registerTrustedHandler(IPC.TODO_GET_LISTS, (): ApiResult<TodoList[]> => {
    try {
      const db = getDb()
      const lists = db
        .prepare(
          `
        SELECT l.*, COUNT(t.id) as task_count
        FROM lists l
        LEFT JOIN tasks t ON t.list_id = l.id AND t.status NOT IN ('completed', 'dropped')
        GROUP BY l.id
        ORDER BY l.sort_order ASC, l.created_at ASC
      `
        )
        .all() as Record<string, unknown>[]

      return {
        ok: true,
        data: lists.map((r) => ({
          id: r.id as number,
          name: r.name as string,
          sortOrder: r.sort_order as number,
          taskCount: r.task_count as number,
          createdAt: r.created_at as string
        }))
      }
    } catch (err) {
      return { ok: false, error: { code: 'GET_LISTS_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(
    IPC.TODO_CREATE_LIST,
    (_e, input: CreateListInput): ApiResult<TodoList> => {
      try {
        const db = getDb()
        const maxOrder =
          (db.prepare('SELECT MAX(sort_order) as m FROM lists').get() as { m: number | null }).m ??
          0
        const result = db
          .prepare('INSERT INTO lists (name, sort_order) VALUES (?, ?)')
          .run(input.name, maxOrder + 1)
        const list = db
          .prepare('SELECT * FROM lists WHERE id = ?')
          .get(result.lastInsertRowid) as Record<string, unknown>
        return {
          ok: true,
          data: {
            id: list.id as number,
            name: list.name as string,
            sortOrder: list.sort_order as number,
            taskCount: 0,
            createdAt: list.created_at as string
          }
        }
      } catch (err) {
        return { ok: false, error: { code: 'CREATE_LIST_ERROR', message: String(err) } }
      }
    }
  )

  registerTrustedHandler(IPC.TODO_UPDATE_LIST, (_e, id: number, name: string): ApiResult<void> => {
    try {
      getDb()
        .prepare("UPDATE lists SET name = ?, updated_at = datetime('now') WHERE id = ?")
        .run(name, id)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'UPDATE_LIST_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.TODO_DELETE_LIST, (_e, id: number): ApiResult<void> => {
    try {
      getDb().prepare('DELETE FROM lists WHERE id = ?').run(id)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'DELETE_LIST_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.TODO_REORDER_LISTS, (_e, orderedIds: number[]): ApiResult<void> => {
    try {
      const db = getDb()
      db.transaction(() => {
        orderedIds.forEach((id, index) => {
          db.prepare('UPDATE lists SET sort_order = ? WHERE id = ?').run(index, id)
        })
      })()
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'REORDER_ERROR', message: String(err) } }
    }
  })

  // ─── Tags ─────────────────────────────────────────────────────────────────

  registerTrustedHandler(IPC.TODO_GET_TAGS, (): ApiResult<Tag[]> => {
    try {
      return { ok: true, data: getDb().prepare('SELECT * FROM tags ORDER BY name').all() as Tag[] }
    } catch (err) {
      return { ok: false, error: { code: 'GET_TAGS_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(
    IPC.TODO_CREATE_TAG,
    (_e, name: string, color?: string): ApiResult<Tag> => {
      try {
        const db = getDb()
        const result = db
          .prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)')
          .run(name, color ?? null)
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as Tag
        return { ok: true, data: tag }
      } catch (err) {
        return { ok: false, error: { code: 'CREATE_TAG_ERROR', message: String(err) } }
      }
    }
  )

  registerTrustedHandler(IPC.TODO_DELETE_TAG, (_e, id: number): ApiResult<void> => {
    try {
      getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'DELETE_TAG_ERROR', message: String(err) } }
    }
  })

  // ─── Notes ────────────────────────────────────────────────────────────────

  registerTrustedHandler(
    IPC.TODO_GET_NOTES,
    (_e, taskId?: number, listId?: number): ApiResult<Note | null> => {
      try {
        const db = getDb()
        let note: unknown
        if (taskId != null) {
          note = db.prepare('SELECT * FROM notes WHERE task_id = ?').get(taskId)
        } else if (listId != null) {
          note = db.prepare('SELECT * FROM notes WHERE list_id = ?').get(listId)
        } else {
          note = db
            .prepare('SELECT * FROM notes WHERE task_id IS NULL AND list_id IS NULL LIMIT 1')
            .get()
        }
        return { ok: true, data: note ? rowToNote(note as Record<string, unknown>) : null }
      } catch (err) {
        return { ok: false, error: { code: 'GET_NOTES_ERROR', message: String(err) } }
      }
    }
  )

  registerTrustedHandler(IPC.TODO_UPSERT_NOTE, (_e, input: UpsertNoteInput): ApiResult<Note> => {
    try {
      const db = getDb()
      const contentFormat = input.contentFormat ?? 'plain'
      const plainText = input.plainText ?? (contentFormat === 'plain' ? input.content : '')
      const markdown = input.markdown ?? plainText

      const note = db.transaction((): Record<string, unknown> => {
        if (input.taskId != null) {
          db.prepare(
            `INSERT INTO notes (
               task_id, list_id, content, content_format, plain_text, markdown
             ) VALUES (?, NULL, ?, ?, ?, ?)
             ON CONFLICT(task_id) DO UPDATE SET
               content = excluded.content,
               content_format = excluded.content_format,
               plain_text = excluded.plain_text,
               markdown = excluded.markdown,
               updated_at = datetime('now')`
          ).run(input.taskId, input.content, contentFormat, plainText, markdown)

          // tasks.notes is the existing FTS-backed plain-text projection.
          db.prepare("UPDATE tasks SET notes = ?, updated_at = datetime('now') WHERE id = ?").run(
            plainText,
            input.taskId
          )
          return db.prepare('SELECT * FROM notes WHERE task_id = ?').get(input.taskId) as Record<
            string,
            unknown
          >
        }

        if (input.listId != null) {
          db.prepare(
            `INSERT INTO notes (
               task_id, list_id, content, content_format, plain_text, markdown
             ) VALUES (NULL, ?, ?, ?, ?, ?)
             ON CONFLICT(list_id) DO UPDATE SET
               content = excluded.content,
               content_format = excluded.content_format,
               plain_text = excluded.plain_text,
               markdown = excluded.markdown,
               updated_at = datetime('now')`
          ).run(input.listId, input.content, contentFormat, plainText, markdown)
          return db.prepare('SELECT * FROM notes WHERE list_id = ?').get(input.listId) as Record<
            string,
            unknown
          >
        }

        const result = db
          .prepare(
            `INSERT INTO notes (
               task_id, list_id, content, content_format, plain_text, markdown
             ) VALUES (NULL, NULL, ?, ?, ?, ?)`
          )
          .run(input.content, contentFormat, plainText, markdown)
        return db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid) as Record<
          string,
          unknown
        >
      })()

      return { ok: true, data: rowToNote(note) }
    } catch (err) {
      return { ok: false, error: { code: 'UPSERT_NOTE_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(IPC.TODO_DELETE_NOTE, (_e, id: number): ApiResult<void> => {
    try {
      getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
      return { ok: true, data: undefined }
    } catch (err) {
      return { ok: false, error: { code: 'DELETE_NOTE_ERROR', message: String(err) } }
    }
  })

  registerTrustedHandler(
    IPC.TODO_EXPORT_NOTE_MARKDOWN,
    async (event, taskId: number): Promise<ApiResult<string | null>> => {
      try {
        if (!Number.isInteger(taskId) || taskId <= 0) {
          return {
            ok: false,
            error: { code: 'INVALID_TASK_ID', message: 'A valid task is required.' }
          }
        }

        const task = getDb()
          .prepare(
            `SELECT t.title,
                    COALESCE(NULLIF(n.markdown, ''), n.plain_text, n.content, '') AS content
             FROM tasks t
             LEFT JOIN notes n ON n.task_id = t.id
             WHERE t.id = ?`
          )
          .get(taskId) as { title: string; content: string } | undefined

        if (!task) {
          return { ok: false, error: { code: 'TASK_NOT_FOUND', message: 'Task not found.' } }
        }

        const safeTitle = task.title
          .trim()
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
          .replace(/[. ]+$/g, '')
          .slice(0, 80)
        const options = {
          title: 'Export note as Markdown',
          defaultPath: `${safeTitle || 'task-note'}.md`,
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        }
        const parentWindow = BrowserWindow.fromWebContents(event.sender)
        const result = parentWindow
          ? await dialog.showSaveDialog(parentWindow, options)
          : await dialog.showSaveDialog(options)

        if (result.canceled || !result.filePath) return { ok: true, data: null }

        const markdown = `# ${task.title.trim() || 'Task note'}\n\n${task.content.trimEnd()}\n`
        await writeFile(result.filePath, markdown, { encoding: 'utf8', mode: 0o600 })
        return { ok: true, data: result.filePath }
      } catch (err) {
        return { ok: false, error: { code: 'EXPORT_NOTE_ERROR', message: String(err) } }
      }
    }
  )

  // ─── Todo Search ──────────────────────────────────────────────────────────

  registerTrustedHandler(IPC.TODO_SEARCH, (_e, text: string): ApiResult<Task[]> => {
    try {
      const db = getDb()
      const query = text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(' ')
      const rows = db
        .prepare(
          `
        SELECT t.* FROM tasks_fts
        JOIN tasks t ON t.id = tasks_fts.rowid
        WHERE tasks_fts MATCH ?
        ORDER BY bm25(tasks_fts)
        LIMIT 100
      `
        )
        .all(query) as Record<string, unknown>[]
      return { ok: true, data: rows.map(rowToTask(db)) }
    } catch (err) {
      return { ok: false, error: { code: 'TODO_SEARCH_ERROR', message: String(err) } }
    }
  })
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function rowToTask(db: import('better-sqlite3').Database) {
  return (r: Record<string, unknown>): Task => {
    const tags = db
      .prepare('SELECT t.* FROM tags t JOIN task_tags tt ON tt.tag_id = t.id WHERE tt.task_id = ?')
      .all(r.id) as Tag[]

    return {
      id: r.id as number,
      listId: r.list_id as number | null,
      title: r.title as string,
      notes: r.notes as string | null,
      status: r.status as Task['status'],
      priority: r.priority as Task['priority'],
      dueAt: r.due_at as string | null,
      reminder: r.reminder as string | null,
      completedAt: r.completed_at as string | null,
      sortOrder: r.sort_order as number,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
      tags
    }
  }
}

function rowToNote(r: Record<string, unknown>): Note {
  return {
    id: r.id as number,
    taskId: r.task_id as number | null,
    listId: r.list_id as number | null,
    content: r.content as string,
    contentFormat: (r.content_format as Note['contentFormat']) ?? 'plain',
    plainText: (r.plain_text as string) ?? (r.content as string),
    markdown: (r.markdown as string) ?? (r.content as string),
    updatedAt: r.updated_at as string
  }
}
