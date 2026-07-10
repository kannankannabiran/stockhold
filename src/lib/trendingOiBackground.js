import { newClient } from "./kite";
import { getStoredAccessToken } from "./kiteTokenStore";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import db from "./db";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 500;

const g = globalThis;
if (!g.__trendingOiStore) g.__trendingOiStore = {};
if (!g.__trendingOiPollerStarted) g.__trendingOiPollerStarted = false;

// NEW: make sure the spot column exists (safe to run repeatedly)
try {
  db.prepare(`ALTER TABLE trending_oi_history ADD COLUMN spot REAL`).run();
} catch (e) {
  // ignore "duplicate column" error once it's already been added
  if (!/duplicate column/i.test(e.message)) throw e;
}

const insertRow = db.prepare(`
  INSERT OR IGNORE INTO trending_oi_history
    (id, symbol, date, time, call_change, put_change, diff_oi, sentiment, spot, timestamp)
  VALUES (@id, @symbol, @date, @time, @call_change, @put_change, @diff_oi, @sentiment, @spot, @timestamp)
`);

const loadRecentHistory = db.prepare(`
  SELECT id, date, time, call_change AS callChange, put_change AS putChange,
         diff_oi AS diffOi, sentiment, spot
  FROM trending_oi_history
  WHERE symbol = ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

function computeSentiment(diffOi) {
  if (diffOi > 0) return "Bullish";
  if (diffOi < 0) return "Bearish";
  return "Neutral";
}

function hydrateStoreFromDb() {
  for (const symbol of INDEX_KEYS) {
    const rows = loadRecentHistory.all(symbol, MAX_HISTORY);
    g.__trendingOiStore[symbol] = rows;
  }
  console.log("[trendingOi] hydrated history from SQLite for", INDEX_KEYS.join(", "));
}

async function pollOnce() {
  const accessToken = getStoredAccessToken();
  if (!accessToken) {
    console.warn("[trendingOi] no stored access token, skipping poll");
    return;
  }

  const kc = newClient(accessToken);

  for (const symbol of INDEX_KEYS) {
    try {
      const { rows, spot } = await getOptionChainData(kc, symbol, null); // NEW: pull spot too

      let callChange = 0;
      let putChange = 0;
      for (const r of rows) {
        if (typeof r.CE_oiChange === "number") callChange += r.CE_oiChange;
        if (typeof r.PE_oiChange === "number") putChange += r.PE_oiChange;
      }

      const diffOi = putChange - callChange;
      const now = new Date();
      const row = {
        id: `${symbol}-${now.getTime()}`,
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 8),
        callChange,
        putChange,
        diffOi,
        sentiment: computeSentiment(diffOi),
        spot: spot ?? null, // NEW
      };

      const history = g.__trendingOiStore[symbol] || [];
      if (!history.length || history[0].diffOi !== diffOi) {
        history.unshift(row);
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        g.__trendingOiStore[symbol] = history;

        insertRow.run({
          id: row.id,
          symbol,
          date: row.date,
          time: row.time,
          call_change: row.callChange,
          put_change: row.putChange,
          diff_oi: row.diffOi,
          sentiment: row.sentiment,
          spot: row.spot, // NEW
          timestamp: now.getTime(),
        });
      }
    } catch (err) {
      console.error(`[trendingOi] poll failed for ${symbol}:`, err.message);
    }
  }
}

export function startTrendingOiPoller() {
  if (g.__trendingOiPollerStarted) return;
  g.__trendingOiPollerStarted = true;

  hydrateStoreFromDb();
  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);
  console.log("[trendingOi] background poller started for", INDEX_KEYS.join(", "));
}

export function getTrendingOiHistory(symbol) {
  return g.__trendingOiStore[symbol] || [];
}

export function clearTrendingOiHistory(symbol) {
  g.__trendingOiStore[symbol] = [];
  db.prepare(`DELETE FROM trending_oi_history WHERE symbol = ?`).run(symbol);
}