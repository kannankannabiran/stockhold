import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'trading.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS trending_oi_history (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    call_change INTEGER NOT NULL,
    put_change INTEGER NOT NULL,
    diff_oi INTEGER NOT NULL,
    sentiment TEXT NOT NULL,
    spot REAL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_trending_oi_symbol_ts
    ON trending_oi_history (symbol, timestamp DESC);

  CREATE TABLE IF NOT EXISTS kite_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    date TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// Migration: if the table already existed from before (without spot),
// add the column now. Safe to run every startup.
try {
  db.prepare(`ALTER TABLE trending_oi_history ADD COLUMN spot REAL`).run();
} catch (e) {
  if (!/duplicate column/i.test(e.message)) throw e;
}

export default db;