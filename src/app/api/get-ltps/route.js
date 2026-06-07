import { NextResponse } from "next/server";
import yahooFinance from "@/lib/yahooFinance";

export async function POST(request) {
  try {
    const { symbols } = await request.json();
    const ltps = {};

    for (const symbol of symbols) {
      try {
        const result = await yahooFinance.quote(`${symbol}.NS`);
        ltps[symbol] = parseFloat(result.regularMarketPrice.toFixed(2));
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err.message);
        ltps[symbol] = 0;
      }
    }

    return NextResponse.json(ltps);
  } catch (error) {
    console.error("API Error:", error.message);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
