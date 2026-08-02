const Database = require('better-sqlite3');
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
    call_oi INTEGER,
    put_oi INTEGER,
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

  CREATE TABLE IF NOT EXISTS oi_trend_history (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    strike REAL NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    ce_oi INTEGER,
    pe_oi INTEGER,
    ce_oi_change INTEGER,
    pe_oi_change INTEGER,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_oi_trend_symbol_strike_ts
    ON oi_trend_history (symbol, strike, timestamp DESC);

  CREATE TABLE IF NOT EXISTS trending_oi_summary (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    call_plus_total INTEGER NOT NULL,
    call_minus_total INTEGER NOT NULL,
    call_net INTEGER NOT NULL,
    put_plus_total INTEGER NOT NULL,
    put_minus_total INTEGER NOT NULL,
    put_net INTEGER NOT NULL,
    diff_oi INTEGER NOT NULL,
    diff_pct REAL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_trending_oi_summary_symbol_ts
    ON trending_oi_summary (symbol, timestamp DESC);

  CREATE TABLE IF NOT EXISTS option_chain_snapshots (
    id TEXT PRIMARY KEY,
    index_key TEXT NOT NULL,
    expiry TEXT NOT NULL,
    strike REAL NOT NULL,
    spot REAL,
    ce_ltp REAL,
    ce_oi INTEGER,
    ce_oi_change INTEGER,
    ce_vol INTEGER,
    ce_chg REAL,
    pe_ltp REAL,
    pe_oi INTEGER,
    pe_oi_change INTEGER,
    pe_vol INTEGER,
    pe_chg REAL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_option_chain_snapshots_lookup
    ON option_chain_snapshots (index_key, date, timestamp);

  -- NEW TABLES FOR VWAP SCANNER --
  CREATE TABLE IF NOT EXISTS vwap_scan_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_scan TEXT,
    is_scanning INTEGER DEFAULT 0,
    current_progress INTEGER DEFAULT 0,
    total_progress INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS vwap_scan_results (
    symbol TEXT PRIMARY KEY,
    trend TEXT NOT NULL,
    current_year INTEGER NOT NULL,
    current_year_vwap REAL NOT NULL,
    last_price REAL NOT NULL,
    condition_date TEXT NOT NULL,
    previous_years TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Initialize scan status if it doesn't exist --
  INSERT OR IGNORE INTO vwap_scan_status (id, last_scan, is_scanning, current_progress, total_progress) 
  VALUES (1, NULL, 0, 0, 0);
`);

// Migrations: if trending_oi_history was created before spot/call_oi/put_oi
// existed, add them now. Safe to run every startup — duplicate-column
// errors are swallowed, anything else is rethrown.
for (const col of ['spot REAL', 'call_oi INTEGER', 'put_oi INTEGER']) {
  try {
    db.prepare(`ALTER TABLE trending_oi_history ADD COLUMN ${col}`).run();
  } catch (e) {
    if (!/duplicate column/i.test(e.message)) throw e;
  }
}

export default db;