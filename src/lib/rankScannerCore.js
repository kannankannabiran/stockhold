// lib/rankScannerCore.js
//
// Multi-timeframe % change + rank scanner (replicates the "% Change +
// Rank" screener table). Reuses the same Kite client / token pattern
// as the rest of STOCKHOLD (newClient + getStoredAccessToken).
//
// Rank 1 = best (highest) % change for that period, matching the
// reference screenshot. Stocks with no data for a given period are
// left with rank: null instead of being forced to a filler value.

import { newClient } from './kite';
import { getStoredAccessToken } from './kiteTokenStore';

// ---- Period config -----------------------------------------------------
// tradingDaysBack = how many candles back to compare the latest close
// against. "Today" = previous close. 1 Year is approximated as 252
// trading days (adjust if you'd rather use calendar-year lookback).
export const PERIODS = [
  { key: 'today', label: "% Change - Today's", tradingDaysBack: 1 },
  { key: 'd5', label: '% Change - 5 Days', tradingDaysBack: 5 },
  { key: 'd10', label: '% Change - 10 Days', tradingDaysBack: 10 },
  { key: 'd15', label: '% Change - 15 Days', tradingDaysBack: 15 },
  { key: 'd30', label: '% Change - 30 Days', tradingDaysBack: 30 },
  { key: 'd90', label: '% Change - 90 Days', tradingDaysBack: 90 },
  { key: 'd180', label: '% Change - 180 Days', tradingDaysBack: 180 },
  { key: 'y1', label: '% Change - 1 Year', tradingDaysBack: 252 },
];

const LOOKBACK_CALENDAR_DAYS = 420; // covers 252 trading days + buffer for holidays
const REQUEST_DELAY_MS = 350;       // ~2.8 req/sec, safely under Kite's historical-data limit

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

// ---- Singleton scan state (same globalThis-singleton pattern as
// lib/trendingOiBackground.js) --------------------------------------
function getScanState() {
  if (!globalThis.__rankScannerState) {
    globalThis.__rankScannerState = {
      running: false,
      total: 0,
      completed: 0,
      startedAt: null,
      finishedAt: null,
      error: null,
      results: [],
    };
  }
  return globalThis.__rankScannerState;
}

export function getRankScannerStatus() {
  const s = getScanState();
  return {
    running: s.running,
    total: s.total,
    completed: s.completed,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    error: s.error,
    hasResults: s.results.length > 0,
  };
}

export function getRankScannerResults() {
  return getScanState().results;
}

// tradingsymbols: string[] e.g. ['SHARDACROP', 'POWERINDIA', ...]
// indexLabel: display label for the Index column (default 'NIFTY 500')
export async function startRankScan(tradingsymbols, indexLabel = 'NIFTY 500') {
  const state = getScanState();
  if (state.running) return { alreadyRunning: true };

  state.running = true;
  state.total = tradingsymbols.length;
  state.completed = 0;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.error = null;

  // fire and forget — client polls getRankScannerStatus()
  runScan(tradingsymbols, indexLabel, state).catch((err) => {
    state.error = err.message;
    state.running = false;
    state.finishedAt = new Date().toISOString();
  });

  return { alreadyRunning: false };
}

async function resolveInstrumentTokens(kite, tradingsymbols) {
  const instruments = await kite.getInstruments('NSE');
  const wanted = new Set(tradingsymbols);
  const map = new Map();
  for (const inst of instruments) {
    if (wanted.has(inst.tradingsymbol) && inst.instrument_type === 'EQ') {
      map.set(inst.tradingsymbol, inst.instrument_token);
    }
  }
  return map;
}

async function runScan(tradingsymbols, indexLabel, state) {
  const accessToken = await getStoredAccessToken();
  if (!accessToken) throw new Error('Not connected to Kite — please log in first.');
  const kite = newClient(accessToken);

  const tokenMap = await resolveInstrumentTokens(kite, tradingsymbols);

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - LOOKBACK_CALENDAR_DAYS);
  const fromStr = formatDate(from);
  const toStr = formatDate(to);

  const rows = [];

  for (const symbol of tradingsymbols) {
    const token = tokenMap.get(symbol);

    if (!token) {
      rows.push({ symbol, index: indexLabel, ltp: null, changes: {}, error: 'no instrument token' });
    } else {
      try {
        const candles = await kite.getHistoricalData(token, 'day', fromStr, toStr, false);
        rows.push(buildRow(symbol, indexLabel, candles));
      } catch (err) {
        rows.push({ symbol, index: indexLabel, ltp: null, changes: {}, error: err.message });
      }
    }

    state.completed += 1;
    await sleep(REQUEST_DELAY_MS);
  }

  state.results = applyRanks(rows);
  state.running = false;
  state.finishedAt = new Date().toISOString();
}

function buildRow(symbol, indexLabel, candles) {
  if (!candles || candles.length < 2) {
    return { symbol, index: indexLabel, ltp: null, changes: {} };
  }

  const latest = candles[candles.length - 1];
  const ltp = latest.close;
  const changes = {};

  for (const p of PERIODS) {
    const idx = candles.length - 1 - p.tradingDaysBack;
    if (idx < 0) {
      changes[p.key] = null; // not enough history yet
      continue;
    }
    const base = candles[idx].close;
    changes[p.key] = base ? ((ltp - base) / base) * 100 : null;
  }

  return { symbol, index: indexLabel, ltp, changes };
}

function applyRanks(rows) {
  const ranks = {};

  for (const p of PERIODS) {
    const sorted = rows
      .map((r, i) => ({ i, val: r.changes?.[p.key] }))
      .filter((r) => r.val !== null && r.val !== undefined)
      .sort((a, b) => b.val - a.val); // highest % gain first -> rank 1

    sorted.forEach((r, rankIdx) => {
      if (!ranks[r.i]) ranks[r.i] = {};
      ranks[r.i][p.key] = rankIdx + 1;
    });
  }

  return rows.map((r, i) => ({ ...r, ranks: ranks[i] || {} }));
}