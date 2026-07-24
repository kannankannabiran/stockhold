import { NextResponse } from "next/server";
import db from "../../../lib/db";

const MAX_TREND_POINTS = 30;

// Market window: 9:15 AM – 3:30 PM IST
const MARKET_START_MIN = 9 * 60 + 15;
const MARKET_END_MIN = 15 * 60 + 30;

function istNowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return { dateKey: `${year}-${month}-${day}`, minutes: hour * 60 + minute };
}

function isWithinMarketHoursIST() {
  const { minutes } = istNowParts();
  return minutes >= MARKET_START_MIN && minutes <= MARKET_END_MIN;
}

function todayKeyIST() {
  return istNowParts().dateKey;
}

const insertPoint = db.prepare(`
  INSERT INTO oi_trend_history
    (id, symbol, strike, date, time, ce_oi, pe_oi, ce_oi_change, pe_oi_change, timestamp)
  VALUES (@id, @symbol, @strike, @date, @time, @ce_oi, @pe_oi, @ce_oi_change, @pe_oi_change, @timestamp)
`);

const insertManyPoints = db.transaction((points) => {
  for (const p of points) insertPoint.run(p);
});

const loadRecent = db.prepare(`
  SELECT id, date, time, strike,
         ce_oi AS ceOi, pe_oi AS peOi,
         ce_oi_change AS ceOiChange, pe_oi_change AS peOiChange, timestamp
  FROM oi_trend_history
  WHERE symbol = ? AND strike = ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

const loadRecentByDate = db.prepare(`
  SELECT id, date, time, strike,
         ce_oi AS ceOi, pe_oi AS peOi,
         ce_oi_change AS ceOiChange, pe_oi_change AS peOiChange, timestamp
  FROM oi_trend_history
  WHERE symbol = ? AND strike = ? AND date = ?
  ORDER BY timestamp DESC
  LIMIT ?
`);

const loadAllForStrike = db.prepare(`
  SELECT id, date, time, strike,
         ce_oi AS ceOi, pe_oi AS peOi,
         ce_oi_change AS ceOiChange, pe_oi_change AS peOiChange, timestamp
  FROM oi_trend_history
  WHERE symbol = ? AND strike = ?
  ORDER BY timestamp DESC
`);

const loadAllForStrikeByDate = db.prepare(`
  SELECT id, date, time, strike,
         ce_oi AS ceOi, pe_oi AS peOi,
         ce_oi_change AS ceOiChange, pe_oi_change AS peOiChange, timestamp
  FROM oi_trend_history
  WHERE symbol = ? AND strike = ? AND date = ?
  ORDER BY timestamp DESC
`);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const strike = Number(searchParams.get("strike"));
  const mode = searchParams.get("mode");
  const date = searchParams.get("date") || null;

  if (!symbol || !strike) {
    return NextResponse.json(
      { error: "symbol and strike are required" },
      { status: 400 }
    );
  }

  if (mode === "all") {
    const rows = date
      ? loadAllForStrikeByDate.all(symbol, strike, date)
      : loadAllForStrike.all(symbol, strike);
    return NextResponse.json(rows);
  }

  const rows = date
    ? loadRecentByDate.all(symbol, strike, date, MAX_TREND_POINTS)
    : loadRecent.all(symbol, strike, MAX_TREND_POINTS);
  const points = rows.map(({ timestamp, ...rest }) => rest);
  return NextResponse.json(points);
}

export async function POST(request) {
  const body = await request.json();
  const { symbol } = body || {};

  if (!symbol) {
    return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  }

  const now = new Date();
  const today = todayKeyIST();
  const date = body.date || today;

  // Only gate writes for "live" snapshots (no explicit date, or date === today).
  // Explicit past-date payloads (backfill/replay) bypass the market-hours check.
  const isLiveWrite = date === today;
  if (isLiveWrite && !isWithinMarketHoursIST()) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "outside_market_hours" },
      { status: 200 }
    );
  }

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