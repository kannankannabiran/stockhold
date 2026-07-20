import { newClient } from "./kite";
import { getStoredAccessToken } from "./kiteTokenStore";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import db from "./db";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 500;

const g = globalThis;
if (!g.__trendingOiStore) g.__trendingOiStore = {};
if (!g.__trendingOiPollerStarted) g.__trendingOiPollerStarted = false;
if (typeof g.__trendingOiMarketClosedLogged === "undefined") {
  g.__trendingOiMarketClosedLogged = false;
}
if (!g.__trendingOiStaleTracker) g.__trendingOiStaleTracker = {};

const insertRow = db.prepare(`
  INSERT OR IGNORE INTO trending_oi_history
    (id, symbol, date, time, call_change, put_change, diff_oi, sentiment, spot, call_oi, put_oi, timestamp)
  VALUES (@id, @symbol, @date, @time, @call_change, @put_change, @diff_oi, @sentiment, @spot, @call_oi, @put_oi, @timestamp)
`);

const loadRecentHistory = db.prepare(`
  SELECT id, date, time, call_change AS callOiChange, put_change AS putOiChange,
         diff_oi AS diffOi, sentiment, spot, call_oi AS callOi, put_oi AS putOi
  FROM trending_oi_history
  WHERE symbol = ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

const loadHistoryForDate = db.prepare(`
  SELECT id, date, time, call_change AS callOiChange, put_change AS putOiChange,
         diff_oi AS diffOi, sentiment, spot, call_oi AS callOi, put_oi AS putOi
  FROM trending_oi_history
  WHERE symbol = ? AND date = ?
  ORDER BY timestamp DESC
`);

const deleteBySymbol = db.prepare(`DELETE FROM trending_oi_history WHERE symbol = ?`);
const deleteBySymbolAndDate = db.prepare(`DELETE FROM trending_oi_history WHERE symbol = ? AND date = ?`);

function computeSentiment(diffOi) {
  if (diffOi > 0) return "Bullish";
  if (diffOi < 0) return "Bearish";
  return "Neutral";
}

function isMarketHours() {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  const marketOpen = 9 * 60 + 15;
  const marketClose = 15 * 60 + 30;
  return minutes >= marketOpen && minutes <= marketClose;
}

function hydrateStoreFromDb() {
  for (const symbol of INDEX_KEYS) {
    g.__trendingOiStore[symbol] = loadRecentHistory.all(symbol, MAX_HISTORY);
  }
  console.log("[trendingOi] hydrated history from SQLite for", INDEX_KEYS.join(", "));
}

function computeOiAndChange(rows) {
  let callOi = 0;
  let callOiChange = 0;
  let putOi = 0;
  let putOiChange = 0;

  for (const r of rows) {
    if (typeof r.CE_oi === "number") callOi += r.CE_oi;
    if (typeof r.CE_oiChange === "number") callOiChange += r.CE_oiChange;
    if (typeof r.PE_oi === "number") putOi += r.PE_oi;
    if (typeof r.PE_oiChange === "number") putOiChange += r.PE_oiChange;
  }

  return { callOi, callOiChange, putOi, putOiChange };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SYMBOL_GAP_MS = 500;

function trackStaleness(symbol, callOi, putOi) {
  const tracker = g.__trendingOiStaleTracker;
  const prev = tracker[symbol];

  if (prev && prev.callOi === callOi && prev.putOi === putOi) {
    prev.streak += 1;
  } else {
    tracker[symbol] = { callOi, putOi, streak: 1 };
  }

  const streak = tracker[symbol].streak;
  if (streak === 1) {
    console.log(`[trendingOi] ${symbol}: Call OI/Put OI changed from previous poll`);
  } else if (streak <= 3) {
    console.log(
      `[trendingOi] ${symbol}: Call OI/Put OI unchanged for ${streak} poll(s) in a row (normal — exchange OI publish lag)`
    );
  } else {
    console.warn(
      `[trendingOi] ${symbol}: Call OI/Put OI unchanged for ${streak} polls in a row — if this keeps climbing, the quote fetch itself may be stuck/cached rather than the exchange being slow`
    );
  }
}

let pollInFlight = false;
let pollTimer = null;

async function pollOnce() {
  if (!isMarketHours()) {
    if (!g.__trendingOiMarketClosedLogged) {
      console.log("[trendingOi] outside market hours (9:15–3:30 IST, Mon–Fri) — polling paused");
      g.__trendingOiMarketClosedLogged = true;
    }
    return;
  }

  g.__trendingOiMarketClosedLogged = false;

  if (pollInFlight) {
    console.warn("[trendingOi] previous poll still running, skipping this tick to avoid duplicate rows");
    return;
  }

  pollInFlight = true;
  const startedAt = Date.now();

  try {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      console.warn("[trendingOi] no stored access token, skipping poll");
      return;
    }

    const kc = newClient(accessToken);

    for (const symbol of INDEX_KEYS) {
      try {
        const { rows, spot, quoteFetchedAt, newestQuoteTs } = await getOptionChainData(kc, symbol, null);

        if (!rows || rows.length === 0) {
          console.warn(`[trendingOi] ${symbol}: getOptionChainData returned 0 rows (spot=${spot}) — skipping this poll`);
          continue;
        }

        const { callOi, callOiChange, putOi, putOiChange } = computeOiAndChange(rows);
        const diffOi = putOiChange - callOiChange;

        if (newestQuoteTs != null) {
          const lagMs = quoteFetchedAt - newestQuoteTs;
          console.log(`[trendingOi] ${symbol}: newest quote lag ${Math.round(lagMs / 1000)}s`);
        }

        const now = new Date();
        const row = {
          id: `${symbol}-${now.getTime()}`,
          date: now.toISOString().slice(0, 10),
          time: now.toTimeString().slice(0, 8),
          callOiChange,
          putOiChange,
          diffOi,
          sentiment: computeSentiment(diffOi),
          spot: spot ?? null,
          callOi,
          putOi,
        };

        const history = g.__trendingOiStore[symbol] || [];
        history.unshift(row);
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        g.__trendingOiStore[symbol] = history;

        insertRow.run({
          id: row.id,
          symbol,
          date: row.date,
          time: row.time,
          call_change: row.callOiChange,
          put_change: row.putOiChange,
          diff_oi: row.diffOi,
          sentiment: row.sentiment,
          spot: row.spot,
          call_oi: row.callOi,
          put_oi: row.putOi,
          timestamp: now.getTime(),
        });
      } catch (err) {
        console.error(`[trendingOi] poll failed for ${symbol}:`, err.message);
        console.error(err.stack);
      }

      await sleep(SYMBOL_GAP_MS);
    }
  } finally {
    const durationMs = Date.now() - startedAt;
    console.log(`[trendingOi] poll cycle finished in ${durationMs}ms`);
    pollInFlight = false;
  }
}

async function scheduleNextPoll() {
  await pollOnce();
  pollTimer = setTimeout(scheduleNextPoll, POLL_INTERVAL_MS);
}

export function startTrendingOiPoller() {
  if (g.__trendingOiPollerStarted) return;
  g.__trendingOiPollerStarted = true;
  hydrateStoreFromDb();
  scheduleNextPoll();
  console.log("[trendingOi] background poller started for", INDEX_KEYS.join(", "), "(active 9:15–3:30 IST, Mon–Fri)");
}

export function getTrendingOiHistory(symbol, date) {
  if (date) return loadHistoryForDate.all(symbol, date);
  return g.__trendingOiStore[symbol] || [];
}

export function clearTrendingOiHistory(symbol, date) {
  if (date) {
    deleteBySymbolAndDate.run(symbol, date);
    g.__trendingOiStore[symbol] = (g.__trendingOiStore[symbol] || []).filter((r) => r.date !== date);
    return;
  }
  g.__trendingOiStore[symbol] = [];
  deleteBySymbol.run(symbol);
}