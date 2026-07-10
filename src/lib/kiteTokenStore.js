import db from "./db";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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
  SELECT access_token AS accessToken, date
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
  if (row.date !== todayKey()) return null; // Kite tokens expire daily
  return row.accessToken;
}