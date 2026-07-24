import { newClient } from "./kite";
import { getStoredAccessToken } from "./kiteTokenStore";
import { fetchLiveOpenHighData, INDEX_KEYS, isMarketHours } from "./openHighCore";

const POLL_INTERVAL_MS = 30 * 1000;
const SYMBOL_GAP_MS = 500;

const g = globalThis;
if (!g.__openHighPollerStarted) g.__openHighPollerStarted = false;
if (typeof g.__openHighMarketClosedLogged === "undefined") {
  g.__openHighMarketClosedLogged = false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let pollInFlight = false;
let pollTimer = null;

async function pollOnce() {
  if (!isMarketHours()) {
    if (!g.__openHighMarketClosedLogged) {
      console.log("[openHigh] outside market hours (9:15–3:30 IST, Mon–Fri) — polling paused");
      g.__openHighMarketClosedLogged = true;
    }
    return;
  }

  g.__openHighMarketClosedLogged = false;

  if (pollInFlight) {
    console.warn("[openHigh] previous poll still running, skipping this tick to avoid duplicate work");
    return;
  }

  pollInFlight = true;
  const startedAt = Date.now();

  try {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      console.warn("[openHigh] no stored access token, skipping poll");
      return;
    }

    const kc = newClient(accessToken);

    for (const indexKey of INDEX_KEYS) {
      try {
        await fetchLiveOpenHighData(kc, indexKey, null);
      } catch (err) {
        console.error(`[openHigh] poll failed for ${indexKey}:`, err.message);
        console.error(err.stack);
      }

      await sleep(SYMBOL_GAP_MS);
    }
  } finally {
    const durationMs = Date.now() - startedAt;
    console.log(`[openHigh] poll cycle finished in ${durationMs}ms`);
    pollInFlight = false;
  }
}

async function scheduleNextPoll() {
  await pollOnce();
  pollTimer = setTimeout(scheduleNextPoll, POLL_INTERVAL_MS);
}

export function startOpenHighPoller() {
  if (g.__openHighPollerStarted) return;
  g.__openHighPollerStarted = true;
  scheduleNextPoll();
  console.log("[openHigh] background poller started for", INDEX_KEYS.join(", "), "(active 9:15–3:30 IST, Mon–Fri)");
}