import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../../lib/kite";
import { getOptionChainData } from "../../../../lib/optionChainCore";

const SAVE_INTERVAL_MS = 60 * 1000;
const MAX_HISTORY = 500;

let historyStore = {};
let lastSavedAt = {};

function computeSentiment(diffOi) {
  if (diffOi > 0) return "Bullish";
  if (diffOi < 0) return "Bearish";
  return "Neutral";
}

async function saveRow(kc, symbol) {
  const { rows } = await getOptionChainData(kc, symbol, null);

  let callChange = 0;
  let putChange = 0;

  for (const r of rows) {
    if (typeof r.CE_oiChange === "number") callChange += r.CE_oiChange;
    if (typeof r.PE_oiChange === "number") putChange += r.PE_oiChange;
  }

  const diffOi = putChange - callChange;
  const now = new Date();

  const row = {
    id: `${symbol}-${now.getTime()}`,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8),
    callChange,
    putChange,
    diffOi,
    sentiment: computeSentiment(diffOi),
  };

  historyStore[symbol] = historyStore[symbol] || [];
  historyStore[symbol].unshift(row);

  if (historyStore[symbol].length > MAX_HISTORY) {
    historyStore[symbol].length = MAX_HISTORY;
  }

  lastSavedAt[symbol] = now.getTime();
  return row;
}

export async function GET(request) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("kite_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "NIFTY").toUpperCase();

  const kc = newClient(accessToken);

  try {
    const last = lastSavedAt[symbol] || 0;
    if (Date.now() - last >= SAVE_INTERVAL_MS) {
      await saveRow(kc, symbol);
    }

    return NextResponse.json(historyStore[symbol] || []);
  } catch (err) {
    console.error("[trending-oi/history] error:", err);
    return NextResponse.json(
      { error: "fetch_failed", message: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}