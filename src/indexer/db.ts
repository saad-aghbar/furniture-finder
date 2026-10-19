import Database from 'better-sqlite3'
import { NORMALIZER_VERSION } from '../shared/normalize'

export const SCHEMA_VERSION = 3

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sources(
  id INTEGER PRIMARY KEY,
  kind TEXT CHECK(kind IN ('folder','file')),
  path TEXT UNIQUE NOT NULL,
  added_at INTEGER,
  status TEXT NOT NULL DEFAULT 'ok'
);
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  path TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  size INTEGER,
  mtime INTEGER,
  hash TEXT,
  indexed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT
);
CREATE INDEX IF NOT EXISTS files_source ON files(source_id);
CREATE TABLE IF NOT EXISTS sheets(
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  idx INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  header_row INTEGER,
  headers_json TEXT NOT NULL,
  name_col INTEGER
);
CREATE INDEX IF NOT EXISTS sheets_file ON sheets(file_id);
CREATE TABLE IF NOT EXISTS rows(
  id INTEGER PRIMARY KEY,
  sheet_id INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  row_num INTEGER NOT NULL,
  cells_json TEXT NOT NULL,
  display_title TEXT,
  title_norm TEXT,
  norm_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rows_sheet ON rows(sheet_id);
CREATE INDEX IF NOT EXISTS rows_title ON rows(title_norm);
CREATE VIRTUAL TABLE IF NOT EXISTS rows_fts USING fts5(
  norm_text, content='rows', content_rowid='id', tokenize='trigram'
);
CREATE TRIGGER IF NOT EXISTS rows_ai AFTER INSERT ON rows BEGIN
  INSERT INTO rows_fts(rowid, norm_text) VALUES (new.id, new.norm_text);
END;
CREATE TRIGGER IF NOT EXISTS rows_ad AFTER DELETE ON rows BEGIN
  INSERT INTO rows_fts(rows_fts, rowid, norm_text) VALUES ('delete', old.id, old.norm_text);
END;
CREATE TABLE IF NOT EXISTS vocab(token TEXT PRIMARY KEY) WITHOUT ROWID;
`

const DROP = `
DROP TRIGGER IF EXISTS rows_ai;
DROP TRIGGER IF EXISTS rows_ad;
DROP TABLE IF EXISTS rows_fts;
DROP TABLE IF EXISTS rows;
DROP TABLE IF EXISTS sheets;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS sources;
DROP TABLE IF EXISTS vocab;
DROP TABLE IF EXISTS row_tokens;
`

export type DB = Database.Database

/**
 * Open (and migrate) the index database for writing. Returns `rebuilt: true` when the schema
 * or normaliser version changed and the old index was dropped – every file must be re-indexed.
 */
export function openWriteDb(file: string): { db: DB; rebuilt: boolean } {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);')
  const get = db.prepare('SELECT value FROM meta WHERE key = ?')
  const schema = Number((get.get('schema_version') as { value: string } | undefined)?.value ?? 0)
  const norm = Number((get.get('normalizer_version') as { value: string } | undefined)?.value ?? 0)
  let rebuilt = false
  if (schema !== SCHEMA_VERSION || norm !== NORMALIZER_VERSION) {
    rebuilt = schema !== 0
    db.exec(DROP)
  }
  db.exec(SCHEMA)
  const set = db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)')
  set.run('schema_version', String(SCHEMA_VERSION))
  set.run('normalizer_version', String(NORMALIZER_VERSION))
  return { db, rebuilt }
}

/** Open the database read-only for searching (main process). */
export function openReadDb(file: string): DB {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  db.pragma('busy_timeout = 2000')
  return db
}
