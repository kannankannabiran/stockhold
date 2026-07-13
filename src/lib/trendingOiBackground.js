import { newClient } from "./kite";
import { getStoredAccessToken } from "./kiteTokenStore";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import db from "./db";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 500;

const g = globalThis;
if (!g.__trendingOiStore) g.__trendingOiStore = {};
if (!g.__trendingOiPollerStarted) g.__trendingOiPollerStarted = false;

// make sure the spot / call_oi / put_oi columns exist (safe to run repeatedly)
for (const col of ["spot REAL", "call_oi REAL", "put_oi REAL"]) {
  try {
    db.prepare(`ALTER TABLE trending_oi_history ADD COLUMN ${col}`).run();
  } catch (e) {
    // ignore "duplicate column" error once it's already been added
    if (!/duplicate column/i.test(e.message)) throw e;
  }
}

const insertRow = db.prepare(`
  INSERT OR IGNORE INTO trending_oi_history
    (id, symbol, date, time, call_change, put_change, diff_oi, sentiment, spot, call_oi, put_oi, timestamp)
  VALUES (@id, @symbol, @date, @time, @call_change, @put_change, @diff_oi, @sentiment, @spot, @call_oi, @put_oi, @timestamp)
`);

const loadRecentHistory = db.prepare(`
  SELECT id, date, time, call_change AS callChange, put_change AS putChange,
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

// NEW: a = call OI - call changing OI, b = put OI - put changing OI,
// summed across the 15 ATM-centered strikes already returned by
// getOptionChainData() (STRIKES_EACH_SIDE = 7 in optionChainCore.js).
function computeCallPutDiff(rows) {
  let callOiSum = 0;
  let callOiChangeSum = 0;
  let putOiSum = 0;
  let putOiChangeSum = 0;

  for (const r of rows) {
    if (typeof r.CE_oi === "number") callOiSum += r.CE_oi;
    if (typeof r.CE_oiChange === "number") callOiChangeSum += r.CE_oiChange;
    if (typeof r.PE_oi === "number") putOiSum += r.PE_oi;
    if (typeof r.PE_oiChange === "number") putOiChangeSum += r.PE_oiChange;
  }

  const a = callOiSum - callOiChangeSum; // call side result
  const b = putOiSum - putOiChangeSum; // put side result
  const diffOi = b - a; // final diff = b - a

  return { a, b, diffOi, callOi: callOiSum, putOi: putOiSum };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// small gap between symbols so NIFTY/SENSEX (which usually have more
// liquid strikes than BANKNIFTY) don't stack their historical-data
// calls back-to-back and trip Kite's rate limiter
const SYMBOL_GAP_MS = 500;

// tracks, per symbol, how many polls in a row produced the exact same
// callOi/putOi sums — lets us tell "OI hasn't been republished by the
// exchange yet" (normal, usually 1-3 polls) apart from "this is stuck"
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
        const { rows, spot, quoteFetchedAt, oldestQuoteTs, newestQuoteTs } =
          await getOptionChainData(kc, symbol, null);

        if (!rows || rows.length === 0) {
          console.warn(
            `[trendingOi] ${symbol}: getOptionChainData returned 0 rows (spot=${spot}) — skipping this poll`
          );
          continue;
        }

        const { a, b, diffOi, callOi, putOi } = computeCallPutDiff(rows);

        // count how many strikes actually had usable oi/oiChange numbers,
        // so a partial/rate-limited fetch is visible in the logs instead
        // of silently producing a stale-looking diffOi
        let ceOiCount = 0,
          ceChgCount = 0,
          peOiCount = 0,
          peChgCount = 0;
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
            `a=${a} b=${b} diffOi=${diffOi}`
        );

        trackStaleness(symbol, callOi, putOi);

        // NEW: how old is the exchange-side quote data, per Kite's own timestamp?
        if (newestQuoteTs != null) {
          const lagMs = quoteFetchedAt - newestQuoteTs;
          console.log(
            `[trendingOi] ${symbol}: Kite's newest quote timestamp is ${Math.round(lagMs / 1000)}s ` +
              `behind our fetch time — if this number is small (a few seconds) and Call/Put OI is still ` +
              `frozen for many polls, Kite genuinely hasn't republished OI yet (exchange-side lag, not our code)`
          );
        } else {
          console.log(`[trendingOi] ${symbol}: no quote timestamp returned by Kite for this poll`);
        }

        const now = new Date();
        const row = {
          id: `${symbol}-${now.getTime()}`,
          date: now.toISOString().slice(0, 10),
          time: now.toTimeString().slice(0, 8),
          callChange: a, // call OI - call changing OI
          putChange: b, // put OI - put changing OI
          diffOi, // b - a
          sentiment: computeSentiment(diffOi),
          spot: spot ?? null,
          callOi, // raw summed Call OI
          putOi, // raw summed Put OI
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
          call_change: row.callChange,
          put_change: row.putChange,
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

// self-scheduling loop: always wait POLL_INTERVAL_MS after the PREVIOUS
// poll *finishes* before starting the next one. This avoids both
// overlapping runs (setInterval firing while a slow poll is still going)
// and silent stalls (a stuck poll blocking every future tick forever).
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