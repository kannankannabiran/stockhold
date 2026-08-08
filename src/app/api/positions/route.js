// src/app/api/positions/route.js
import { NextResponse } from 'next/server';
import { getKiteClient } from '@/lib/kiteClient';
import { listPaperPositions } from '@/lib/paperTradingStore';
// GET /api/positions?mode=paper|live&mobile=... — { net: [...], day: [...] }
// `mobile` is required for mode=paper — pass the logged-in member's
// mobile (e.g. member.mobile from useAccessControl), same as stock_lists.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'live';
    if (mode === 'paper') {
      const mobile = searchParams.get('mobile');
      if (!mobile) {
        return NextResponse.json({ success: false, error: 'Missing mobile' }, { status: 400 });
      }

      const rows = listPaperPositions(mobile);
      // No longer filtering out quantity === 0 rows here — closed positions
      // stay in the response so the client can keep showing them with their
      // realized P&L instead of losing them the moment they're squared off.
      const net = rows.map((p) => ({
        tradingsymbol: p.tradingsymbol,
        exchange: p.exchange,
        product: p.product,
        instrument_token: p.instrument_token,
        quantity: p.quantity,
        average_price: p.average_price,
        last_price: p.last_price ?? p.average_price, // live LTP is layered on client-side via the ticker for open positions
        multiplier: p.multiplier || 1,
        // Only closed (flat) positions carry a pnl here — the store tracks
        // realized_pnl as fills close them out. Open positions are left
        // without a pnl field; the client computes their live unrealized
        // P&L itself from quantity/average_price + ticker LTP.
        ...(p.quantity === 0 ? { pnl: p.realized_pnl || 0 } : {}),
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