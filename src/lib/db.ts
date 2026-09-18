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

    CREATE TABLE IF NOT EXISTS agencies (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      name                  TEXT NOT NULL,
      legal_name            TEXT NOT NULL DEFAULT '',
      registration          TEXT NOT NULL DEFAULT '',
      email                 TEXT NOT NULL DEFAULT '',
      phone                 TEXT NOT NULL DEFAULT '',
      website               TEXT NOT NULL DEFAULT '',
      brand_colour          TEXT NOT NULL DEFAULT '#1d4ed8',
      target_margin_percent INTEGER NOT NULL DEFAULT 15,
      currency              TEXT NOT NULL DEFAULT 'EUR',
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id  INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL DEFAULT '',
      phone      TEXT NOT NULL DEFAULT '',
      notes      TEXT NOT NULL DEFAULT '',
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id         INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      agency_id       INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      reference       TEXT NOT NULL,
      -- Le lien public : long, aléatoire, et le seul moyen d'ouvrir le devis
      -- sans compte. Il vaut authentification, donc il ne doit jamais être
      -- devinable ni réutilisé d'un devis à l'autre.
      token           TEXT NOT NULL UNIQUE,
      status          TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','accepted','declined')),
      title           TEXT NOT NULL,
      intro           TEXT NOT NULL DEFAULT '',
      terms           TEXT NOT NULL DEFAULT '',
      total_cents     INTEGER NOT NULL DEFAULT 0,
      deposit_percent INTEGER NOT NULL DEFAULT 30,
      valid_until     TEXT,
      sent_at         TEXT,
      decided_at      TEXT,
      -- La trace de l'acceptation en ligne : qui a cliqué, quand, d'où.
      decided_by_name TEXT,
      decided_ip      TEXT,
      decided_note    TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quote_lines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      label       TEXT NOT NULL,
      detail      TEXT NOT NULL DEFAULT '',
      start_at    TEXT,
      end_at      TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      position    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id      INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      agency_id    INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      quote_id     INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
      reference    TEXT NOT NULL,
      token        TEXT NOT NULL UNIQUE,
      kind         TEXT NOT NULL CHECK (kind IN ('deposit','balance','full')),
      status       TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','issued','paid','cancelled')),
      label        TEXT NOT NULL DEFAULT '',
      total_cents  INTEGER NOT NULL DEFAULT 0,
      due_date     TEXT,
      issued_at    TEXT,
      paid_at      TEXT,
      payment_note TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE IF NOT EXISTS price_watches (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id          INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      kind             TEXT NOT NULL CHECK (kind IN ('flight','stay','activity')),
      origin           TEXT,
      destination      TEXT NOT NULL,
      start_date       TEXT NOT NULL,
      end_date         TEXT,
      travellers       INTEGER NOT NULL DEFAULT 1,
      target_cents     INTEGER NOT NULL DEFAULT 0,
      last_price_cents INTEGER,
      best_price_cents INTEGER,
      last_checked_at  TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_points (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_id   INTEGER NOT NULL REFERENCES price_watches(id) ON DELETE CASCADE,
      price_cents INTEGER NOT NULL,
      vendor     TEXT,
      checked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_cache (
      key        TEXT PRIMARY KEY,
      payload    TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- La file d'envoi. Un message y est écrit avant de partir, et y reste
    -- s'il ne part pas : sans serveur SMTP configuré, l'agence voit ce qui
    -- aurait dû être envoyé et peut le copier, plutôt que de perdre le texte.
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id  INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
      trip_id    INTEGER REFERENCES trips(id) ON DELETE SET NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('quote','invoice','reset','invite')),
      to_name    TEXT NOT NULL DEFAULT '',
      to_email   TEXT NOT NULL,
      subject    TEXT NOT NULL,
      body       TEXT NOT NULL,
      link       TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','sent','failed')),
      error      TEXT NOT NULL DEFAULT '',
      sent_at    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Les liens qui valent authentification sans compte ouvert : choisir un
    -- mot de passe, ou ouvrir l'accès d'un client. Un jeton sert une fois et
    -- expire ; c'est tout ce qui les protège.
    CREATE TABLE IF NOT EXISTS access_tokens (
      token      TEXT PRIMARY KEY,
      kind       TEXT NOT NULL CHECK (kind IN ('reset','invite')),
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used_at    TEXT,
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

    CREATE INDEX IF NOT EXISTS idx_clients_agency ON clients(agency_id, name);
    CREATE INDEX IF NOT EXISTS idx_quotes_trip ON quotes(trip_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_quotes_agency ON quotes(agency_id, status);
    CREATE INDEX IF NOT EXISTS idx_quote_lines ON quote_lines(quote_id, position, id);
    CREATE INDEX IF NOT EXISTS idx_invoices_trip ON invoices(trip_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_invoices_agency ON invoices(agency_id, status, paid_at);
    CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_id, stage);
    CREATE INDEX IF NOT EXISTS idx_members_user ON trip_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_trip ON activity_log(trip_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_checklist_trip ON checklist_items(trip_id, position, id);
    CREATE INDEX IF NOT EXISTS idx_watches_trip ON price_watches(trip_id);
    CREATE INDEX IF NOT EXISTS idx_points_watch ON price_points(watch_id, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_agency ON messages(agency_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_tokens_user ON access_tokens(user_id, kind);
  `);

  // Columns added after the first release. `CREATE TABLE IF NOT EXISTS` leaves
  // an existing table alone, so new columns need adding by hand.
  addColumn(db, "expenses", "participant_ids", "TEXT");

  // The pivot to travel agencies. Existing rows keep working: an account with
  // no agency is an advisor without an agency yet, and a file with no client is
  // one nobody has been attached to.
  addColumn(db, "users", "role", "TEXT NOT NULL DEFAULT 'advisor'");
  addColumn(db, "users", "agency_id", "INTEGER REFERENCES agencies(id) ON DELETE SET NULL");
  addColumn(db, "trips", "client_id", "INTEGER REFERENCES clients(id) ON DELETE SET NULL");

  // TVA sur marge : la zone d'exécution se porte sur la ligne d'achat, parce
  // que c'est elle qui sert de clé de ventilation et qu'il faut pouvoir la
  // justifier ligne par ligne.
  addColumn(db, "bookings", "zone", "TEXT NOT NULL DEFAULT 'eu'");
  addColumn(db, "agencies", "vat_rate", "INTEGER NOT NULL DEFAULT 20");
  addColumn(db, "agencies", "vat_on_margin", "INTEGER NOT NULL DEFAULT 1");

  // Mentions que le code du tourisme impose de porter sur un devis de forfait.
  addColumn(db, "agencies", "financial_guarantee", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "agencies", "liability_insurance", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "agencies", "mediator", "TEXT NOT NULL DEFAULT ''");
  addColumn(db, "agencies", "terms", "TEXT NOT NULL DEFAULT ''");

  // Savoir si le client a ouvert le devis change la relance : c'est la
  // première chose qu'un conseiller demande, et jusqu'ici on ne la savait pas.
  addColumn(db, "quotes", "opened_at", "TEXT");
  addColumn(db, "invoices", "opened_at", "TEXT");
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
