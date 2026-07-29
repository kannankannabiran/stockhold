import { newClient } from "@/lib/kite";
import { getStoredAccessToken } from "@/lib/kiteTokenStore";

// In-memory cache of symbol -> instrument_token, keyed by exchange.
// Kite's instrument dump is a large CSV/JSON list that rarely changes
// intraday, so we cache it for a fixed TTL instead of hitting the API
// on every request.
let cache = {
  NSE: null,
  NFO: null,
  BSE: null,
};
let cacheTimestamps = {
  NSE: 0,
  NFO: 0,
  BSE: 0,
};

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function loadInstruments(exchange) {
  const now = Date.now();
  if (cache[exchange] && now - cacheTimestamps[exchange] < CACHE_TTL_MS) {
    return cache[exchange];
  }

  const accessToken = getStoredAccessToken();
  if (!accessToken) {
    throw new Error("Kite session expired or not connected. Please log in again.");
  }
  const kc = newClient(accessToken);
  const instruments = await kc.getInstruments([exchange]);

  const map = new Map();
  for (const inst of instruments) {
    // tradingsymbol is Kite's canonical symbol, e.g. "RELIANCE", "NIFTY24JULFUT"
    map.set(inst.tradingsymbol, inst.instrument_token);
  }

  cache[exchange] = map;
  cacheTimestamps[exchange] = now;
  return map;
}

/**
 * Resolve a symbol to its Kite instrument_token.
 * Strips common suffixes (e.g. ".NS", ".BO") left over from Yahoo-style
 * symbols, and tries NSE first, then BSE, then NFO (for derivatives).
 */
export async function resolveInstrumentToken(symbol) {
  if (!symbol) return null;

  const cleanSymbol = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();

  const nseMap = await loadInstruments("NSE");
  if (nseMap.has(cleanSymbol)) {
    return nseMap.get(cleanSymbol);
  }

  const bseMap = await loadInstruments("BSE");
  if (bseMap.has(cleanSymbol)) {
    return bseMap.get(cleanSymbol);
  }

  const nfoMap = await loadInstruments("NFO");
  if (nfoMap.has(cleanSymbol)) {
    return nfoMap.get(cleanSymbol);
  }

  return null;
}