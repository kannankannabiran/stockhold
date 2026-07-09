import fs from "fs";
import path from "path";

const TOKEN_FILE = path.join(process.cwd(), "data", "kite-token.json");

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Call this from your existing login/callback route right after
// kc.generateSession() gives you the access_token, e.g.:
//   saveAccessToken(session.access_token);
export function saveAccessToken(accessToken) {
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    TOKEN_FILE,
    JSON.stringify({ accessToken, date: todayKey() }),
    "utf-8"
  );
}

export function getStoredAccessToken() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8");
    const { accessToken, date } = JSON.parse(raw);
    if (date !== todayKey()) return null; // Kite tokens expire daily
    return accessToken;
  } catch {
    return null;
  }
}