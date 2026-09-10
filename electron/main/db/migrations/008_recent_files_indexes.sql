-- Migration 008: keep Recent/Frequent lookups off the main-process hot path.

CREATE INDEX IF NOT EXISTS idx_files_recent_available
  ON files(is_available, last_opened_at DESC)
  WHERE last_opened_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_files_frequent_available
  ON files(is_available, open_count DESC, last_opened_at DESC)
  WHERE open_count > 0;
