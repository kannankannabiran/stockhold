// src/app/api/spot-ltp/route.js
import { NextResponse } from 'next/server';
import { getKiteClient } from '@/lib/kiteClient';

// Standard Zerodha Kite quote keys for the underlying index spot price.
// ASSUMPTION — I don't have your instrument data to verify these against,
// but these are the standard Kite symbols: confirm if this route 404s or
// returns garbage.
const INDEX_QUOTE_KEY = {
  NIFTY: 'NSE:NIFTY 50',
  BANKNIFTY: 'NSE:NIFTY BANK',
  SENSEX: 'BSE:SENSEX',
};

// GET /api/spot-ltp?index=NIFTY|BANKNIFTY|SENSEX — underlying index LTP plus
//   change/changePercent for the ticker display, used to pick the ATM strike.
// GET /api/spot-ltp?symbol=NFO:NIFTY25AUG24350CE — plain LTP for any single
//   instrument (used for the Call/Put quick-trade LTP display, since the
//   WebSocket ticker hasn't been reliable in this app — same reasoning as
//   why the index ticker above polls over REST instead of relying on it).
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const index = searchParams.get('index');
    const symbol = searchParams.get('symbol');

    const kite = await getKiteClient();

    if (symbol) {
      const quote = await kite.getLTP([symbol]);
      const ltp = quote?.[symbol]?.last_price;
      if (typeof ltp !== 'number') {
        return NextResponse.json(
          { success: false, error: `No LTP returned for ${symbol}` },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, ltp });
    }

    const quoteKey = INDEX_QUOTE_KEY[index];
    if (!quoteKey) {
      return NextResponse.json(
        { success: false, error: `Unknown index: ${index}` },
        { status: 400 }
      );
    }

    // getQuote (not getLTP) so we also get OHLC for the change/% figures —
    // ASSUMPTION: response shape has .last_price and .ohlc.close like a
    // normal Kite quote; ohlc.close is used as prev-close if net_change
    // isn't present on the response.
    const quote = await kite.getQuote([quoteKey]);
    const q = quote?.[quoteKey];
    const ltp = q?.last_price;

    if (typeof ltp !== 'number') {
      return NextResponse.json(
        { success: false, error: `No LTP returned for ${quoteKey}` },
        { status: 500 }
      );
    }

    const prevClose = q?.ohlc?.close;
    const change = typeof q?.net_change === 'number'
      ? q.net_change
      : (typeof prevClose === 'number' ? ltp - prevClose : null);
    const changePercent = change !== null && typeof prevClose === 'number' && prevClose !== 0
      ? (change / prevClose) * 100
      : null;

    return NextResponse.json({ success: true, ltp, change, changePercent });
  } catch (err) {
    console.error('GET /api/spot-ltp failed:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch LTP' },
      { status: 500 }
    );
  }
}