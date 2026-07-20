// app/api/open-high/route.js
//
// GET /api/open-high            -> all 3 indices
// GET /api/open-high?index=NIFTY -> single index
//
// Retest state (Open/High hit-again flags) is persisted to SQLite via
// lib/openHighRetestStore.js, so it survives a server restart. An
// in-memory Map is kept as an L1 cache within a warm process so we're
// not hitting SQLite on every single poll tick.

import { NextResponse } from "next/server";
import { newClient } from "@/lib/kite";
import { getStoredAccessToken } from "@/lib/kiteTokenStore";
import { getRetestState, saveRetestState } from "@/lib/openHighRetestStore";

const INDEX_CONFIG = {
  NIFTY: { spot: "NSE:NIFTY 50", interval: 50, exchange: "NFO", name: "NIFTY" },
  BANKNIFTY: { spot: "NSE:NIFTY BANK", interval: 100, exchange: "NFO", name: "BANKNIFTY" },
  SENSEX: { spot: "BSE:SENSEX", interval: 100, exchange: "BFO", name: "SENSEX" },
};

const STRIKE_RANGE = 10; // ATM-10 to ATM+10

const globalState = globalThis;
if (!globalState.__openHighInstrumentCache) globalState.__openHighInstrumentCache = { date: null, byExchange: {} };
if (!globalState.__openHighRetestCache) globalState.__openHighRetestCache = new Map();
const instrumentCache = globalState.__openHighInstrumentCache;
const retestCache = globalState.__openHighRetestCache; // L1 cache, backed by SQLite

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getInstrumentsCached(kc, exchange) {
  const today = todayKey();
  if (instrumentCache.date !== today) {
    instrumentCache.date = today;
    instrumentCache.byExchange = {};
  }
  if (!instrumentCache.byExchange[exchange]) {
    instrumentCache.byExchange[exchange] = await kc.getInstruments([exchange]);
  }
  return instrumentCache.byExchange[exchange];
}

function getAtmStrike(spot, interval) {
  return Math.round(spot / interval) * interval;
}

function loadState(key) {
  const cacheKey = `${todayKey()}:${key}`;
  let st = retestCache.get(cacheKey);
  if (st) return st;

  st = getRetestState(key) || {
    movedFromOpen: false, openHit: false,
    lastHigh: null, movedFromHigh: false, highHit: false,
  };
  retestCache.set(cacheKey, st);
  return st;
}

function updateRetestState(key, o, h, ltp) {
  const st = loadState(key);

  if (!st.movedFromOpen) {
    if (ltp !== o) st.movedFromOpen = true;
  } else if (ltp === o) {
    st.openHit = true;
  }

  if (st.lastHigh !== h) {
    st.lastHigh = h;
    st.movedFromHigh = false;
  } else if (ltp < h) {
    st.movedFromHigh = true;
  } else if (ltp === h && st.movedFromHigh) {
    st.highHit = true;
  }

  saveRetestState(key, st); // write-through to SQLite

  return { openHit: st.openHit, highHit: st.highHit };
}

function getNearestExpiry(instruments, name) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiries = [...new Set(
    instruments
      .filter((i) => i.name === name && (i.instrument_type === "CE" || i.instrument_type === "PE"))
      .map((i) => i.expiry)
  )].sort((a, b) => new Date(a) - new Date(b));

  const future = expiries.filter((e) => new Date(e) >= today);
  return future.length ? future[0] : expiries[expiries.length - 1];
}

async function fetchIndexData(kc, indexName) {
  const cfg = INDEX_CONFIG[indexName];
  const instruments = await getInstrumentsCached(kc, cfg.exchange);

  const spotData = await kc.getLTP([cfg.spot]);
  const spotPrice = spotData[cfg.spot].last_price;
  const atm = getAtmStrike(spotPrice, cfg.interval);

  const strikes = [];
  for (let i = -STRIKE_RANGE; i <= STRIKE_RANGE; i++) strikes.push(atm + i * cfg.interval);

  const expiry = getNearestExpiry(instruments, cfg.name);

  const strikeMap = {};
  for (const inst of instruments) {
    if (inst.name === cfg.name && inst.expiry === expiry && strikes.includes(inst.strike)) {
      strikeMap[inst.strike] = strikeMap[inst.strike] || {};
      strikeMap[inst.strike][inst.instrument_type] = inst.tradingsymbol;
    }
  }

  const quoteKeys = [];
  for (const strike of strikes) {
    const syms = strikeMap[strike] || {};
    if (syms.CE) quoteKeys.push(`${cfg.exchange}:${syms.CE}`);
    if (syms.PE) quoteKeys.push(`${cfg.exchange}:${syms.PE}`);
  }

  const quotes = quoteKeys.length ? await kc.getQuote(quoteKeys) : {};

  const rows = [];
  for (const strike of strikes) {
    const syms = strikeMap[strike] || {};
    for (const optType of ["CE", "PE"]) {
      const ts = syms[optType];
      if (!ts) continue;
      const key = `${cfg.exchange}:${ts}`;
      const q = quotes[key];
      if (!q) continue;

      const o = q.ohlc.open;
      const h = q.ohlc.high;
      const l = q.ohlc.low;
      const ltp = q.last_price;
      const { openHit, highHit } = updateRetestState(key, o, h, ltp);

      rows.push({
        strike,
        type: optType,
        symbol: ts,
        open: o,
        high: h,
        low: l,
        ltp,
        openRetest: openHit ? "Hit" : "Not Hit",
        highRetest: highHit ? "Hit" : "Not Hit",
      });
    }
  }

  return { index: indexName, spot: spotPrice, atm, expiry, rows };
}

export async function GET(request) {
  try {
    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated with Kite. Log in first." }, { status: 401 });
    }
    const kc = newClient(accessToken);

    const { searchParams } = new URL(request.url);
    const indexParam = searchParams.get("index");
    const indices = indexParam ? [indexParam.toUpperCase()] : Object.keys(INDEX_CONFIG);

    for (const idx of indices) {
      if (!INDEX_CONFIG[idx]) {
        return NextResponse.json({ error: `Unknown index: ${idx}` }, { status: 400 });
      }
    }

    const results = await Promise.all(indices.map((idx) => fetchIndexData(kc, idx)));

    return NextResponse.json({ data: results, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("open-high error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch strike data" }, { status: 500 });
  }
}