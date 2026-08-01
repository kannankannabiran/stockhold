// src/lib/kiteClient.js
// Thin wrapper around your existing kite.js (client factory) and
// kiteTokenStore.js (SQLite token store) — no separate DB, uses the same
// trading.db / kite_tokens table your /connect flow already writes to.

import { newClient } from './kite';
import { getStoredAccessToken as readToken } from './kiteTokenStore';

// getStoredAccessToken is synchronous under the hood (better-sqlite3),
// exported here as-is so callers using `await` still work fine.
export function getStoredAccessToken() {
  return readToken();
}

export function getKiteClient() {
  const accessToken = readToken();
  if (!accessToken) {
    throw new Error('No Kite access token found — log in via /connect first.');
  }
  return newClient(accessToken);
}