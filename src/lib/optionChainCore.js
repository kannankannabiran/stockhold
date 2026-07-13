const STRIKES_EACH_SIDE = 7;
const INSTRUMENTS_TTL_MS = 12 * 60 * 60 * 1000;
const HIST_BATCH_SIZE = 3;
const HIST_BATCH_DELAY_MS = 350;

export const INDEX_CONFIG = {
  NIFTY: { label: "NIFTY", exchange: "NFO", name: "NIFTY", spotSymbol: "NSE:NIFTY 50" },
  BANKNIFTY: { label: "BANK NIFTY", exchange: "NFO", name: "BANKNIFTY", spotSymbol: "NSE:NIFTY BANK" },
  SENSEX: { label: "SENSEX", exchange: "BFO", name: "SENSEX", spotSymbol: "BSE:SENSEX" },
};

export const INDEX_KEYS = Object.keys(INDEX_CONFIG);

let instrumentsCache = {};
let prevOiCache = { dateKey: null, data: {} };

async function getCachedExchangeInstruments(kc, exchange) {
  const now = Date.now();
  const cached = instrumentsCache[exchange];
  if (cached && now - cached.fetchedAt < INSTRUMENTS_TTL_MS) return cached.data;
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
  from.setDate(from.getDate() - 7);

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
            1
          );

          if (candles && candles.length) {
            const relevant = candles.filter((c) => toDateStr(c.date) !== dateKey);
            const last = relevant.length ? relevant[relevant.length - 1] : candles[candles.length - 1];
            prevOiCache.data[opt.tradingsymbol] = last?.oi ?? null;
          } else {
            prevOiCache.data[opt.tradingsymbol] = null;
          }
        } catch (e) {
          console.error("[optionChainCore] prevOi fetch failed for", opt.tradingsymbol, e.message);
          prevOiCache.data[opt.tradingsymbol] = null;
        }
      })
    );
    await sleep(HIST_BATCH_DELAY_MS);
  }

  return prevOiCache.data;
}

export async function getOptionChainData(kc, indexKey, requestedExpiry) {
  if (!INDEX_CONFIG[indexKey]) {
    const err = new Error(`Unknown index "${indexKey}". Valid: ${Object.keys(INDEX_CONFIG).join(", ")}`);
    err.code = "bad_request";
    throw err;
  }

  const cfg = INDEX_CONFIG[indexKey];
  const indexOptions = await getIndexOptionInstruments(kc, indexKey);
  console.log(
    `[optionChainCore] ${indexKey}: matched ${indexOptions.length} instruments for name="${cfg.name}" exchange="${cfg.exchange}"`
  );

  const expiries = Array.from(new Set(indexOptions.map((i) => toDateStr(i.expiry)))).sort(
    (a, b) => new Date(a) - new Date(b)
  );

  // NEW: avoid picking an expiry that lands on TODAY (0 DTE). NIFTY/SENSEX
  // currently run weekly expiries, so the nearest expiry can be today —
  // same-day-expiry OI behaves very differently (thin, gets unwound
  // through the day) from a normal mid-cycle contract. BANKNIFTY is
  // monthly-only right now so this rarely bites it, which is why it can
  // look "correct" while NIFTY/SENSEX don't.
  let expiry = requestedExpiry;
  if (!expiry) {
    const todayStr = todayKey();
    expiry = expiries.find((e) => e !== todayStr) || expiries[0];
  }
  console.log(
    `[optionChainCore] ${indexKey}: available expiries=${expiries.slice(0, 4).join(", ")}${
      expiries.length > 4 ? "..." : ""
    } -> chosen=${expiry}`
  );

  const chainOpts = indexOptions.filter((i) => toDateStr(i.expiry) === expiry);
  const uniqueStrikesAll = Array.from(new Set(chainOpts.map((i) => i.strike))).sort((a, b) => a - b);

  const spotQuote = await kc.getQuote([cfg.spotSymbol]);
  const spot = spotQuote?.[cfg.spotSymbol]?.last_price ?? null;

  let atmIndex = 0;
  let atmDist = Infinity;

  uniqueStrikesAll.forEach((s, idx) => {
    const d = Math.abs((s ?? 0) - (spot ?? 0));
    if (d < atmDist) {
      atmDist = d;
      atmIndex = idx;
    }
  });

  const wideStart = Math.max(0, atmIndex - 40);
  const wideEnd = Math.min(uniqueStrikesAll.length, atmIndex + 41);
  const wideStrikes = new Set(uniqueStrikesAll.slice(wideStart, wideEnd));
  const wideOpts = chainOpts.filter((o) => wideStrikes.has(o.strike));

  const wideSymbolToOpt = {};
  for (const opt of wideOpts) {
    wideSymbolToOpt[`${cfg.exchange}:${opt.tradingsymbol}`] = opt;
  }

  const allSymbols = [cfg.spotSymbol, ...Object.keys(wideSymbolToOpt)];
  const quoteBatches = batch(allSymbols, 400);
  const quoteFetchedAt = Date.now(); // NEW: when WE issued the request
  const quoteResults = await Promise.all(quoteBatches.map((b) => kc.getQuote(b)));
  const quotes = Object.assign({}, ...quoteResults);

  let atmIndex2 = 0;
  let atmDist2 = Infinity;

  uniqueStrikesAll.forEach((s, idx) => {
    const d = Math.abs((s ?? 0) - (spot ?? 0));
    if (d < atmDist2) {
      atmDist2 = d;
      atmIndex2 = idx;
    }
  });

  const startIdx = Math.max(0, atmIndex2 - STRIKES_EACH_SIDE);
  const endIdx = Math.min(uniqueStrikesAll.length, atmIndex2 + STRIKES_EACH_SIDE + 1);
  const nearStrikes = new Set(uniqueStrikesAll.slice(startIdx, endIdx));

  const nearOpts = wideOpts.filter((o) => nearStrikes.has(o.strike));
  const prevOiMap = await getPrevDayOiMap(kc, nearOpts);

  const rowsMap = {};
  // NEW: track the exchange-reported quote timestamps for the near strikes
  // so callers can tell how fresh (or stale) Kite's own data actually is
  let oldestQuoteTs = null;
  let newestQuoteTs = null;

  for (const [tsym, opt] of Object.entries(wideSymbolToOpt)) {
    if (!nearStrikes.has(opt.strike)) continue;

    const q = quotes[tsym] || {};
    const strike = opt.strike;
    const side = opt.instrument_type;

    rowsMap[strike] = rowsMap[strike] || { strike };
    rowsMap[strike][`${side}_ltp`] = q.last_price ?? null;
    rowsMap[strike][`${side}_oi`] = q.oi ?? null;

    // NEW: Kite returns this as the exchange-side timestamp for the quote.
    // Field name varies by SDK version — check both.
    const quoteTs = q.timestamp || q.last_trade_time || null;
    rowsMap[strike][`${side}_oi_ts`] = quoteTs;

    if (quoteTs) {
      const t = new Date(quoteTs).getTime();
      if (!Number.isNaN(t)) {
        if (oldestQuoteTs === null || t < oldestQuoteTs) oldestQuoteTs = t;
        if (newestQuoteTs === null || t > newestQuoteTs) newestQuoteTs = t;
      }
    }

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

  return {
    index: indexKey,
    label: cfg.label,
    spot,
    expiry,
    expiries,
    rows,
    updatedAt: new Date().toISOString(),
    // NEW: diagnostics so the caller can log exchange-side data freshness
    quoteFetchedAt,
    oldestQuoteTs,
    newestQuoteTs,
  };
}