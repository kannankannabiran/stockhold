// src/app/api/orders/route.js
import { NextResponse } from 'next/server';
import { getKiteClient } from '@/lib/kiteClient';
import { listPaperOrders, placePaperOrder } from '@/lib/paperTradingStore';

// GET /api/orders?mode=paper|live — full order book for the day
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'live';

    if (mode === 'paper') {
      const orders = listPaperOrders();
      return NextResponse.json({ success: true, orders });
    }

    const kite = await getKiteClient();
    const orders = await kite.getOrders();
    return NextResponse.json({ success: true, orders });
  } catch (err) {
    console.error('GET /api/orders failed:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

// POST /api/orders — place a new order
// body: {
//   mode ("paper"|"live"),
//   tradingsymbol, exchange ("NFO"|"BFO"|"NSE"|"BSE"),
//   transaction_type ("BUY"|"SELL"),
//   quantity, product ("MIS"|"NRML"|"CNC"),
//   order_type ("MARKET"|"LIMIT"|"SL"|"SL-M"),
//   price, trigger_price, variety ("regular"), instrument_token
// }
export async function POST(request) {
  try {
    const body = await request.json();
    const mode = body.mode || 'live';

    const required = ['tradingsymbol', 'exchange', 'transaction_type', 'quantity', 'product', 'order_type'];
    const missing = required.filter((f) => !body[f]);
    if (missing.length) {
      return NextResponse.json(
        { success: false, error: `Missing fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    if (['LIMIT', 'SL'].includes(body.order_type) && !body.price) {
      return NextResponse.json(
        { success: false, error: `${body.order_type} orders require a price` },
        { status: 400 }
      );
    }
    if (['SL', 'SL-M'].includes(body.order_type) && !body.trigger_price) {
      return NextResponse.json(
        { success: false, error: `${body.order_type} orders require a trigger_price` },
        { status: 400 }
      );
    }

    const kite = await getKiteClient();

    if (mode === 'paper') {
      let ltp = null;
      if (body.order_type === 'MARKET') {
        const quoteKey = `${body.exchange}:${body.tradingsymbol}`;
        const quote = await kite.getLTP([quoteKey]);
        ltp = quote?.[quoteKey]?.last_price;
        if (!ltp) {
          return NextResponse.json(
            { success: false, error: 'Could not fetch LTP for paper fill' },
            { status: 500 }
          );
        }
      }

      const order_id = placePaperOrder({
        tradingsymbol: body.tradingsymbol,
        exchange: body.exchange,
        transaction_type: body.transaction_type,
        quantity: Number(body.quantity),
        product: body.product,
        order_type: body.order_type,
        price: body.price ? Number(body.price) : null,
        trigger_price: body.trigger_price ? Number(body.trigger_price) : null,
        instrument_token: body.instrument_token,
        ltp,
      });

      return NextResponse.json({ success: true, order_id, mode: 'paper' });
    }

    const variety = body.variety || kite.VARIETY_REGULAR || 'regular';

    const orderParams = {
      exchange: body.exchange,
      tradingsymbol: body.tradingsymbol,
      transaction_type: body.transaction_type,
      quantity: Number(body.quantity),
      product: body.product,
      order_type: body.order_type,
      validity: body.validity || 'DAY',
    };
    if (body.price) orderParams.price = Number(body.price);
    if (body.trigger_price) orderParams.trigger_price = Number(body.trigger_price);
    if (body.disclosed_quantity) orderParams.disclosed_quantity = Number(body.disclosed_quantity);
    if (body.tag) orderParams.tag = body.tag;

    const response = await kite.placeOrder(variety, orderParams);
    return NextResponse.json({ success: true, order_id: response.order_id, mode: 'live' });
  } catch (err) {
    console.error('POST /api/orders failed:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to place order' },
      { status: 500 }
    );
  }
}