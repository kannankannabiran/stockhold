import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient, getNiftyOptionInstruments } from "../../../lib/kite";

const STRIKES_EACH_SIDE = 7;

function toDateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function batch(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("kite_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedExpiry = searchParams.get("expiry");

  const kc = newClient(accessToken);

  try {
    const [niftyOptions, spotQuote] = await Promise.all([
      getNiftyOptionInstruments(kc),
      kc.getQuote(["NSE:NIFTY 50"]),
    ]);

    const spot = spotQuote["NSE:NIFTY 50"]?.last_price;

    const expiries = Array.from(new Set(niftyOptions.map((i) => toDateStr(i.expiry)))).sort(
      (a, b) => new Date(a) - new Date(b)
    );

    const expiry = requestedExpiry || expiries[0];

    const chainOpts = niftyOptions.filter((i) => toDateStr(i.expiry) === expiry);
    const uniqueStrikes = Array.from(new Set(chainOpts.map((i) => i.strike))).sort(
      (a, b) => a - b
    );

    let atmIndex = 0;
    let atmDist = Infinity;

    uniqueStrikes.forEach((s, idx) => {
      const d = Math.abs(s - spot);
      if (d < atmDist) {
        atmDist = d;
        atmIndex = idx;
      }
    });

    const startIdx = Math.max(0, atmIndex - STRIKES_EACH_SIDE);
    const endIdx = Math.min(uniqueStrikes.length, atmIndex + STRIKES_EACH_SIDE + 1);
    const nearStrikes = uniqueStrikes.slice(startIdx, endIdx);

    const nearStrikeSet = new Set(nearStrikes);
    const relevantOpts = chainOpts.filter((o) => nearStrikeSet.has(o.strike));

    const symbolToOpt = {};
    for (const opt of relevantOpts) {
      symbolToOpt[`NFO:${opt.tradingsymbol}`] = opt;
    }

    const symbols = Object.keys(symbolToOpt);
    const quoteBatches = batch(symbols, 200);
    const quoteResults = await Promise.all(quoteBatches.map((b) => kc.getQuote(b)));
    const quotes = Object.assign({}, ...quoteResults);

    const rowsMap = {};

    for (const [tsym, opt] of Object.entries(symbolToOpt)) {
      const q = quotes[tsym] || {};
      const strike = opt.strike;
      const side = opt.instrument_type;

      rowsMap[strike] = rowsMap[strike] || { strike };

      rowsMap[strike][`${side}_ltp`] = q.last_price ?? null;
      rowsMap[strike][`${side}_oi`] = q.oi ?? null;
      rowsMap[strike][`${side}_oiChange`] = q.oi_day_high != null && q.oi_day_low != null
        ? (q.oi_day_high - q.oi_day_low)
        : null;
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
    return NextResponse.json(
      { error: isAuthError ? "not_connected" : "fetch_failed", message },
      { status: isAuthError ? 401 : 500 }
    );
  }
}