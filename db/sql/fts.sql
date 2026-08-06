-- Full-text search over the verbatim workout text.
--
-- Movement search (block_movements) is the primary path and is always correct
-- for anything tagged. This is the fallback: it finds workouts by words that
-- were never tagged — "EMOM", "hero", "Murph vest", a coach's cue in the notes.
--
-- External-content table: FTS5 stores only the index and reads the text back
-- from `blocks`, so the raw text is never duplicated. That makes the triggers
-- below mandatory — without them the index silently drifts from the data.
--
-- Run this after the Drizzle-generated migration that creates `blocks`.

CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
  raw_text,
  title,
  notes,
  content='blocks',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS blocks_fts_ai AFTER INSERT ON blocks BEGIN
  INSERT INTO blocks_fts(rowid, raw_text, title, notes)
  VALUES (new.id, new.raw_text, new.title, new.notes);
END;

CREATE TRIGGER IF NOT EXISTS blocks_fts_ad AFTER DELETE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, raw_text, title, notes)
  VALUES ('delete', old.id, old.raw_text, old.title, old.notes);
END;

CREATE TRIGGER IF NOT EXISTS blocks_fts_au AFTER UPDATE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, raw_text, title, notes)
  VALUES ('delete', old.id, old.raw_text, old.title, old.notes);
  INSERT INTO blocks_fts(rowid, raw_text, title, notes)
  VALUES (new.id, new.raw_text, new.title, new.notes);
END;

-- Backfill anything logged before this migration ran.
INSERT INTO blocks_fts(rowid, raw_text, title, notes)
SELECT id, raw_text, title, notes FROM blocks
WHERE id NOT IN (SELECT rowid FROM blocks_fts);
