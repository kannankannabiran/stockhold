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

// EXCHANGE:TRADINGSYMBOL, e.g. "NFO:NIFTY26811124600CE" — the format the
// dashboard sends via ?symbol=. Kept intentionally permissive (tradingsymbol
// characters vary — digits, letters, hyphens) rather than over-validating.
const SYMBOL_PATTERN = /^(NFO|BFO|NSE|BSE):[A-Z0-9._-]+$/;

// GET /api/spot-ltp?index=NIFTY|BANKNIFTY|SENSEX — underlying index LTP plus
// change/changePercent for the ticker display, and used client-side to pick
// the ATM strike by default.
//
// GET /api/spot-ltp?symbol=EXCHANGE:TRADINGSYMBOL — LTP (plus change/% where
// available) for an arbitrary instrument, e.g. a resolved CE/PE option leg.
// Exactly one of index / symbol is expected per request.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const index = searchParams.get('index');
    const symbol = searchParams.get('symbol');

    let quoteKey;
    if (symbol) {
      if (!SYMBOL_PATTERN.test(symbol)) {
        return NextResponse.json(
          { success: false, error: `Malformed symbol: ${symbol}` },
          { status: 400 }
        );
      }
      quoteKey = symbol;
    } else if (index) {
      quoteKey = INDEX_QUOTE_KEY[index];
      if (!quoteKey) {
        return NextResponse.json(
          { success: false, error: `Unknown index: ${index}` },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Provide either ?index= or ?symbol=' },
        { status: 400 }
      );
    }

    const kite = await getKiteClient();
    // getQuote (not getLTP) so we also get OHLC for the change/% figures —
    // ASSUMPTION: response shape has .last_price and .ohlc.close like a
    // normal Kite quote; ohlc.close is used as prev-close if net_change
    // isn't present on the response. Options quotes carry the same shape.
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
      { success: false, error: err.message || 'Failed to fetch index LTP' },
      { status: 500 }
    );
  }
}