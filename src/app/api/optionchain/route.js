import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../lib/kite";

const STRIKES_EACH_SIDE = 7;
const INSTRUMENTS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — instrument list barely changes intraday
const HIST_BATCH_SIZE = 3; // Kite historical API is rate-limited harder than quotes (~3 req/sec)
const HIST_BATCH_DELAY_MS = 350;

// Index config — add more here later (FINNIFTY, MIDCPNIFTY, etc.) the same way.
// `exchange` is where the OPTIONS trade (NFO for NSE indices, BFO for SENSEX/BANKEX).
// `name` must match Kite's instrument `name` field exactly (no substring matching needed).
const INDEX_CONFIG = {
  NIFTY: { label: "NIFTY", exchange: "NFO", name: "NIFTY", spotSymbol: "NSE:NIFTY 50" },
  BANKNIFTY: { label: "BANK NIFTY", exchange: "NFO", name: "BANKNIFTY", spotSymbol: "NSE:NIFTY BANK" },
  SENSEX: { label: "SENSEX", exchange: "BFO", name: "SENSEX", spotSymbol: "BSE:SENSEX" },
};

// Cache raw instrument dumps per exchange (NFO covers both NIFTY + BANKNIFTY options,
// so one fetch/cache serves both indices; BFO is fetched separately for SENSEX).
let instrumentsCache = {}; // { NFO: {data, fetchedAt}, BFO: {data, fetchedAt} }

// Previous trading day's closing OI, per tradingsymbol. Doesn't change intraday,
// so cache it for the whole trading day and only fetch what's missing.
let prevOiCache = { dateKey: null, data: {} };

async function getCachedExchangeInstruments(kc, exchange) {
  const now = Date.now();
  const cached = instrumentsCache[exchange];
  if (cached && now - cached.fetchedAt < INSTRUMENTS_TTL_MS) {
    return cached.data;
  }
  const data = await kc.getInstruments(exchange);
  instrumentsCache[exchange] = { data, fetchedAt: now };
  return data;
}

async function getIndexOptionInstruments(kc, indexKey) {
  const cfg = INDEX_CONFIG[indexKey];
  const all = await getCachedExchangeInstruments(kc, cfg.exchange);
  return all.filter(
    (i) => i.name === cfg.name && (i.instrument_type === "CE" || i.instrument_type === "PE")
  );
}

function toDateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function todayKey() {
  return toDateStr(new Date());
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function batch(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Fetches previous trading day's closing OI for the given instruments via Kite's
// historical data API (oi=1). oi_day_high - oi_day_low is always >= 0 by definition,
// which is why that approach always showed positive — this is the correct baseline.
async function getPrevDayOiMap(kc, opts) {
  const dateKey = todayKey();
  if (prevOiCache.dateKey === dateKey) {
    const missing = opts.filter((o) => !(o.tradingsymbol in prevOiCache.data));
    if (missing.length === 0) return prevOiCache.data;
    opts = missing;
  } else {
    prevOiCache = { dateKey, data: {} };
  }

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7); // wide enough to cross weekends/holidays

  const fromStr = toDateStr(from);
  const toStr = toDateStr(to);

  for (const chunk of batch(opts, HIST_BATCH_SIZE)) {
    await Promise.all(
      chunk.map(async (opt) => {
        try {
          const candles = await kc.getHistoricalData(
            opt.instrument_token,
            "day",
            fromStr,
            toStr,
            false,
            1 // oi=1 -> candles include `oi` field
          );
          if (candles && candles.length) {
            const relevant = candles.filter((c) => toDateStr(c.date) !== dateKey);
            const last = relevant.length
              ? relevant[relevant.length - 1]
              : candles[candles.length - 1];
            prevOiCache.data[opt.tradingsymbol] = last?.oi ?? null;
          } else {
            prevOiCache.data[opt.tradingsymbol] = null;
          }
        } catch (e) {
          console.error("[optionchain] prevOi fetch failed for", opt.tradingsymbol, e.message);
          prevOiCache.data[opt.tradingsymbol] = null;
        }
      })
    );
    await sleep(HIST_BATCH_DELAY_MS);
  }

  return prevOiCache.data;
}

export async function GET(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("kite_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedExpiry = searchParams.get("expiry");
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();

  if (!INDEX_CONFIG[indexKey]) {
    return NextResponse.json(
      { error: "bad_request", message: `Unknown index "${indexKey}". Valid: ${Object.keys(INDEX_CONFIG).join(", ")}` },
      { status: 400 }
    );
  }
  const cfg = INDEX_CONFIG[indexKey];

  const kc = newClient(accessToken);

  try {
    const indexOptions = await getIndexOptionInstruments(kc, indexKey);

    const expiries = Array.from(new Set(indexOptions.map((i) => toDateStr(i.expiry)))).sort(
      (a, b) => new Date(a) - new Date(b)
    );

    const expiry = requestedExpiry || expiries[0];

    const chainOpts = indexOptions.filter((i) => toDateStr(i.expiry) === expiry);
    const uniqueStrikesAll = Array.from(new Set(chainOpts.map((i) => i.strike))).sort(
      (a, b) => a - b
    );

    const midIndex = Math.floor(uniqueStrikesAll.length / 2);
    const wideStart = Math.max(0, midIndex - 40);
    const wideEnd = Math.min(uniqueStrikesAll.length, midIndex + 40);
    const wideStrikes = new Set(uniqueStrikesAll.slice(wideStart, wideEnd));
    const wideOpts = chainOpts.filter((o) => wideStrikes.has(o.strike));

    const wideSymbolToOpt = {};
    for (const opt of wideOpts) {
      wideSymbolToOpt[`${cfg.exchange}:${opt.tradingsymbol}`] = opt;
    }

    // ONE combined quote call: spot + wide option window
    const allSymbols = [cfg.spotSymbol, ...Object.keys(wideSymbolToOpt)];
    const quoteBatches = batch(allSymbols, 400);
    const quoteResults = await Promise.all(quoteBatches.map((b) => kc.getQuote(b)));
    const quotes = Object.assign({}, ...quoteResults);

    const spot = quotes[cfg.spotSymbol]?.last_price;

    let atmIndex = 0;
    let atmDist = Infinity;
    uniqueStrikesAll.forEach((s, idx) => {
      const d = Math.abs(s - spot);
      if (d < atmDist) {
        atmDist = d;
        atmIndex = idx;
      }
    });
    const startIdx = Math.max(0, atmIndex - STRIKES_EACH_SIDE);
    const endIdx = Math.min(uniqueStrikesAll.length, atmIndex + STRIKES_EACH_SIDE + 1);
    const nearStrikes = new Set(uniqueStrikesAll.slice(startIdx, endIdx));

    // Only fetch previous-day OI for the strikes we're actually displaying.
    const nearOpts = wideOpts.filter((o) => nearStrikes.has(o.strike));
    const prevOiMap = await getPrevDayOiMap(kc, nearOpts);

    const rowsMap = {};
    for (const [tsym, opt] of Object.entries(wideSymbolToOpt)) {
      if (!nearStrikes.has(opt.strike)) continue;
      const q = quotes[tsym] || {};
      const strike = opt.strike;
      const side = opt.instrument_type;

      rowsMap[strike] = rowsMap[strike] || { strike };
      rowsMap[strike][`${side}_ltp`] = q.last_price ?? null;
      rowsMap[strike][`${side}_oi`] = q.oi ?? null;

      const prevOi = prevOiMap[opt.tradingsymbol];
      rowsMap[strike][`${side}_oiChange`] =
        prevOi != null && q.oi != null ? q.oi - prevOi : null;

      rowsMap[strike][`${side}_vol`] = q.volume ?? null;
      const prevClose = q.ohlc?.close ?? null;
      rowsMap[strike][`${side}_chg`] =
        prevClose !== null && q.last_price !== null
          ? Number((q.last_price - prevClose).toFixed(2))
          : null;
      rowsMap[strike][`${side}_symbol`] = opt.tradingsymbol;
    }

    const rows = Object.values(rowsMap).sort((a, b) => a.strike - b.strike);

    return NextResponse.json({
      index: indexKey,
      label: cfg.label,
      spot,
      expiry,
      expiries,
      rows,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[optionchain] error:", err);
    const message = err?.message || "Unknown error fetching option chain";
    const isAuthError = /token|session|forbidden/i.test(message);
    const isRateLimit = /429|too many requests/i.test(message);
    return NextResponse.json(
      {
        error: isAuthError ? "not_connected" : isRateLimit ? "rate_limited" : "fetch_failed",
        message: isRateLimit ? "Kite API rate limit hit — try again in a moment." : message,
      },
      { status: isAuthError ? 401 : isRateLimit ? 429 : 500 }
    );
  }
}

export const INDEX_KEYS = Object.keys(INDEX_CONFIG);
