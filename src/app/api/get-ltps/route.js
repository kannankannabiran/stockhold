import { NextResponse } from "next/server";
import { newClient } from "@/lib/kite";
import { getStoredAccessToken } from "@/lib/kiteTokenStore"; // CONFIRM: same path used in long-data/route.js

export async function POST(request) {
  try {
    const { symbols } = await request.json();
    const ltps = {};

    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: "No valid Kite access token — log in via your Kite auth route first." },
        { status: 401 }
      );
    }
    const kc = newClient(accessToken);

    // Kite wants "EXCHANGE:TRADINGSYMBOL" strings, e.g. "NSE:RELIANCE"
    const instrumentKeys = symbols.map((s) => `NSE:${s.replace(".NS", "").trim().toUpperCase()}`);

    // One call for all symbols instead of looping — Kite supports batched LTP fetches
    const quoteData = await kc.getLTP(instrumentKeys);

    for (const symbol of symbols) {
      const key = `NSE:${symbol.replace(".NS", "").trim().toUpperCase()}`;
      const quote = quoteData[key];
      if (quote && typeof quote.last_price === "number") {
        ltps[symbol] = parseFloat(quote.last_price.toFixed(2));
      } else {
        console.error(`No Kite LTP found for ${symbol}`);
        ltps[symbol] = 0;
      }
    }

    return NextResponse.json(ltps);
  } catch (error) {
    console.error("API Error:", error.message);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}