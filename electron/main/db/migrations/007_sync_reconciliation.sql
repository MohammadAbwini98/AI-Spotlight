-- Migration 007: force one trusted reconciliation after the indexing protocol upgrade.

CREATE INDEX IF NOT EXISTS idx_files_name_normalized_nocase
  ON files(name_normalized COLLATE NOCASE);

UPDATE app_settings SET value = 'false' WHERE key = 'scanCompleted';

INSERT INTO index_runtime (key, value, updated_at)
VALUES ('index_schema_version', '2', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
