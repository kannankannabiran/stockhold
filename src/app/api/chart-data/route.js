import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const interval = searchParams.get("interval") || "1d";
  const period = searchParams.get("period") || "1mo";

  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    const result = await yahooFinance.historical(symbol, {
      period1: getPastDate(period),
      interval: interval,
    });

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "No data found" }, { status: 404 });
    }

    const chartData = result.map((row) => ({
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

function getPastDate(period) {
  const now = new Date();
  switch (period) {
    case "1mo": now.setMonth(now.getMonth() - 1); break;
    case "3mo": now.setMonth(now.getMonth() - 3); break;
    case "6mo": now.setMonth(now.getMonth() - 6); break;
    case "1y": now.setFullYear(now.getFullYear() - 1); break;
    case "5y": now.setFullYear(now.getFullYear() - 5); break;
    case "10y": now.setFullYear(now.getFullYear() - 10); break;
    case "15y": now.setFullYear(now.getFullYear() - 15); break;
    case "20y": now.setFullYear(now.getFullYear() - 20); break;
    default: now.setMonth(now.getMonth() - 1);
  }
  return now;
}
