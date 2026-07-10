import { NextResponse } from "next/server";
import db from "../../../lib/db"; // adjust path to match your project structure

const MAX_TREND_POINTS = 30;

const insertPoint = db.prepare(`
  INSERT INTO oi_trend_history
    (id, symbol, strike, date, time, ce_oi, pe_oi, ce_oi_change, pe_oi_change, timestamp)
  VALUES (@id, @symbol, @strike, @date, @time, @ce_oi, @pe_oi, @ce_oi_change, @pe_oi_change, @timestamp)
`);

// Wrap many inserts in one transaction so a full option chain (dozens of
// strikes) writes in a single fsync instead of one per row.
const insertManyPoints = db.transaction((points) => {
  for (const p of points) insertPoint.run(p);
});

const loadRecent = db.prepare(`
  SELECT id, time, ce_oi AS ceOi, pe_oi AS peOi,
         ce_oi_change AS ceOiChange, pe_oi_change AS peOiChange, timestamp
  FROM oi_trend_history
  WHERE symbol = ? AND strike = ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

const clearForStrike = db.prepare(`
  DELETE FROM oi_trend_history WHERE symbol = ? AND strike = ?
`);

const clearForSymbol = db.prepare(`
  DELETE FROM oi_trend_history WHERE symbol = ?
`);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const strike = Number(searchParams.get("strike"));

  if (!symbol || !strike) {
    return NextResponse.json(
      { error: "symbol and strike are required" },
      { status: 400 }
    );
  }

  const rows = loadRecent.all(symbol, strike, MAX_TREND_POINTS);
  // DB gives newest-first; the chart wants chronological order.
  const points = rows.reverse().map(({ timestamp, ...rest }) => rest);

  return NextResponse.json(points);
}

export async function POST(request) {
  const body = await request.json();
  const { symbol } = body || {};

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const now = new Date();
  const date = todayKey();

  // Bulk mode: { symbol, points: [{ strike, ceOi, peOi, ceOiChange, peOiChange, time }, ...] }
  if (Array.isArray(body.points)) {
    const rows = body.points
      .filter((p) => p && p.strike != null)
      .map((p, i) => ({
        id: `${symbol}-${p.strike}-${now.getTime()}-${i}`,
        symbol,
        strike: p.strike,
        date,
        time: p.time || now.toLocaleTimeString(),
        ce_oi: p.ceOi ?? null,
        pe_oi: p.peOi ?? null,
        ce_oi_change: p.ceOiChange ?? null,
        pe_oi_change: p.peOiChange ?? null,
        timestamp: now.getTime(),
      }));

    if (rows.length) insertManyPoints(rows);
    return NextResponse.json({ ok: true, inserted: rows.length });
  }

  // Single-point mode (kept for backward compatibility / manual calls).
  const { strike, ceOi, peOi, ceOiChange, peOiChange, time } = body;
  if (!strike) {
    return NextResponse.json(
      { error: "strike is required (or pass points[])" },
      { status: 400 }
    );
  }

  insertPoint.run({
    id: `${symbol}-${strike}-${now.getTime()}`,
    symbol,
    strike,
    date,
    time: time || now.toLocaleTimeString(),
    ce_oi: ceOi ?? null,
    pe_oi: peOi ?? null,
    ce_oi_change: ceOiChange ?? null,
    pe_oi_change: peOiChange ?? null,
    timestamp: now.getTime(),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const strikeParam = searchParams.get("strike");

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  if (strikeParam) {
    clearForStrike.run(symbol, Number(strikeParam));
  } else {
    // No strike given → clear all strikes for this symbol.
    clearForSymbol.run(symbol);
  }

  return NextResponse.json({ ok: true });
}