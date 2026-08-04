import { newClient } from "./kite";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import { saveSnapshot } from "./optionChainHistoryDb";
import { getStoredAccessToken } from "./kiteTokenStore";

const POLL_MS = 60 * 1000;

const MARKET_OPEN_MIN = 9 * 60 + 15;  // 09:15
const MARKET_CLOSE_MIN = 15 * 60 + 40; // 15:30

// Returns current IST time as "minutes since midnight" without needing a
// timezone library — reuses the same en-CA/en-GB Intl approach used
// elsewhere in this codebase for IST date/time formatting.
function istMinutesNow() {
  const parts = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour12: false,
  }); // "HH:MM:SS"
  const [h, m] = parts.split(":").map(Number);
  return h * 60 + m;
}

function isWithinMarketHours() {
  const mins = istMinutesNow();
  return mins >= MARKET_OPEN_MIN && mins <= MARKET_CLOSE_MIN;
}

async function pollOnce() {
  if (!isWithinMarketHours()) return; // outside 9:15–3:30 IST — skip entirely, no fetch/save

  const accessToken = getStoredAccessToken();
  if (!accessToken) return; // Zerodha session not connected or expired — skip this tick.

  const kc = newClient(accessToken);

  for (const indexKey of INDEX_KEYS) {
    try {
      const result = await getOptionChainData(kc, indexKey, null);
      saveSnapshot(indexKey, result.expiry, result.spot, result.rows);
    } catch (e) {
      console.error("[optionChainSnapshot] failed for", indexKey, e.message);
    }
  }
}

export function startOptionChainSnapshotBackground() {
  if (globalThis.__optionChainSnapshotStarted) return;
  globalThis.__optionChainSnapshotStarted = true;
  console.log(`[optionChainSnapshot] background snapshotter started, every ${POLL_MS / 1000}s (saves only 09:15–15:40 IST)`);
  pollOnce();
  setInterval(pollOnce, POLL_MS);
}