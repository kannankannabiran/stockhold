import db from "./db";

// Kite's access_token expires once per trading day, on IST time — not UTC.
// UTC midnight falls at 5:30 AM IST, so using toISOString() directly meant
// there was a ~5.5 hour window each morning where a token got treated as
// stale (or fresh) a half-day off from when Kite actually expires it.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function todayKey() {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

const upsertToken = db.prepare(`
  INSERT INTO kite_tokens (id, access_token, date, updated_at)
  VALUES (1, @access_token, @date, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    access_token = excluded.access_token,
    date = excluded.date,
    updated_at = excluded.updated_at
`);

const readToken = db.prepare(`
  SELECT access_token AS accessToken, date, updated_at AS updatedAt
  FROM kite_tokens
  WHERE id = 1
`);

// Call this from your login/callback route right after
// kc.generateSession() gives you the access_token, e.g.:
//   saveAccessToken(session.access_token);
export function saveAccessToken(accessToken) {
  upsertToken.run({
    access_token: accessToken,
    date: todayKey(),
    updated_at: Date.now(),
  });
}

export function getStoredAccessToken() {
  const row = readToken.get();
  if (!row) return null;
  if (row.date !== todayKey()) return null; // Kite tokens expire daily (IST trading day)
  return row.accessToken;
}

// Used by /api/kite/status to report connection state without exposing
// the raw token unless it's actually still valid for today.
export function getTokenInfo() {
  const row = readToken.get();
  if (!row) {
    return {
      connected: false,
      accessToken: null,
      tokenDate: null,
      updatedAt: null,
    };
  }
  const validForToday = row.date === todayKey();
  return {
    connected: validForToday && Boolean(row.accessToken),
    accessToken: validForToday ? row.accessToken : null,
    tokenDate: row.date,
    updatedAt: row.updatedAt,
  };
}