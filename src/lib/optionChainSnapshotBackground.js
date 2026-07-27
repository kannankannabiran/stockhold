import { newClient } from "./kite";
import { getOptionChainData, INDEX_KEYS } from "./optionChainCore";
import { saveSnapshot } from "./optionChainHistoryDb";
import db from "./db";

const POLL_MS = 60 * 1000;

function getStoredAccessToken() {
  const row = db.prepare(`SELECT access_token FROM kite_tokens WHERE id = 1`).get();
  return row?.access_token ?? null;
}

async function pollOnce() {
  const accessToken = getStoredAccessToken();
  if (!accessToken) return; // Zerodha session not connected yet — skip this tick.

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