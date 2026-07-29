import { NextResponse } from "next/server";
import { newClient } from "@/lib/kite";
import { getStoredAccessToken } from "@/lib/kiteTokenStore";
import { resolveInstrumentToken } from "@/lib/instrumentMap";

// Map UI period -> lookback used to compute from_date
const PERIOD_TO_MS = {
  "1mo": 30,
  "3mo": 90,
  "6mo": 180,
  "1y": 365,
  "5y": 365 * 5,
  "10y": 365 * 10,
  "15y": 365 * 15,
  "20y": 365 * 20,
};

// Map UI interval -> Kite's interval strings
const INTERVAL_MAP = {
  "1m": "minute",
  "3m": "3minute",
  "5m": "5minute",
  "10m": "10minute",
  "15m": "15minute",
  "30m": "30minute",
  "60m": "60minute",
  "1d": "day",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const intervalParam = searchParams.get("interval") || "1d";
  const period = searchParams.get("period") || "1mo";

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  const interval = INTERVAL_MAP[intervalParam] || "day";
  const days = PERIOD_TO_MS[period] || 1825;

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);

  try {
    const instrumentToken = await resolveInstrumentToken(symbol);
    if (!instrumentToken) {
      return NextResponse.json(
        { error: `No instrument token found for symbol: ${symbol}` },
        { status: 404 }
      );
    }

    const accessToken = getStoredAccessToken();
    if (!accessToken) {
      return NextResponse.json(
        { error: "Kite session expired or not connected. Please log in again." },
        { status: 401 }
      );
    }
    const kc = newClient(accessToken);

    // Kite's minute-interval candles are capped (typically 60 days per request),
    // so for long lookbacks with an intraday interval you'd need to chunk this
    // into multiple calls. Daily interval has no such practical cap.
    const candles = await kc.getHistoricalData(
      instrumentToken,
      interval,
      from,
      to,
      false, // continuous (only relevant for futures)
      false  // oi
    );

    if (!candles || candles.length === 0) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    const chartData = candles.map((row) => ({
      time: Math.floor(new Date(row.date).getTime() / 1000),
      open: parseFloat(row.open.toFixed(2)),
      high: parseFloat(row.high.toFixed(2)),
      low: parseFloat(row.low.toFixed(2)),
      close: parseFloat(row.close.toFixed(2)),
    }));

    return NextResponse.json(chartData);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}