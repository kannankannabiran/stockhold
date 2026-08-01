// src/app/api/orders/[order_id]/route.js
import { NextResponse } from 'next/server';
import { getKiteClient } from '@/lib/kiteClient';
import { modifyPaperOrder, cancelPaperOrder } from '@/lib/paperTradingStore';

// PUT /api/orders/:order_id?variety=regular&mode=paper|live — modify an open order
// body: { quantity?, price?, order_type?, trigger_price?, validity? }
export async function PUT(request, context) {
  let order_id;
  try {
    // Next.js 15+ passes `params` as a Promise; awaiting a plain object is a
    // no-op, so this works on older Next.js versions too.
    ({ order_id } = await context.params);

    const { searchParams } = new URL(request.url);
    const variety = searchParams.get('variety') || 'regular';
    const mode = searchParams.get('mode') || 'live';
    const body = await request.json();

    if (!order_id) {
      return NextResponse.json({ success: false, error: 'Missing order_id' }, { status: 400 });
    }

    if (mode === 'paper') {
      modifyPaperOrder(order_id, {
        quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
        price: body.price !== undefined ? Number(body.price) : undefined,
        order_type: body.order_type,
        trigger_price: body.trigger_price !== undefined ? Number(body.trigger_price) : undefined,
      });
      return NextResponse.json({ success: true, order_id, mode: 'paper' });
    }

    const kite = await getKiteClient();
    const modifyParams = {};
    if (body.quantity !== undefined) modifyParams.quantity = Number(body.quantity);
    if (body.price !== undefined) modifyParams.price = Number(body.price);
    if (body.order_type !== undefined) modifyParams.order_type = body.order_type;
    if (body.trigger_price !== undefined) modifyParams.trigger_price = Number(body.trigger_price);
    if (body.validity !== undefined) modifyParams.validity = body.validity;

    const response = await kite.modifyOrder(variety, order_id, modifyParams);
    return NextResponse.json({ success: true, order_id: response.order_id, mode: 'live' });
  } catch (err) {
    console.error(`PUT /api/orders/${order_id} failed:`, err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to modify order' },
      { status: 500 }
    );
  }
}

// DELETE /api/orders/:order_id?variety=regular&mode=paper|live — cancel an open order
export async function DELETE(request, context) {
  let order_id;
  try {
    ({ order_id } = await context.params);

    const { searchParams } = new URL(request.url);
    const variety = searchParams.get('variety') || 'regular';
    const mode = searchParams.get('mode') || 'live';

    if (!order_id) {
      return NextResponse.json({ success: false, error: 'Missing order_id' }, { status: 400 });
    }

    if (mode === 'paper') {
      cancelPaperOrder(order_id);
      return NextResponse.json({ success: true, order_id, mode: 'paper' });
    }

    const kite = await getKiteClient();
    const response = await kite.cancelOrder(variety, order_id);
    return NextResponse.json({ success: true, order_id: response.order_id, mode: 'live' });
  } catch (err) {
    console.error(`DELETE /api/orders/${order_id} failed:`, err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to cancel order' },
      { status: 500 }
    );
  }
}