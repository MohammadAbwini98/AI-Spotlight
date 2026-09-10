-- Migration 002: Todo schema
-- Creates: lists, tasks, tags, task_tags, notes

-- ─── Lists ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Tasks ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id      INTEGER REFERENCES lists(id) ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  notes        TEXT,
  status       TEXT    NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending', 'completed')),
  priority     TEXT    NOT NULL DEFAULT 'none'
                       CHECK(priority IN ('none', 'low', 'medium', 'high')),
  due_at       TEXT,
  completed_at TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_list_id    ON tasks(list_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at     ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_priority   ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order);

-- FTS5 for task search (title + notes)

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  title,
  notes,
  content=tasks,
  content_rowid=id,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, title, notes) VALUES (new.id, new.title, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, notes)
    VALUES ('delete', old.id, old.title, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, title, notes)
    VALUES ('delete', old.id, old.title, old.notes);
  INSERT INTO tasks_fts(rowid, title, notes) VALUES (new.id, new.title, new.notes);
END;

-- ─── Tags ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT    NOT NULL UNIQUE,
  color TEXT
);

-- ─── Task ↔ Tag join ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS task_tags (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- ─── Notes ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  list_id    INTEGER UNIQUE REFERENCES lists(id) ON DELETE CASCADE,
  content    TEXT    NOT NULL DEFAULT '',
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  -- At most one of task_id or list_id can be set (standalone note = both null)
  CHECK (NOT (task_id IS NOT NULL AND list_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_notes_task_id ON notes(task_id);
CREATE INDEX IF NOT EXISTS idx_notes_list_id ON notes(list_id);
