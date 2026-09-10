-- Migration 010: rich task-note persistence
-- Existing note content remains plain text and is projected into task search.

ALTER TABLE notes ADD COLUMN content_format TEXT NOT NULL DEFAULT 'plain'
  CHECK(content_format IN ('plain', 'html'));
ALTER TABLE notes ADD COLUMN plain_text TEXT NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN markdown TEXT NOT NULL DEFAULT '';

UPDATE notes
SET plain_text = content,
    markdown = content
WHERE content_format = 'plain';

UPDATE tasks
SET notes = (
  SELECT notes.plain_text
  FROM notes
  WHERE notes.task_id = tasks.id
)
WHERE EXISTS (
  SELECT 1
  FROM notes
  WHERE notes.task_id = tasks.id
);
