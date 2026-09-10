-- Migration 004: Avoid rebuilding FTS rows for scan bookkeeping updates.
-- A sync changes last_seen_scan_id for every available entry. The original
-- trigger unnecessarily deleted and reinserted every matching FTS row.

DROP TRIGGER IF EXISTS files_fts_update;

CREATE TRIGGER files_fts_update
AFTER UPDATE OF name, name_normalized, display_path ON files
WHEN old.name IS NOT new.name
  OR old.name_normalized IS NOT new.name_normalized
  OR old.display_path IS NOT new.display_path
BEGIN
  INSERT INTO files_fts(files_fts, rowid, name, name_normalized, display_path)
    VALUES ('delete', old.id, old.name, old.name_normalized, old.display_path);
  INSERT INTO files_fts(rowid, name, name_normalized, display_path)
    VALUES (new.id, new.name, new.name_normalized, new.display_path);
END;
