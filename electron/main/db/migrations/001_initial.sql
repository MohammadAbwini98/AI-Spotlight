-- Migration 001: Initial schema
-- Creates: files, files_fts, scan_sessions, sync_status, app_settings



-- ─── File Entries ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS files (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  normalized_path   TEXT    NOT NULL UNIQUE,
  display_path      TEXT    NOT NULL,
  name              TEXT    NOT NULL,
  name_normalized   TEXT    NOT NULL,
  parent_path       TEXT    NOT NULL,
  entry_type        TEXT    NOT NULL CHECK(entry_type IN ('file', 'directory')),
  extension         TEXT,
  size              INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT,
  modified_at       TEXT,
  indexed_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_scan_id INTEGER,
  is_available      INTEGER NOT NULL DEFAULT 1,
  open_count        INTEGER NOT NULL DEFAULT 0,
  last_opened_at    TEXT,
  first_opened_at   TEXT,
  is_favorite       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_files_entry_type    ON files(entry_type);
CREATE INDEX IF NOT EXISTS idx_files_extension     ON files(extension);
CREATE INDEX IF NOT EXISTS idx_files_modified_at   ON files(modified_at);
CREATE INDEX IF NOT EXISTS idx_files_last_opened   ON files(last_opened_at);
CREATE INDEX IF NOT EXISTS idx_files_open_count    ON files(open_count DESC);
CREATE INDEX IF NOT EXISTS idx_files_parent_path   ON files(parent_path);
CREATE INDEX IF NOT EXISTS idx_files_is_available  ON files(is_available);

-- FTS5 virtual table for full-text search on name and path segments

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  name,
  name_normalized,
  display_path,
  content=files,
  content_rowid=id,
  tokenize='unicode61 remove_diacritics 2'
);

-- FTS5 triggers to keep files_fts in sync with files

CREATE TRIGGER IF NOT EXISTS files_fts_insert AFTER INSERT ON files BEGIN
  INSERT INTO files_fts(rowid, name, name_normalized, display_path)
    VALUES (new.id, new.name, new.name_normalized, new.display_path);
END;

CREATE TRIGGER IF NOT EXISTS files_fts_delete AFTER DELETE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name, name_normalized, display_path)
    VALUES ('delete', old.id, old.name, old.name_normalized, old.display_path);
END;

CREATE TRIGGER IF NOT EXISTS files_fts_update AFTER UPDATE ON files BEGIN
  INSERT INTO files_fts(files_fts, rowid, name, name_normalized, display_path)
    VALUES ('delete', old.id, old.name, old.name_normalized, old.display_path);
  INSERT INTO files_fts(rowid, name, name_normalized, display_path)
    VALUES (new.id, new.name, new.name_normalized, new.display_path);
END;

-- ─── Scan Sessions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scan_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  state       TEXT    NOT NULL DEFAULT 'running'
                      CHECK(state IN ('running', 'complete', 'cancelled', 'failed')),
  added       INTEGER NOT NULL DEFAULT 0,
  updated     INTEGER NOT NULL DEFAULT 0,
  removed     INTEGER NOT NULL DEFAULT 0,
  skipped     INTEGER NOT NULL DEFAULT 0,
  errors      INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER
);

-- ─── Sync Status (persistent, single row) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_status (
  id              INTEGER PRIMARY KEY CHECK(id = 1),
  last_sync_at    TEXT,
  last_duration_ms INTEGER,
  last_state      TEXT,
  last_added      INTEGER NOT NULL DEFAULT 0,
  last_updated    INTEGER NOT NULL DEFAULT 0,
  last_removed    INTEGER NOT NULL DEFAULT 0,
  last_skipped    INTEGER NOT NULL DEFAULT 0,
  last_errors     INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sync_status (id) VALUES (1);

-- ─── App Settings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Default settings
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('theme', 'crystal');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('reducedMotion', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('reducedTransparency', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('defaultPriority', 'none');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('showCompletedTasks', 'true');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('confirmBeforeDelete', 'true');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('scanRoots', 'null');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('scanCompleted', 'false');
