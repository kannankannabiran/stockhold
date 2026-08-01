// src/app/api/instruments/route.js
// GET /api/instruments?q=NIFTY25AUG&exchange=NFO&limit=30
// Searches across the full instrument dump (cached in memory, refreshed daily —
// same pattern as getNiftyOptionInstruments in kite.js, just not limited to NIFTY).

import { NextResponse } from 'next/server';
import { getKiteClient } from '@/lib/kiteClient';

let cache = { date: null, byExchange: {} }; // exchange -> instrument[]

async function loadInstruments(kite, exchange) {
  const today = new Date().toISOString().slice(0, 10);
  if (cache.date !== today) {
    cache = { date: today, byExchange: {} };
  }
  if (!cache.byExchange[exchange]) {
    cache.byExchange[exchange] = await kite.getInstruments([exchange]);
  }
  return cache.byExchange[exchange];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim().toUpperCase();
    const exchange = searchParams.get('exchange') || 'NFO';
    const limit = Number(searchParams.get('limit') || 30);

    const kite = await getKiteClient();
    const instruments = await loadInstruments(kite, exchange);

    const now = Date.now();
    let results = instruments;
    if (q) {
      results = instruments.filter((i) => {
        const symbol = i.tradingsymbol || '';
        const name = i.name || '';
        return symbol.includes(q) || name.includes(q);
      });
    }

    // Drop expired contracts so they can't outrank live ones
    results = results.filter((i) => !i.expiry || new Date(i.expiry).getTime() >= now);

    // Nearest expiry first, then alphabetical within that expiry
    results = results
      .slice()
      .sort((a, b) => {
        const ea = a.expiry ? new Date(a.expiry).getTime() : Infinity;
        const eb = b.expiry ? new Date(b.expiry).getTime() : Infinity;
        if (ea !== eb) return ea - eb;
        return (a.tradingsymbol || '').localeCompare(b.tradingsymbol || '');
      })
      .slice(0, limit)
      .map((i) => ({
        instrument_token: i.instrument_token,
        tradingsymbol: i.tradingsymbol,
        exchange: i.exchange,
        name: i.name,
        expiry: i.expiry,
        strike: i.strike,
        instrument_type: i.instrument_type,
        lot_size: i.lot_size,
      }));

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('GET /api/instruments failed:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to search instruments' },
      { status: 500 }
    );
  }
}