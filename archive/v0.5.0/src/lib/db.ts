import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

// Single SQLite file holding everything Trotter knows: instruments, daily
// prices per source, NSE official closes, fundamentals, and every prediction
// it has made. One file is easy to back up and to copy to the fallback host.

export type DB = Database.Database

// Each entry runs once, in order; PRAGMA user_version tracks progress.
// Never edit a shipped migration — append a new one.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE instruments (
    symbol     TEXT PRIMARY KEY,        -- NSE trading symbol, e.g. RELIANCE
    name       TEXT NOT NULL,
    isin       TEXT,
    series     TEXT,
    industry   TEXT,                    -- from the Nifty 500 constituent list
    updated_at TEXT NOT NULL
  );

  CREATE TABLE index_members (
    index_name TEXT NOT NULL,           -- e.g. 'NIFTY 50'
    symbol     TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (index_name, symbol)
  );

  -- Split-adjusted daily history, one series per (symbol, source).
  CREATE TABLE daily_bars (
    symbol TEXT NOT NULL,
    source TEXT NOT NULL,
    date   TEXT NOT NULL,               -- YYYY-MM-DD, IST session date
    open   REAL NOT NULL,
    high   REAL NOT NULL,
    low    REAL NOT NULL,
    close  REAL NOT NULL,
    volume REAL NOT NULL,
    PRIMARY KEY (symbol, source, date)
  ) WITHOUT ROWID;

  CREATE TABLE series_meta (
    symbol     TEXT NOT NULL,
    source     TEXT NOT NULL,
    fetched_at TEXT NOT NULL,           -- ISO timestamp of the last successful fetch
    PRIMARY KEY (symbol, source)
  );

  -- NSE's official end-of-day file (unadjusted), used to verify other sources.
  CREATE TABLE nse_bhavcopy (
    date         TEXT NOT NULL,
    symbol       TEXT NOT NULL,
    series       TEXT NOT NULL,
    prev_close   REAL,
    open         REAL,
    high         REAL,
    low          REAL,
    close        REAL NOT NULL,
    volume       REAL,
    delivery_pct REAL,
    PRIMARY KEY (date, symbol, series)
  ) WITHOUT ROWID;

  CREATE TABLE nse_bhavcopy_files (
    date       TEXT PRIMARY KEY,
    status     TEXT NOT NULL,           -- 'ok' | 'missing'
    fetched_at TEXT NOT NULL
  );

  CREATE TABLE fundamentals (
    symbol     TEXT NOT NULL,
    date       TEXT NOT NULL,           -- IST date of the snapshot
    pe         REAL,
    eps        REAL,
    market_cap REAL,
    source     TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (symbol, date)
  );

  -- Every call Trotter makes, graded later against what the price actually did.
  CREATE TABLE predictions (
    id                   INTEGER PRIMARY KEY,
    created_at           TEXT NOT NULL,
    origin               TEXT NOT NULL,  -- 'research' (user search) | 'snapshot' (daily batch)
    model_version        TEXT NOT NULL,
    symbol               TEXT NOT NULL,
    as_of                TEXT NOT NULL,  -- last completed session used for the call
    horizon              TEXT NOT NULL,
    horizon_days         INTEGER NOT NULL,
    score                INTEGER NOT NULL,
    verdict              TEXT NOT NULL,
    entry_price          REAL NOT NULL,
    range_low            REAL,
    range_high           REAL,
    exit_date            TEXT,
    return_pct           REAL,
    benchmark_return_pct REAL,
    excess_return_pct    REAL,
    in_range             INTEGER,
    evaluated_at         TEXT,
    UNIQUE (symbol, as_of, horizon, model_version)
  );
  CREATE INDEX predictions_pending ON predictions (evaluated_at, symbol);

  CREATE TABLE backtest_runs (
    id            INTEGER PRIMARY KEY,
    created_at    TEXT NOT NULL,
    model_version TEXT NOT NULL,
    universe      TEXT NOT NULL,
    report        TEXT NOT NULL          -- JSON BacktestReport
  );

  CREATE TABLE sync_state (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
]

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000') // web server and worker share the file
  migrate(db)
  return db
}

function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v])
      db.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export function dbPath(): string {
  return process.env.TROTTER_DB_PATH || path.join(process.cwd(), 'data', 'trotter.db')
}

// Cached on globalThis so Next.js dev hot-reloads reuse one connection.
const holder = globalThis as unknown as { __trotterDb?: DB }

export function getDb(): DB {
  if (!holder.__trotterDb) holder.__trotterDb = openDb(dbPath())
  return holder.__trotterDb
}

/** Replace the process-wide connection (tests use a fresh in-memory DB). */
export function setDb(db: DB): void {
  holder.__trotterDb = db
}

export function getSyncState(key: string): { value: string; updatedAt: string } | null {
  const row = getDb().prepare('SELECT value, updated_at FROM sync_state WHERE key = ?').get(key) as
    | { value: string; updated_at: string }
    | undefined
  return row ? { value: row.value, updatedAt: row.updated_at } : null
}

export function setSyncState(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, new Date().toISOString())
}
