import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { seedIfEmpty } from "./seed";

const DEFAULT_PATH = "./data/journey-valley.db";

let instance: Database.Database | null = null;

/**
 * Lazily opens (and migrates, and on first run seeds) the SQLite database.
 * Next.js keeps module state per server process, so the handle is reused
 * across requests and survives hot reloads via `globalThis`.
 */
export function getDb(): Database.Database {
  if (instance) return instance;

  const globalRef = globalThis as typeof globalThis & {
    __journeyValleyDb?: Database.Database;
  };
  if (globalRef.__journeyValleyDb) {
    instance = globalRef.__journeyValleyDb;
    return instance;
  }

  // The database path is configuration, not a module import: the bundler must
  // not try to trace it back to project files.
  const path = resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH ?? DEFAULT_PATH);
  mkdirSync(dirname(path), { recursive: true });

  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  seedIfEmpty(db);

  instance = db;
  globalRef.__journeyValleyDb = db;
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','plus')),
      home_city     TEXT NOT NULL DEFAULT '',
      currency      TEXT NOT NULL DEFAULT 'EUR',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trips (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title               TEXT NOT NULL,
      summary             TEXT NOT NULL DEFAULT '',
      destination_city    TEXT NOT NULL,
      destination_country TEXT NOT NULL,
      start_date          TEXT NOT NULL,
      end_date            TEXT NOT NULL,
      stage               TEXT NOT NULL DEFAULT 'idea'
                          CHECK (stage IN ('idea','planning','booked','travelling','completed','cancelled')),
      currency            TEXT NOT NULL DEFAULT 'EUR',
      budget_cents        INTEGER NOT NULL DEFAULT 0,
      agency_quote_cents  INTEGER NOT NULL DEFAULT 0,
      travellers          INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id   INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role      TEXT NOT NULL DEFAULT 'companion' CHECK (role IN ('owner','companion')),
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (trip_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id            INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      type               TEXT NOT NULL CHECK (type IN ('flight','stay','activity','transport','other')),
      vendor             TEXT NOT NULL,
      reference          TEXT,
      description        TEXT NOT NULL DEFAULT '',
      start_at           TEXT NOT NULL,
      end_at             TEXT,
      amount_cents       INTEGER NOT NULL DEFAULT 0,
      agency_quote_cents INTEGER NOT NULL DEFAULT 0,
      nights             INTEGER,
      booked_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      paid_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category     TEXT NOT NULL
                   CHECK (category IN ('food','transport','lodging','activities','shopping','other')),
      description  TEXT NOT NULL DEFAULT '',
      spent_on     TEXT NOT NULL,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      shared       INTEGER NOT NULL DEFAULT 1 CHECK (shared IN (0,1)),
      participant_ids TEXT,
      receipt_name TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS checklist_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id    INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      label      TEXT NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id    INTEGER REFERENCES trips(id) ON DELETE CASCADE,
      actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action     TEXT NOT NULL,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_id, stage);
    CREATE INDEX IF NOT EXISTS idx_members_user ON trip_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_trip ON activity_log(trip_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checklist_trip ON checklist_items(trip_id, position, id);
  `);

  // Columns added after the first release. `CREATE TABLE IF NOT EXISTS` leaves
  // an existing table alone, so new columns need adding by hand.
  addColumn(db, "expenses", "participant_ids", "TEXT");
}

/** Adds a column only when the table does not already have it. */
function addColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare<[], { name: string }>(`PRAGMA table_info(${table})`).all();
  if (columns.some((entry) => entry.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function recordActivity(params: {
  tripId: number | null;
  actorId: number | null;
  action: string;
  detail?: string;
}): void {
  getDb()
    .prepare(`INSERT INTO activity_log (trip_id, actor_id, action, detail) VALUES (?, ?, ?, ?)`)
    .run(params.tripId, params.actorId, params.action, params.detail ?? null);
}
