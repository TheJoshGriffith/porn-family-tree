import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "family.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS performers (
  id            TEXT PRIMARY KEY,           -- StashDB performer id
  name          TEXT NOT NULL,
  disambiguation TEXT,
  gender        TEXT,
  birth_date    TEXT,                       -- used for role inference only, never shown
  image_url     TEXT
);
CREATE INDEX IF NOT EXISTS performers_name ON performers(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS performer_aliases (
  performer_id TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
  alias        TEXT NOT NULL,
  PRIMARY KEY (performer_id, alias)
);
CREATE INDEX IF NOT EXISTS aliases_alias ON performer_aliases(alias COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS scenes (
  id           TEXT PRIMARY KEY,            -- StashDB scene id
  title        TEXT,
  details      TEXT,
  release_date TEXT,
  studio       TEXT,
  image_url    TEXT,
  updated      TEXT
);

CREATE TABLE IF NOT EXISTS scene_tags (
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL,
  PRIMARY KEY (scene_id, tag)
);

CREATE TABLE IF NOT EXISTS scene_performers (
  scene_id     TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  performer_id TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
  role         TEXT,                        -- inferred, e.g. "mother"; NULL if unknown
  step         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scene_id, performer_id)
);
CREATE INDEX IF NOT EXISTS sp_performer ON scene_performers(performer_id);

-- One row per inferred relationship per scene. Directed kinds read "a is <kind> of b".
CREATE TABLE IF NOT EXISTS relationships (
  a        TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
  b        TEXT NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  step     INTEGER NOT NULL,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  PRIMARY KEY (a, b, kind, scene_id)
);
CREATE INDEX IF NOT EXISTS rel_a ON relationships(a);
CREATE INDEX IF NOT EXISTS rel_b ON relationships(b);

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

-- Home-page network map positions, recomputed by the scraper after each sync.
CREATE TABLE IF NOT EXISTS map_layout (
  performer_id TEXT PRIMARY KEY REFERENCES performers(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL
);
`;

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  // busy_timeout: the site, scheduled sync, backups and one-off scrapes share
  // this file, so wait for another writer instead of failing "database is locked".
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 30000;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function migrate(d: DatabaseSync) {
  const cols = d.prepare("PRAGMA table_info(performers)").all() as { name: string }[];
  // in_scope: who the site shows. A --from crawl limits it to the people it
  // visited; a full scrape sets everyone in scope.
  if (!cols.some((c) => c.name === "in_scope")) d.exec("ALTER TABLE performers ADD COLUMN in_scope INTEGER NOT NULL DEFAULT 1");
  d.exec(`CREATE VIEW IF NOT EXISTS rel_scoped AS
    SELECT r.* FROM relationships r
    JOIN performers pa ON pa.id = r.a AND pa.in_scope = 1
    JOIN performers pb ON pb.id = r.b AND pb.in_scope = 1`);
}

export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec("BEGIN");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

// node:sqlite returns null-prototype rows, which React refuses to pass to
// Client Components. These copy them into plain objects.
type Param = null | number | bigint | string | NodeJS.ArrayBufferView;

export function all<T>(sql: string, ...params: Param[]): T[] {
  return getDb().prepare(sql).all(...params).map((r) => ({ ...r }) as T);
}

export function one<T>(sql: string, ...params: Param[]): T | undefined {
  const r = getDb().prepare(sql).get(...params);
  return r ? ({ ...r } as T) : undefined;
}
