-- Full-text search over the verbatim workout text.
--
-- Movement search (block_movements) is the primary path and is always correct
-- for anything tagged. This is the fallback: it finds workouts by words that
-- were never tagged — "EMOM", "hero", "Murph vest", a coach's cue.
--
-- External-content table: FTS5 stores only the index and reads the text back
-- from `blocks`, so the raw text is never duplicated. That makes the triggers
-- below mandatory — without them the index silently drifts from the data.
--
-- Dropped and rebuilt on every launch rather than created IF NOT EXISTS. The
-- triggers name the columns they index, so a schema change leaves an install
-- carrying triggers that reference a column that no longer exists, and every
-- write to `blocks` fails. Rebuilding is a few milliseconds over a personal
-- log and removes that whole class of drift. lib/db.ts runs it after the
-- drizzle migrations.

DROP TRIGGER IF EXISTS blocks_fts_ai;
DROP TRIGGER IF EXISTS blocks_fts_ad;
DROP TRIGGER IF EXISTS blocks_fts_au;
DROP TABLE IF EXISTS blocks_fts;

CREATE VIRTUAL TABLE blocks_fts USING fts5(
  raw_text,
  title,
  content='blocks',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER blocks_fts_ai AFTER INSERT ON blocks BEGIN
  INSERT INTO blocks_fts(rowid, raw_text, title)
  VALUES (new.id, new.raw_text, new.title);
END;

CREATE TRIGGER blocks_fts_ad AFTER DELETE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, raw_text, title)
  VALUES ('delete', old.id, old.raw_text, old.title);
END;

CREATE TRIGGER blocks_fts_au AFTER UPDATE ON blocks BEGIN
  INSERT INTO blocks_fts(blocks_fts, rowid, raw_text, title)
  VALUES ('delete', old.id, old.raw_text, old.title);
  INSERT INTO blocks_fts(rowid, raw_text, title)
  VALUES (new.id, new.raw_text, new.title);
END;

INSERT INTO blocks_fts(rowid, raw_text, title)
SELECT id, raw_text, title FROM blocks;
