// src/lib/paperTradingStore.js
//
// Paper trading store (orders + positions) for mode=paper, persisted to a
// JSON file on disk. Previous version was in-memory only (a globalThis
// singleton) and reset on every dev-server restart — if you were seeing old
// orders that GET could list but DELETE/PUT couldn't find, that mismatch
// (or a duplicate in-memory instance from a module double-load) was why.
// Everything below reads/writes the same file, so there's one source of
// truth regardless of restarts or how many times the module gets loaded.
//
// ASSUMPTIONS (I still don't have your original file — confirm these match):
//   - order_id is a string like "PAPER<timestamp><counter>"
//   - MARKET orders fill immediately against live LTP (falls back to any
//     price the client sent if the quote lookup fails)
//   - LIMIT / SL / SL-M orders sit OPEN / TRIGGER PENDING until matched,
//     modified, or cancelled — call matchPaperOrders() from your ticker's
//     onTick handler to fill them against live ticks
//   - Positions are netted per (tradingsymbol + product)
//   - Positions stay in the store once flat (quantity 0) instead of being
//     deleted — each carries a running `realized_pnl` for the day, so a
//     closed trade doesn't just vanish along with its P&L. A later fill on
//     the same key reopens it and keeps accumulating realized_pnl on top.

import fs from 'fs';
import path from 'path';
import { getKiteClient } from '@/lib/kiteClient';

const DATA_DIR = path.join(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'paper-trading-store.json');
const OPEN_STATUSES = ['OPEN', 'TRIGGER PENDING', 'OPEN PENDING'];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Reads fresh from disk every call — this is a single-user dev tool, not a
// high-throughput service, so the simplicity of "always read the real file"
// is worth far more than caching would save.
function readStore() {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) {
    return { orders: [], positions: {}, counter: 0 };
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      orders: parsed.orders || [],
      positions: parsed.positions || {},
      counter: parsed.counter || 0,
    };
  } catch (err) {
    console.error('paperTradingStore: failed to read/parse store file, starting fresh:', err.message);
    return { orders: [], positions: {}, counter: 0 };
  }
}

function writeStore(store) {
  ensureDataDir();
  // Write to a temp file then rename — avoids a half-written file if the
  // process gets killed mid-write.
  const tmpFile = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpFile, STORE_FILE);
}

function nextOrderId(store) {
  store.counter += 1;
  return `PAPER${Date.now()}${store.counter}`;
}

function posKey(tradingsymbol, product) {
  return `${tradingsymbol}__${product}`;
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

// Applies a fill to the netted position for (tradingsymbol, product).
//
// - Same-direction fill (adding to a long/short): blends into average_price,
//   no P&L realized yet.
// - Opposite-direction fill (reducing, closing, or flipping): the portion
//   that closes the existing side realizes P&L against its average_price
//   and gets added to the position's running `realized_pnl`. Any leftover
//   quantity beyond that opens a new position at this fill's price (a
//   flip). If the fill exactly flattens the position, the record is KEPT
//   (quantity 0, average_price 0) instead of deleted, so the closed
//   position — and its realized P&L — stays visible.
function applyFillToPosition(store, order, fillPrice) {
  const key = posKey(order.tradingsymbol, order.product);
  const signedQty = order.transaction_type === 'BUY' ? order.quantity : -order.quantity;
  const multiplier = order.multiplier || 1;

  const existing = store.positions[key];

  if (!existing || existing.quantity === 0) {
    store.positions[key] = {
      tradingsymbol: order.tradingsymbol,
      exchange: order.exchange,
      product: order.product,
      instrument_token: order.instrument_token,
      quantity: signedQty,
      average_price: fillPrice,
      last_price: fillPrice,
      multiplier,
      // Carry over realized_pnl if this key was previously closed today
      // (a fresh round trip on the same symbol/product) instead of
      // resetting it, so Day P&L stays cumulative for the day.
      realized_pnl: existing ? existing.realized_pnl || 0 : 0,
    };
    return;
  }

  const sameDirection = Math.sign(existing.quantity) === Math.sign(signedQty);

  if (sameDirection) {
    const totalCost = existing.average_price * Math.abs(existing.quantity) + fillPrice * Math.abs(signedQty);
    existing.quantity += signedQty;
    existing.average_price = totalCost / Math.abs(existing.quantity || 1);
    existing.last_price = fillPrice;
    return;
  }

  // Opposite direction: closes some or all of the existing position.
  const closingQty = Math.min(Math.abs(existing.quantity), Math.abs(signedQty));
  const existingIsLong = existing.quantity > 0;
  const realizedOnClose =
    (existingIsLong ? fillPrice - existing.average_price : existing.average_price - fillPrice) *
    closingQty *
    (existing.multiplier || multiplier || 1);
  existing.realized_pnl = (existing.realized_pnl || 0) + realizedOnClose;

  const newQuantity = existing.quantity + signedQty;

  if (newQuantity === 0) {
    // Fully flat — keep the record (don't delete) so it stays visible with
    // its realized P&L instead of disappearing from the positions list.
    existing.quantity = 0;
    existing.average_price = 0;
    existing.last_price = fillPrice;
  } else if (Math.sign(newQuantity) !== Math.sign(existing.quantity)) {
    // Flipped direction — leftover quantity opens a fresh leg at this
    // fill's price; realized_pnl above already booked the closed side.
    existing.quantity = newQuantity;
    existing.average_price = fillPrice;
    existing.last_price = fillPrice;
  } else {
    // Partial close, same direction retained — average_price is unchanged
    // for the remaining quantity.
    existing.quantity = newQuantity;
    existing.last_price = fillPrice;
  }
}

export async function placePaperOrder(orderInput) {
  const store = readStore();

  const order = {
    order_id: nextOrderId(store),
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
    applyFillToPosition(store, order, fillPrice);
  }

  store.orders.push(order);
  writeStore(store);
  return order;
}

export function listPaperOrders() {
  const store = readStore();
  return [...store.orders].sort(
    (a, b) => new Date(b.order_timestamp) - new Date(a.order_timestamp)
  );
}

// Returns ALL positions touched today, including flat (quantity 0, closed)
// ones — callers that only want currently-open positions should filter on
// `quantity !== 0` themselves; this store no longer does that filtering
// internally so closed positions and their realized_pnl aren't lost.
export function listPaperPositions() {
  return Object.values(readStore().positions);
}

/**
 * Modify an open paper order in place.
 * @returns the updated order, or null if no modifiable order with that id exists.
 */
export function modifyPaperOrder(order_id, patch) {
  const store = readStore();
  const order = store.orders.find((o) => String(o.order_id) === String(order_id));
  if (!order) return null;
  if (!OPEN_STATUSES.includes(order.status)) return null;

  if (patch.quantity !== undefined) order.quantity = Number(patch.quantity);
  if (patch.price !== undefined) order.price = Number(patch.price);
  if (patch.order_type !== undefined) order.order_type = patch.order_type;
  if (patch.trigger_price !== undefined) order.trigger_price = Number(patch.trigger_price);

  writeStore(store);
  return order;
}

/**
 * Cancel an open paper order.
 * @returns the cancelled order, or null if no cancellable order with that id exists.
 */
export function cancelPaperOrder(order_id) {
  const store = readStore();
  const order = store.orders.find((o) => String(o.order_id) === String(order_id));
  if (!order) return null;
  if (!OPEN_STATUSES.includes(order.status)) return null;

  order.status = 'CANCELLED';
  writeStore(store);
  return order;
}

/**
 * Fill resting LIMIT/SL/SL-M paper orders for a symbol against a live tick.
 * Wire this into your ticker's onTick handler, e.g.:
 *   onTick: (ticks) => { ticks.forEach(t => matchPaperOrders(symbolForToken(t.instrument_token), t.last_price)) }
 */
export function matchPaperOrders(tradingsymbol, ltp) {
  const store = readStore();
  const filled = [];

  store.orders.forEach((order) => {
    if (order.tradingsymbol !== tradingsymbol) return;
    if (!OPEN_STATUSES.includes(order.status)) return;

    const isBuy = order.transaction_type === 'BUY';

    if (order.order_type === 'LIMIT') {
      const shouldFill = isBuy ? ltp <= order.price : ltp >= order.price;
      if (shouldFill) {
        order.status = 'COMPLETE';
        order.filled_quantity = order.quantity;
        order.average_price = order.price;
        applyFillToPosition(store, order, order.price);
        filled.push(order);
      }
    } else if (order.order_type === 'SL' || order.order_type === 'SL-M') {
      const triggered = isBuy ? ltp >= order.trigger_price : ltp <= order.trigger_price;
      if (triggered) {
        const fillPrice = order.order_type === 'SL-M' ? ltp : order.price;
        order.status = 'COMPLETE';
        order.filled_quantity = order.quantity;
        order.average_price = fillPrice;
        applyFillToPosition(store, order, fillPrice);
        filled.push(order);
      }
    }
  });

  if (filled.length) writeStore(store);
  return filled;
}

// One-off helper if you want to clear out old test data (ITC/HDFCBANK/SBIN
// etc. from earlier manual testing): delete .data/paper-trading-store.json
// and restart the dev server — a fresh empty store gets created on first use.