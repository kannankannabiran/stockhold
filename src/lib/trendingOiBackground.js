import { newClient } from "./kite";
import { getStoredAccessToken } from "./kiteTokenStore";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";

const POLL_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 500;

// Use globalThis so the store/poller survive Next.js hot-reload and
// module re-evaluation in dev, and stay singleton within one process.
const g = globalThis;
if (!g.__trendingOiStore) g.__trendingOiStore = {};
if (!g.__trendingOiPollerStarted) g.__trendingOiPollerStarted = false;

function computeSentiment(diffOi) {
  if (diffOi > 0) return "Bullish";
  if (diffOi < 0) return "Bearish";
  return "Neutral";
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
      const { rows } = await getOptionChainData(kc, symbol, null);

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
      };

      const history = g.__trendingOiStore[symbol] || [];
      if (!history.length || history[0].diffOi !== diffOi) {
        history.unshift(row);
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        g.__trendingOiStore[symbol] = history;
      }
    } catch (err) {
      console.error(`[trendingOi] poll failed for ${symbol}:`, err.message);
    }
  }
}

export function startTrendingOiPoller() {
  if (g.__trendingOiPollerStarted) return;
  g.__trendingOiPollerStarted = true;

  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);
  console.log("[trendingOi] background poller started for", INDEX_KEYS.join(", "));
}

export function getTrendingOiHistory(symbol) {
  return g.__trendingOiStore[symbol] || [];
}

export function clearTrendingOiHistory(symbol) {
  g.__trendingOiStore[symbol] = [];
}