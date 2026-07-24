import db from "./db";

export const STRIKES_EACH_SIDE = 10;
const INSTRUMENTS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export const INDEX_CONFIG = {
  NIFTY: { label: "NIFTY", exchange: "NFO", name: "NIFTY", spotSymbol: "NSE:NIFTY 50" },
  BANKNIFTY: { label: "BANK NIFTY", exchange: "NFO", name: "BANKNIFTY", spotSymbol: "NSE:NIFTY BANK" },
  SENSEX: { label: "SENSEX", exchange: "BFO", name: "SENSEX", spotSymbol: "BSE:SENSEX" },
};
export const INDEX_KEYS = Object.keys(INDEX_CONFIG);

// Persisted "hit" log — only confirmed OPEN_HIGH / RETEST events, one row per
// (date, symbol, status). Pending is a live-only state and never lands here.
db.exec(`
  CREATE TABLE IF NOT EXISTS open_high_events (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    index_key TEXT NOT NULL,
    expiry TEXT NOT NULL,
    strike REAL NOT NULL,
    side TEXT NOT NULL,
    symbol TEXT NOT NULL,
    status TEXT NOT NULL,
    open_price REAL,
    high_price REAL,
    low_price REAL,
    ltp REAL,
    spot REAL,
    hit_at TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_open_high_events_lookup
    ON open_high_events (date, index_key, expiry);
`);

const insertHitEvent = db.prepare(`
  INSERT OR IGNORE INTO open_high_events
    (id, date, index_key, expiry, strike, side, symbol, status, open_price, high_price, low_price, ltp, spot, hit_at, timestamp)
  VALUES
    (@id, @date, @index_key, @expiry, @strike, @side, @symbol, @status, @open_price, @high_price, @low_price, @ltp, @spot, @hit_at, @timestamp)
`);

const selectExpiries = db.prepare(`
  SELECT DISTINCT expiry FROM open_high_events WHERE date = ? AND index_key = ? ORDER BY expiry
`);

const selectLatestEvents = db.prepare(`
  SELECT t.* FROM open_high_events t
  INNER JOIN (
    SELECT symbol, MAX(rowid) AS max_rowid
    FROM open_high_events
    WHERE date = ? AND index_key = ? AND expiry = ?
    GROUP BY symbol
  ) latest ON t.rowid = latest.max_rowid
  ORDER BY t.strike
`);

// globalThis-scoped so both the HTTP route (per-request) and the standalone
// background poller (started once at server boot) share one instrument
// cache and one strike-state cache — same pattern as trendingOiBackground's
// g.__trendingOiStore, so state stays consistent no matter which path polled last.
const g = globalThis;
if (!g.__openHighInstrumentsCache) g.__openHighInstrumentsCache = {}; // { NFO: {data, fetchedAt}, BFO: {...} }
if (!g.__openHighStrikeStateCache) g.__openHighStrikeStateCache = { dateKey: null, data: {} };

async function getCachedExchangeInstruments(kc, exchange) {
  const now = Date.now();
  const cached = g.__openHighInstrumentsCache[exchange];
  if (cached && now - cached.fetchedAt < INSTRUMENTS_TTL_MS) {
    return cached.data;
  }
  const data = await kc.getInstruments(exchange);
  g.__openHighInstrumentsCache[exchange] = { data, fetchedAt: now };
  return data;
}

async function getIndexOptionInstruments(kc, indexKey) {
  const cfg = INDEX_CONFIG[indexKey];
  const all = await getCachedExchangeInstruments(kc, cfg.exchange);
  return all.filter(
    (i) => i.name === cfg.name && (i.instrument_type === "CE" || i.instrument_type === "PE")
  );
}

export function toDateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

export function todayKey() {
  return toDateStr(new Date());
}

function batch(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function updateStrikeState(ctx) {
  const { tsym, open, high, low, ltp, dateKey, indexKey, expiry, strike, side, spot } = ctx;

  if (g.__openHighStrikeStateCache.dateKey !== dateKey) {
    g.__openHighStrikeStateCache = { dateKey, data: {} };
  }
  const cache = g.__openHighStrikeStateCache.data;
  const s = cache[tsym] || {
    broke: false,
    retested: false,
    status: null,
    statusAt: null,
  };

  if (open != null && high != null && high > open) {
    s.broke = true;
  }
  if (s.broke && !s.retested && open != null && ltp != null && ltp <= open) {
    s.retested = true;
  }

  const openHighMatch = open !== null && high !== null && open === high;
  const currentStatus = s.retested ? "RETEST" : openHighMatch ? "OPEN_HIGH" : null;

  if (currentStatus !== s.status) {
    s.status = currentStatus;
    s.statusAt = currentStatus ? Date.now() : null;

    if (currentStatus) {
      const hitAtIso = new Date(s.statusAt).toISOString();
      insertHitEvent.run({
        id: `${dateKey}_${tsym}_${currentStatus}`,
        date: dateKey,
        index_key: indexKey,
        expiry,
        strike,
        side,
        symbol: tsym,
        status: currentStatus,
        open_price: open,
        high_price: high,
        low_price: low,
        ltp,
        spot,
        hit_at: hitAtIso,
        timestamp: s.statusAt,
      });
    }
  }

  cache[tsym] = s;
  return s;
}

// Used by both the live HTTP route (any requested expiry, any index) and the
// background poller (nearest expiry, all indices) — single source of truth
// for how a "live" open/high/retest snapshot is built.
export async function fetchLiveOpenHighData(kc, indexKey, requestedExpiry) {
  const cfg = INDEX_CONFIG[indexKey];
  const today = todayKey();

  const indexOptions = await getIndexOptionInstruments(kc, indexKey);

  const liveExpiries = Array.from(new Set(indexOptions.map((i) => toDateStr(i.expiry)))).sort(
    (a, b) => new Date(a) - new Date(b)
  );

  const expiry = requestedExpiry || liveExpiries[0];

  const chainOpts = indexOptions.filter((i) => toDateStr(i.expiry) === expiry);
  const uniqueStrikes = Array.from(new Set(chainOpts.map((i) => i.strike))).sort((a, b) => a - b);

  const spotQuote = await kc.getQuote([cfg.spotSymbol]);
  const spot = spotQuote[cfg.spotSymbol]?.last_price ?? null;

  let atmIndex = 0;
  let atmDist = Infinity;
  uniqueStrikes.forEach((s, idx) => {
    const d = Math.abs(s - (spot ?? s));
    if (d < atmDist) {
      atmDist = d;
      atmIndex = idx;
    }
  });
  const startIdx = Math.max(0, atmIndex - STRIKES_EACH_SIDE);
  const endIdx = Math.min(uniqueStrikes.length, atmIndex + STRIKES_EACH_SIDE + 1);
  const nearStrikes = new Set(uniqueStrikes.slice(startIdx, endIdx));

  const nearOpts = chainOpts.filter((o) => nearStrikes.has(o.strike));
  const symbolToOpt = {};
  for (const opt of nearOpts) {
    symbolToOpt[`${cfg.exchange}:${opt.tradingsymbol}`] = opt;
  }

  const quoteBatches = batch(Object.keys(symbolToOpt), 400);
  const quoteResults = await Promise.all(quoteBatches.map((b) => kc.getQuote(b)));
  const quotes = Object.assign({}, ...quoteResults);

  const rowsMap = {};
  for (const [tsym, opt] of Object.entries(symbolToOpt)) {
    const q = quotes[tsym] || {};
    const strike = opt.strike;
    const side = opt.instrument_type;
    const open = q.ohlc?.open ?? null;
    const high = q.ohlc?.high ?? null;
    const low = q.ohlc?.low ?? null;
    const ltp = q.last_price ?? null;

    const state = updateStrikeState({
      tsym: opt.tradingsymbol,
      open,
      high,
      low,
      ltp,
      dateKey: today,
      indexKey,
      expiry,
      strike,
      side,
      spot,
    });

    rowsMap[strike] = rowsMap[strike] || { strike };
    rowsMap[strike][`${side}_open`] = open;
    rowsMap[strike][`${side}_high`] = high;
    rowsMap[strike][`${side}_low`] = low;
    rowsMap[strike][`${side}_ltp`] = ltp;
    rowsMap[strike][`${side}_symbol`] = opt.tradingsymbol;
    rowsMap[strike][`${side}_status`] = state.status;
    rowsMap[strike][`${side}_broke`] = state.broke;
    rowsMap[strike][`${side}_hitAt`] = state.statusAt ? new Date(state.statusAt).toISOString() : null;
    rowsMap[strike][`${side}_itm`] =
      spot !== null && (side === "CE" ? strike < spot : strike > spot);
  }

  const rows = Object.values(rowsMap).sort((a, b) => a.strike - b.strike);

  return {
    expiry,
    expiries: liveExpiries,
    spot,
    rows,
    date: today,
  };
}

export function getHistoricalOpenHighData(indexKey, dateKey, requestedExpiry) {
  const expiries = selectExpiries.all(dateKey, indexKey).map((r) => r.expiry);
  const expiry = requestedExpiry || expiries[0] || null;

  if (!expiry) {
    return { expiry: null, expiries, spot: null, rows: [] };
  }

  const events = selectLatestEvents.all(dateKey, indexKey, expiry);

  let spot = null;
  const rowsMap = {};
  for (const ev of events) {
    if (ev.spot != null) spot = ev.spot;
    const strike = ev.strike;
    const side = ev.side;
    rowsMap[strike] = rowsMap[strike] || { strike };
    rowsMap[strike][`${side}_open`] = ev.open_price;
    rowsMap[strike][`${side}_high`] = ev.high_price;
    rowsMap[strike][`${side}_low`] = ev.low_price;
    rowsMap[strike][`${side}_ltp`] = ev.ltp;
    rowsMap[strike][`${side}_symbol`] = ev.symbol;
    rowsMap[strike][`${side}_status`] = ev.status;
    rowsMap[strike][`${side}_broke`] = ev.status === "RETEST";
    rowsMap[strike][`${side}_hitAt`] = ev.hit_at;
    rowsMap[strike][`${side}_itm`] =
      ev.spot != null ? (side === "CE" ? strike < ev.spot : strike > ev.spot) : null;
  }

  const rows = Object.values(rowsMap).sort((a, b) => a.strike - b.strike);
  return { expiry, expiries, spot, rows };
}