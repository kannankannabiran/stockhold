import { newClient } from "./kite";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import { saveSnapshot } from "./optionChainHistoryDb";
import { getStoredAccessToken } from "./kiteTokenStore";

const POLL_MS = 60 * 1000;

async function pollOnce() {
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
  console.log(`[optionChainSnapshot] background snapshotter started, every ${POLL_MS / 1000}s`);
  pollOnce();
  setInterval(pollOnce, POLL_MS);
}