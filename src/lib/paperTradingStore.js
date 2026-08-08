// src/lib/paperTradingStore.js
//
// Paper trading store (orders + positions), persisted in SQLite
// (data/trading.db, tables `paper_orders` / `paper_positions`) and scoped
// per user by mobile number — same pattern as `stock_lists`. Replaces the
// old single shared JSON file, which had no concept of separate users at
// all (every browser hitting mode=paper shared the same orders/positions).
//
// Every exported function now takes `mobile` as its first argument and
// only ever reads/writes rows for that mobile. Callers (the API routes)
// are responsible for getting `mobile` from the logged-in member — the
// same way stock_lists gets it — not from client input that isn't tied to
// a session.
//
// ASSUMPTIONS (carried over from the JSON version — confirm these match):
//   - order_id is a string like "PAPER<timestamp><counter>"
//   - MARKET orders fill immediately against live LTP (falls back to any
//     price the client sent if the quote lookup fails)
//   - LIMIT / SL / SL-M orders sit OPEN / TRIGGER PENDING until matched,
//     modified, or cancelled — call matchPaperOrders(mobile, ...) from
//     your ticker's onTick handler to fill them against live ticks
//   - Positions are netted per (mobile, tradingsymbol + product)
//   - Positions stay in the store once flat (quantity 0, closed) instead
//     of being deleted — each carries a running `realized_pnl` for the
//     day. A later fill on the same key reopens it and keeps accumulating
//     realized_pnl on top.

import db from '@/lib/db';
import { getKiteClient } from '@/lib/kiteClient';

const OPEN_STATUSES = ['OPEN', 'TRIGGER PENDING', 'OPEN PENDING'];

function posKey(tradingsymbol, product) {
  return `${tradingsymbol}__${product}`;
}

// Single shared counter row (paper_order_counter) guarantees unique order
// IDs even across mobiles/processes, without relying on Date.now()
// collisions.
function nextOrderId() {
  const bump = db.transaction(() => {
    const row = db.prepare('SELECT counter FROM paper_order_counter WHERE id = 1').get();
    const next = (row?.counter || 0) + 1;
    db.prepare('UPDATE paper_order_counter SET counter = ? WHERE id = 1').run(next);
    return next;
  });
  return `PAPER${Date.now()}${bump()}`;
}

async function resolveMarketPrice(order) {
  try {
    const kite = await getKiteClient();
    const key = `${order.exchange}:${order.tradingsymbol}`;
    const quote = await kite.getLTP([key]);
    const ltp = quote?.[key]?.last_price;
    if (typeof ltp === 'number' && ltp > 0) return ltp;
  } catch (err) {
    console.warn('paperTradingStore: LTP lookup failed, falling back to provided price:', err.message);
  }
  return Number(order.price) || 0;
}

function upsertPosition(fields) {
  db.prepare(`
    INSERT INTO paper_positions
      (mobile, position_key, tradingsymbol, exchange, product, instrument_token,
       quantity, average_price, last_price, multiplier, realized_pnl, updated_at)
    VALUES
      (@mobile, @position_key, @tradingsymbol, @exchange, @product, @instrument_token,
       @quantity, @average_price, @last_price, @multiplier, @realized_pnl, @updated_at)
    ON CONFLICT(mobile, position_key) DO UPDATE SET
      quantity = excluded.quantity,
      average_price = excluded.average_price,
      last_price = excluded.last_price,
      realized_pnl = excluded.realized_pnl,
      updated_at = excluded.updated_at
  `).run(fields);
}

// Applies a fill to the netted position for (mobile, tradingsymbol, product).
//
// - Same-direction fill (adding to a long/short): blends into average_price,
//   no P&L realized yet.
// - Opposite-direction fill (reducing, closing, or flipping): the portion
//   that closes the existing side realizes P&L against its average_price
//   and gets added to the position's running `realized_pnl`. Any leftover
//   quantity beyond that opens a new position at this fill's price (a
//   flip). If the fill exactly flattens the position, the row is KEPT
//   (quantity 0, average_price 0) instead of deleted, so the closed
//   position — and its realized P&L — stays visible.
function applyFillToPosition(mobile, order, fillPrice) {
  const key = posKey(order.tradingsymbol, order.product);
  const signedQty = order.transaction_type === 'BUY' ? order.quantity : -order.quantity;
  const multiplier = order.multiplier || 1;

  const existing = db
    .prepare('SELECT * FROM paper_positions WHERE mobile = ? AND position_key = ?')
    .get(mobile, key);

  if (!existing || existing.quantity === 0) {
    upsertPosition({
      mobile,
      position_key: key,
      tradingsymbol: order.tradingsymbol,
      exchange: order.exchange,
      product: order.product,
      instrument_token: order.instrument_token || null,
      quantity: signedQty,
      average_price: fillPrice,
      last_price: fillPrice,
      multiplier,
      // Carry over realized_pnl if this key was previously closed today
      // (a fresh round trip on the same symbol/product) instead of
      // resetting it, so Day P&L stays cumulative for the day.
      realized_pnl: existing ? existing.realized_pnl || 0 : 0,
      updated_at: Date.now(),
    });
    return;
  }

  const sameDirection = Math.sign(existing.quantity) === Math.sign(signedQty);

  if (sameDirection) {
    const totalCost = existing.average_price * Math.abs(existing.quantity) + fillPrice * Math.abs(signedQty);
    const newQuantity = existing.quantity + signedQty;
    upsertPosition({
      mobile,
      position_key: key,
      tradingsymbol: existing.tradingsymbol,
      exchange: existing.exchange,
      product: existing.product,
      instrument_token: existing.instrument_token,
      quantity: newQuantity,
      average_price: totalCost / Math.abs(newQuantity || 1),
      last_price: fillPrice,
      multiplier: existing.multiplier,
      realized_pnl: existing.realized_pnl || 0,
      updated_at: Date.now(),
    });
    return;
  }

  // Opposite direction: closes some or all of the existing position.
  const closingQty = Math.min(Math.abs(existing.quantity), Math.abs(signedQty));
  const existingIsLong = existing.quantity > 0;
  const realizedOnClose =
    (existingIsLong ? fillPrice - existing.average_price : existing.average_price - fillPrice) *
    closingQty *
    (existing.multiplier || multiplier || 1);
  const realizedPnl = (existing.realized_pnl || 0) + realizedOnClose;

  const newQuantity = existing.quantity + signedQty;
  let quantity;
  let average_price;

  if (newQuantity === 0) {
    // Fully flat — keep the row (don't delete) so it stays visible with
    // its realized P&L instead of disappearing from the positions list.
    quantity = 0;
    average_price = 0;
  } else if (Math.sign(newQuantity) !== Math.sign(existing.quantity)) {
    // Flipped direction — leftover quantity opens a fresh leg at this
    // fill's price; realized_pnl above already booked the closed side.
    quantity = newQuantity;
    average_price = fillPrice;
  } else {
    // Partial close, same direction retained — average_price is unchanged
    // for the remaining quantity.
    quantity = newQuantity;
    average_price = existing.average_price;
  }

  upsertPosition({
    mobile,
    position_key: key,
    tradingsymbol: existing.tradingsymbol,
    exchange: existing.exchange,
    product: existing.product,
    instrument_token: existing.instrument_token,
    quantity,
    average_price,
    last_price: fillPrice,
    multiplier: existing.multiplier,
    realized_pnl: realizedPnl,
    updated_at: Date.now(),
  });
}

export async function placePaperOrder(mobile, orderInput) {
  if (!mobile) throw new Error('placePaperOrder requires a mobile number');

  const order = {
    order_id: nextOrderId(),
    mobile,
    variety: 'regular',
    exchange: orderInput.exchange,
    tradingsymbol: orderInput.tradingsymbol,
    instrument_token: orderInput.instrument_token || null,
    transaction_type: orderInput.transaction_type,
    quantity: Number(orderInput.quantity),
    filled_quantity: 0,
    product: orderInput.product,
    order_type: orderInput.order_type,
    price: orderInput.price ? Number(orderInput.price) : 0,
    trigger_price: orderInput.trigger_price ? Number(orderInput.trigger_price) : 0,
    average_price: 0,
    status: 'OPEN',
    order_timestamp: new Date().toISOString(),
  };

  if (order.order_type === 'SL' || order.order_type === 'SL-M') {
    order.status = 'TRIGGER PENDING';
  }

  if (order.order_type === 'MARKET') {
    const fillPrice = await resolveMarketPrice(order);
    order.status = 'COMPLETE';
    order.filled_quantity = order.quantity;
    order.average_price = fillPrice;
  }

  db.prepare(`
    INSERT INTO paper_orders
      (order_id, mobile, variety, exchange, tradingsymbol, instrument_token,
       transaction_type, quantity, filled_quantity, product, order_type,
       price, trigger_price, average_price, status, order_timestamp)
    VALUES
      (@order_id, @mobile, @variety, @exchange, @tradingsymbol, @instrument_token,
       @transaction_type, @quantity, @filled_quantity, @product, @order_type,
       @price, @trigger_price, @average_price, @status, @order_timestamp)
  `).run(order);

  if (order.status === 'COMPLETE') {
    applyFillToPosition(mobile, order, order.average_price);
  }

  return order;
}

export function listPaperOrders(mobile) {
  if (!mobile) return [];
  return db
    .prepare('SELECT * FROM paper_orders WHERE mobile = ? ORDER BY order_timestamp DESC')
    .all(mobile);
}

// Returns ALL positions touched today for this mobile, including flat
// (quantity 0, closed) ones — callers that only want currently-open
// positions should filter on `quantity !== 0` themselves; this store
// doesn't filter internally so closed positions and their realized_pnl
// aren't lost.
export function listPaperPositions(mobile) {
  if (!mobile) return [];
  return db.prepare('SELECT * FROM paper_positions WHERE mobile = ?').all(mobile);
}

/**
 * Modify an open paper order in place, scoped to `mobile` (so one member
 * can never modify another member's order).
 * @returns the updated order, or null if no modifiable order with that id
 *          exists for this mobile.
 */
export function modifyPaperOrder(mobile, order_id, patch) {
  if (!mobile) return null;
  const order = db
    .prepare('SELECT * FROM paper_orders WHERE order_id = ? AND mobile = ?')
    .get(order_id, mobile);
  if (!order) return null;
  if (!OPEN_STATUSES.includes(order.status)) return null;

  const updated = {
    order_id,
    mobile,
    quantity: patch.quantity !== undefined ? Number(patch.quantity) : order.quantity,
    price: patch.price !== undefined ? Number(patch.price) : order.price,
    order_type: patch.order_type !== undefined ? patch.order_type : order.order_type,
    trigger_price: patch.trigger_price !== undefined ? Number(patch.trigger_price) : order.trigger_price,
  };

  db.prepare(`
    UPDATE paper_orders
    SET quantity = @quantity, price = @price, order_type = @order_type, trigger_price = @trigger_price
    WHERE order_id = @order_id AND mobile = @mobile
  `).run(updated);

  return { ...order, ...updated };
}

/**
 * Cancel an open paper order, scoped to `mobile`.
 * @returns the cancelled order, or null if no cancellable order with that
 *          id exists for this mobile.
 */
export function cancelPaperOrder(mobile, order_id) {
  if (!mobile) return null;
  const order = db
    .prepare('SELECT * FROM paper_orders WHERE order_id = ? AND mobile = ?')
    .get(order_id, mobile);
  if (!order) return null;
  if (!OPEN_STATUSES.includes(order.status)) return null;

  db.prepare('UPDATE paper_orders SET status = ? WHERE order_id = ? AND mobile = ?').run(
    'CANCELLED',
    order_id,
    mobile
  );

  return { ...order, status: 'CANCELLED' };
}

/**
 * Fill resting LIMIT/SL/SL-M paper orders for one mobile's symbol against a
 * live tick. Wire this into your ticker's onTick handler, e.g.:
 *   onTick: (ticks) => { ticks.forEach(t => matchPaperOrders(mobile, symbolForToken(t.instrument_token), t.last_price)) }
 * Scoped to a single mobile — if you run a background matcher across all
 * users, call this once per mobile that has open orders on the symbol
 * rather than trying to match globally.
 */
export function matchPaperOrders(mobile, tradingsymbol, ltp) {
  if (!mobile) return [];
  const placeholders = OPEN_STATUSES.map(() => '?').join(',');
  const orders = db
    .prepare(
      `SELECT * FROM paper_orders WHERE mobile = ? AND tradingsymbol = ? AND status IN (${placeholders})`
    )
    .all(mobile, tradingsymbol, ...OPEN_STATUSES);

  const filled = [];

  for (const order of orders) {
    const isBuy = order.transaction_type === 'BUY';
    let fillPrice = null;

    if (order.order_type === 'LIMIT') {
      const shouldFill = isBuy ? ltp <= order.price : ltp >= order.price;
      if (shouldFill) fillPrice = order.price;
    } else if (order.order_type === 'SL' || order.order_type === 'SL-M') {
      const triggered = isBuy ? ltp >= order.trigger_price : ltp <= order.trigger_price;
      if (triggered) fillPrice = order.order_type === 'SL-M' ? ltp : order.price;
    }

    if (fillPrice !== null) {
      db.prepare(`
        UPDATE paper_orders
        SET status = 'COMPLETE', filled_quantity = quantity, average_price = ?
        WHERE order_id = ? AND mobile = ?
      `).run(fillPrice, order.order_id, mobile);

      applyFillToPosition(mobile, order, fillPrice);
      filled.push({ ...order, status: 'COMPLETE', filled_quantity: order.quantity, average_price: fillPrice });
    }
  }

  return filled;
}

// One-off note: the old .data/paper-trading-store.json file is no longer
// read or written by this module. It's safe to delete once you've
// confirmed the new SQLite tables (paper_orders / paper_positions in
// data/trading.db) are working — there's no automatic migration since the
// old store had no per-user mobile keying to migrate into.