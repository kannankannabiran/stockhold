import { newClient } from "./kite";
import { getStoredAccessToken } from "./kiteTokenStore";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import db from "./db";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 500;

const g = globalThis;
if (!g.__trendingOiStore) g.__trendingOiStore = {};
if (!g.__trendingOiPollerStarted) g.__trendingOiPollerStarted = false;

const insertRow = db.prepare(`
  INSERT OR IGNORE INTO trending_oi_history
    (id, symbol, date, time, call_change, put_change, diff_oi, sentiment, spot, call_oi, put_oi, timestamp)
  VALUES (@id, @symbol, @date, @time, @call_change, @put_change, @diff_oi, @sentiment, @spot, @call_oi, @put_oi, @timestamp)
`);

// call_change/put_change columns store callOiChange/putOiChange below (aliased
// to match the field names page.jsx reads: row.callOiChange / row.putOiChange)
const loadRecentHistory = db.prepare(`
  SELECT id, date, time, call_change AS callOiChange, put_change AS putOiChange,
         diff_oi AS diffOi, sentiment, spot, call_oi AS callOi, put_oi AS putOi
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

// callOiChange / putOiChange here are SUMS of Kite's own per-strike
// CE_oiChange / PE_oiChange (today's OI minus the previous trading day's
// close OI, from optionChainCore's getPrevDayOiMap). That baseline is
// fixed for the whole day, so this number naturally behaves as a running
// total: it climbs when OI is being added since yesterday's close, falls
// when it's unwound, and holds steady when nothing changes — no extra
// row-to-row bookkeeping needed on our side, and it resets on its own the
// next trading day when the baseline refetches.
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

if (!g.__trendingOiStaleTracker) g.__trendingOiStaleTracker = {};

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
    console.log(`[trendingOi] ${symbol}: Call OI/Put OI unchanged for ${streak} poll(s) in a row (normal — exchange OI publish lag)`);
  } else {
    console.warn(
      `[trendingOi] ${symbol}: Call OI/Put OI unchanged for ${streak} polls in a row — ` +
        `if this keeps climbing, the quote fetch itself may be stuck/cached rather than the exchange being slow`
    );
  }
}

let pollInFlight = false;
let pollTimer = null;

async function pollOnce() {
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
        const { rows, spot, quoteFetchedAt, newestQuoteTs } =
          await getOptionChainData(kc, symbol, null);

        if (!rows || rows.length === 0) {
          console.warn(
            `[trendingOi] ${symbol}: getOptionChainData returned 0 rows (spot=${spot}) — skipping this poll`
          );
          continue;
        }

        const { callOi, callOiChange, putOi, putOiChange } = computeOiAndChange(rows);
        const diffOi = putOiChange - callOiChange;

        let ceOiCount = 0, ceChgCount = 0, peOiCount = 0, peChgCount = 0;
        for (const r of rows) {
          if (typeof r.CE_oi === "number") ceOiCount++;
          if (typeof r.CE_oiChange === "number") ceChgCount++;
          if (typeof r.PE_oi === "number") peOiCount++;
          if (typeof r.PE_oiChange === "number") peChgCount++;
        }

        console.log(
          `[trendingOi] ${symbol}: strikes=${rows.length} spot=${spot} ` +
            `CE_oi=${ceOiCount}/${rows.length} CE_chg=${ceChgCount}/${rows.length} ` +
            `PE_oi=${peOiCount}/${rows.length} PE_chg=${peChgCount}/${rows.length} ` +
            `callOi=${callOi} putOi=${putOi} callOiChange=${callOiChange} putOiChange=${putOiChange} diffOi=${diffOi}`
        );

        trackStaleness(symbol, callOi, putOi);

        if (newestQuoteTs != null) {
          const lagMs = quoteFetchedAt - newestQuoteTs;
          console.log(
            `[trendingOi] ${symbol}: Kite's newest quote timestamp is ${Math.round(lagMs / 1000)}s ` +
              `behind our fetch time — if this number is small and Call/Put OI is still frozen for many ` +
              `polls, Kite genuinely hasn't republished OI yet (exchange-side lag, not our code)`
          );
        } else {
          console.log(`[trendingOi] ${symbol}: no quote timestamp returned by Kite for this poll`);
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
    if (durationMs > POLL_INTERVAL_MS) {
      console.warn(
        `[trendingOi] poll cycle took longer than the ${POLL_INTERVAL_MS}ms interval — ` +
          `data will lag behind real 1-min cadence until this is faster (check Kite rate limits / network)`
      );
    }
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
  console.log("[trendingOi] background poller started for", INDEX_KEYS.join(", "));
}

export function getTrendingOiHistory(symbol) {
  return g.__trendingOiStore[symbol] || [];
}

export function clearTrendingOiHistory(symbol) {
  g.__trendingOiStore[symbol] = [];
  db.prepare(`DELETE FROM trending_oi_history WHERE symbol = ?`).run(symbol);
}