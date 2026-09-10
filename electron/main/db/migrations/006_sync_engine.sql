-- Migration 006: canonical synchronization states and durable per-run metrics.

ALTER TABLE scan_sessions RENAME TO scan_sessions_legacy;

CREATE TABLE scan_sessions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key               TEXT NOT NULL UNIQUE,
  mode                  TEXT NOT NULL CHECK(mode IN ('initial', 'incremental', 'reconcile')),
  started_at            TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at           TEXT,
  state                 TEXT NOT NULL CHECK(state IN (
                          'preparing', 'scanning', 'reconciling', 'paused', 'cancelling',
                          'complete', 'complete_with_warnings', 'cancelled', 'failed'
                        )),
  discovered            INTEGER NOT NULL DEFAULT 0,
  added                 INTEGER NOT NULL DEFAULT 0,
  updated               INTEGER NOT NULL DEFAULT 0,
  unchanged             INTEGER NOT NULL DEFAULT 0,
  newly_unavailable     INTEGER NOT NULL DEFAULT 0,
  restored              INTEGER NOT NULL DEFAULT 0,
  skipped               INTEGER NOT NULL DEFAULT 0,
  excluded              INTEGER NOT NULL DEFAULT 0,
  errors                INTEGER NOT NULL DEFAULT 0,
  directories_visited   INTEGER NOT NULL DEFAULT 0,
  files_visited         INTEGER NOT NULL DEFAULT 0,
  bytes_represented     INTEGER NOT NULL DEFAULT 0,
  duration_ms           INTEGER,
  cancellation_requested INTEGER NOT NULL DEFAULT 0
);

INSERT INTO scan_sessions (
  id, run_key, mode, started_at, finished_at, state, added, updated,
  newly_unavailable, skipped, errors, duration_ms
)
SELECT
  id,
  'legacy-' || id,
  'reconcile',
  started_at,
  finished_at,
  CASE state
    WHEN 'complete' THEN 'complete'
    WHEN 'cancelled' THEN 'cancelled'
    WHEN 'failed' THEN 'failed'
    ELSE 'failed'
  END,
  added,
  updated,
  removed,
  skipped,
  errors,
  duration_ms
FROM scan_sessions_legacy;

DROP TABLE scan_sessions_legacy;
CREATE INDEX idx_scan_sessions_started_at ON scan_sessions(started_at DESC);
CREATE INDEX idx_scan_sessions_state ON scan_sessions(state);

ALTER TABLE sync_status ADD COLUMN last_run_key TEXT;
ALTER TABLE sync_status ADD COLUMN last_mode TEXT;
ALTER TABLE sync_status ADD COLUMN last_discovered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_status ADD COLUMN last_unchanged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_status ADD COLUMN last_newly_unavailable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_status ADD COLUMN last_restored INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_status ADD COLUMN last_excluded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_status ADD COLUMN last_directories_visited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_status ADD COLUMN last_files_visited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_status ADD COLUMN last_bytes_represented INTEGER NOT NULL DEFAULT 0;

UPDATE sync_status SET last_state = 'complete' WHERE last_state = 'success';

CREATE TABLE IF NOT EXISTS index_runtime (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
