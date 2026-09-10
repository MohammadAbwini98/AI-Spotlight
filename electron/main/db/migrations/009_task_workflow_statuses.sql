-- Migration 009: Expand task workflow statuses without rebuilding related tables.
-- The temporary rename allows SQLite to replace the original inline CHECK safely.

DROP INDEX IF EXISTS idx_tasks_status;

ALTER TABLE tasks RENAME COLUMN status TO status_legacy;

ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending', 'dropped', 'in_progress', 'completed', 'follow_up'));

UPDATE tasks SET status = status_legacy;

ALTER TABLE tasks DROP COLUMN status_legacy;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
