import { KiteConnect } from "kiteconnect";

const API_KEY = process.env.KITE_API_KEY;
const API_SECRET = process.env.KITE_API_SECRET;

if (!API_KEY || !API_SECRET) {
  console.warn(
    "[kite] KITE_API_KEY / KITE_API_SECRET are not set. Add them to .env.local"
  );
}

export function newClient(accessToken) {
  const kc = new KiteConnect({ api_key: API_KEY });
  if (accessToken) kc.setAccessToken(accessToken);
  return kc;
}

export function getApiKey() {
  return API_KEY;
}

export function getApiSecret() {
  return API_SECRET;
}

// Instrument dump only changes once a day and is a few MB / ~90k rows,
// so we cache it in memory for the life of the server process instead of
// re-downloading it on every request.
let instrumentCache = { date: null, niftyOptions: null };

export async function getNiftyOptionInstruments(kc) {
  const today = new Date().toISOString().slice(0, 10);
  if (instrumentCache.date === today && instrumentCache.niftyOptions) {
    return instrumentCache.niftyOptions;
  }
  const all = await kc.getInstruments(["NFO"]);
  const niftyOptions = all.filter(
    (i) => i.name === "NIFTY" && (i.instrument_type === "CE" || i.instrument_type === "PE")
  );
  instrumentCache = { date: today, niftyOptions };
  return niftyOptions;
}
