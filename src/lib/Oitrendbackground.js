import { newClient } from "./kite";
import { getStoredAccessToken } from "./kiteTokenStore";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import db from "./db";

const POLL_INTERVAL_MS = 60 * 1000;
const SYMBOL_GAP_MS = 500;

const g = globalThis;
if (!g.__oiTrendPollerStarted) g.__oiTrendPollerStarted = false;
if (typeof g.__oiTrendMarketClosedLogged === "undefined") {
  g.__oiTrendMarketClosedLogged = false;
}

const insertPoint = db.prepare(`
  INSERT INTO oi_trend_history
    (id, symbol, strike, date, time, ce_oi, pe_oi, ce_oi_change, pe_oi_change, timestamp)
  VALUES (@id, @symbol, @strike, @date, @time, @ce_oi, @pe_oi, @ce_oi_change, @pe_oi_change, @timestamp)
`);

const insertManyPoints = db.transaction((points) => {
  for (const p of points) insertPoint.run(p);
});

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let pollInFlight = false;
let pollTimer = null;

async function pollOnce() {
  if (!isMarketHours()) {
    if (!g.__oiTrendMarketClosedLogged) {
      console.log("[oiTrend] outside market hours (9:15–3:30 IST, Mon–Fri) — polling paused");
      g.__oiTrendMarketClosedLogged = true;
    }
    return;
  }

  g.__oiTrendMarketClosedLogged = false;

  if (pollInFlight) {
    console.warn("[oiTrend] previous poll still running, skipping this tick to avoid duplicate rows");
    return;
  }

  pollInFlight = true;
  const startedAt = Date.now();

  try {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      console.warn("[oiTrend] no stored access token, skipping poll");
      return;
    }

    const kc = newClient(accessToken);

    for (const symbol of INDEX_KEYS) {
      try {
        const { rows } = await getOptionChainData(kc, symbol, null);

        if (!rows || rows.length === 0) {
          console.warn(`[oiTrend] ${symbol}: 0 rows returned — skipping this poll`);
          continue;
        }

        const now = new Date();
        const date = now.toISOString().slice(0, 10);
        const time = now.toTimeString().slice(0, 8);

        const points = rows
          .filter((r) => r && r.strike != null)
          .map((r, i) => ({
            id: `${symbol}-${r.strike}-${now.getTime()}-${i}`,
            symbol,
            strike: r.strike,
            date,
            time,
            ce_oi: r.CE_oi ?? null,
            pe_oi: r.PE_oi ?? null,
            ce_oi_change: r.CE_oiChange ?? null,
            pe_oi_change: r.PE_oiChange ?? null,
            timestamp: now.getTime(),
          }));

        if (points.length) insertManyPoints(points);
        console.log(`[oiTrend] ${symbol}: saved ${points.length} strike snapshots`);
      } catch (err) {
        console.error(`[oiTrend] poll failed for ${symbol}:`, err.message);
        console.error(err.stack);
      }

      await sleep(SYMBOL_GAP_MS);
    }
  } finally {
    const durationMs = Date.now() - startedAt;
    console.log(`[oiTrend] poll cycle finished in ${durationMs}ms`);
    pollInFlight = false;
  }
}

async function scheduleNextPoll() {
  await pollOnce();
  pollTimer = setTimeout(scheduleNextPoll, POLL_INTERVAL_MS);
}

export function startOiTrendPoller() {
  if (g.__oiTrendPollerStarted) return;
  g.__oiTrendPollerStarted = true;
  scheduleNextPoll();
  console.log(
    "[oiTrend] background poller started for",
    INDEX_KEYS.join(", "),
    "(active 9:15–3:30 IST, Mon–Fri)"
  );
}