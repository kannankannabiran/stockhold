import { NextResponse } from 'next/server';
import db from '../../../../lib/db'; // adjust the relative path to match where db.js actually lives

// POST: store one summary snapshot (the 8 box values) for a symbol.
export async function POST(req) {
  try {
    const body = await req.json();
    const {
      symbol,
      date,
      time,
      callPlusTotal,
      callMinusTotal,
      callNet,
      putPlusTotal,
      putMinusTotal,
      putNet,
      diffOi,
      diffPct,
    } = body;

    if (!symbol || !date || !time) {
      return NextResponse.json({ error: 'symbol, date, time are required' }, { status: 400 });
    }

    const id = `${symbol}-${Date.now()}`;
    const timestamp = Date.now();

    db.prepare(
      `INSERT INTO trending_oi_summary
        (id, symbol, date, time, call_plus_total, call_minus_total, call_net,
         put_plus_total, put_minus_total, put_net, diff_oi, diff_pct, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      symbol,
      date,
      time,
      callPlusTotal ?? 0,
      callMinusTotal ?? 0,
      callNet ?? 0,
      putPlusTotal ?? 0,
      putMinusTotal ?? 0,
      putNet ?? 0,
      diffOi ?? 0,
      diffPct ?? null,
      timestamp
    );

    return NextResponse.json({ id, timestamp });
  } catch (err) {
    console.error('Failed to store trending OI summary', err);
    return NextResponse.json({ error: 'Failed to store summary' }, { status: 500 });
  }
}

// GET: fetch recent summary snapshots for a symbol (newest first).
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol');
    const limit = Number(searchParams.get('limit')) || 200;

    if (!symbol) {
      return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
    }

    const rows = db
      .prepare(
        `SELECT * FROM trending_oi_summary
         WHERE symbol = ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(symbol, limit);

    return NextResponse.json(rows);
  } catch (err) {
    console.error('Failed to fetch trending OI summary', err);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}