import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../lib/kite";

const INSTRUMENTS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const STRIKES_EACH_SIDE = 10;

const INDEX_CONFIG = {
  NIFTY: { label: "NIFTY", exchange: "NFO", name: "NIFTY", spotSymbol: "NSE:NIFTY 50" },
  BANKNIFTY: { label: "BANK NIFTY", exchange: "NFO", name: "BANKNIFTY", spotSymbol: "NSE:NIFTY BANK" },
  SENSEX: { label: "SENSEX", exchange: "BFO", name: "SENSEX", spotSymbol: "BSE:SENSEX" },
};

let instrumentsCache = {}; // { NFO: {data, fetchedAt}, BFO: {data, fetchedAt} }

// Per-symbol daily state:
// broke     = has it ever traded above open today
// retested  = after breaking, has it come back down to touch open again
// status    = "OPEN_HIGH" | "RETEST" | null (current Hit condition)
// statusAt  = timestamp status last changed to a non-null value
let strikeStateCache = { dateKey: null, data: {} };

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

function batch(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function updateStrikeState(tsym, open, high, ltp) {
  const dateKey = todayKey();
  if (strikeStateCache.dateKey !== dateKey) {
    strikeStateCache = { dateKey, data: {} };
  }
  const s = strikeStateCache.data[tsym] || {
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
  }

  strikeStateCache.data[tsym] = s;
  return s;
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
      const ltp = q.last_price ?? null;

      const state = updateStrikeState(opt.tradingsymbol, open, high, ltp);

      rowsMap[strike] = rowsMap[strike] || { strike };
      rowsMap[strike][`${side}_open`] = open;
      rowsMap[strike][`${side}_high`] = high;
      rowsMap[strike][`${side}_low`] = q.ohlc?.low ?? null;
      rowsMap[strike][`${side}_ltp`] = ltp;
      rowsMap[strike][`${side}_symbol`] = opt.tradingsymbol;
      rowsMap[strike][`${side}_status`] = state.status; // "OPEN_HIGH" | "RETEST" | null
      rowsMap[strike][`${side}_broke`] = state.broke; // has it ever broken above open today
      rowsMap[strike][`${side}_hitAt`] = state.statusAt ? new Date(state.statusAt).toISOString() : null;
      rowsMap[strike][`${side}_itm`] =
        spot !== null && (side === "CE" ? strike < spot : strike > spot);
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
    console.error("[open-high] error:", err);
    const message = err?.message || "Unknown error fetching open/high/low/ltp data";
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