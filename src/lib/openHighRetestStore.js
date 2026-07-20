// lib/openHighRetestStore.js
//
// Persists per-symbol Open/High retest flags to SQLite so they survive a
// server restart mid-session. Same db.js connection your kiteTokenStore.js
// uses. One row per (symbol, date) -- state naturally resets each trading
// day since a new date key means a fresh row.

import db from "./db";

db.exec(`
  CREATE TABLE IF NOT EXISTS open_high_retest (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    moved_from_open INTEGER NOT NULL DEFAULT 0,
    open_hit INTEGER NOT NULL DEFAULT 0,
    last_high REAL,
    moved_from_high INTEGER NOT NULL DEFAULT 0,
    high_hit INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (symbol, date)
  )
`);

const upsertStmt = db.prepare(`
  INSERT INTO open_high_retest
    (symbol, date, moved_from_open, open_hit, last_high, moved_from_high, high_hit, updated_at)
  VALUES
    (@symbol, @date, @moved_from_open, @open_hit, @last_high, @moved_from_high, @high_hit, @updated_at)
  ON CONFLICT(symbol, date) DO UPDATE SET
    moved_from_open = excluded.moved_from_open,
    open_hit = excluded.open_hit,
    last_high = excluded.last_high,
    moved_from_high = excluded.moved_from_high,
    high_hit = excluded.high_hit,
    updated_at = excluded.updated_at
`);

const readStmt = db.prepare(`
  SELECT moved_from_open, open_hit, last_high, moved_from_high, high_hit
  FROM open_high_retest
  WHERE symbol = ? AND date = ?
`);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getRetestState(symbol) {
  const row = readStmt.get(symbol, todayKey());
  if (!row) return null;
  return {
    movedFromOpen: !!row.moved_from_open,
    openHit: !!row.open_hit,
    lastHigh: row.last_high,
    movedFromHigh: !!row.moved_from_high,
    highHit: !!row.high_hit,
  };
}

export function saveRetestState(symbol, state) {
  upsertStmt.run({
    symbol,
    date: todayKey(),
    moved_from_open: state.movedFromOpen ? 1 : 0,
    open_hit: state.openHit ? 1 : 0,
    last_high: state.lastHigh,
    moved_from_high: state.movedFromHigh ? 1 : 0,
    high_hit: state.highHit ? 1 : 0,
    updated_at: Date.now(),
  });
}