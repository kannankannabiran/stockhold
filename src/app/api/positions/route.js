// src/app/api/positions/route.js
import { NextResponse } from 'next/server';
import { getKiteClient } from '@/lib/kiteClient';
import { listPaperPositions } from '@/lib/paperTradingStore';

// GET /api/positions?mode=paper|live — { net: [...], day: [...] }
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'live';

    if (mode === 'paper') {
      const rows = listPaperPositions();
      const net = rows
        .filter((p) => p.quantity !== 0)
        .map((p) => ({
          tradingsymbol: p.tradingsymbol,
          exchange: p.exchange,
          product: p.product,
          instrument_token: p.instrument_token,
          quantity: p.quantity,
          average_price: p.average_price,
          last_price: p.average_price, // live LTP is layered on client-side via the ticker
          multiplier: 1,
        }));
      return NextResponse.json({ success: true, net, day: net, mode: 'paper' });
    }

    const kite = await getKiteClient();
    const positions = await kite.getPositions();
    return NextResponse.json({ success: true, ...positions, mode: 'live' });
  } catch (err) {
    console.error('GET /api/positions failed:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}