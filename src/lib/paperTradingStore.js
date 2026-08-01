// src/lib/paperTradingStore.js
// Simulated order/position tracking for paper trading mode — completely
// separate from real Kite orders. Reuses your existing db singleton (db.js)
// so it lives in the same trading.db file, just different tables.
//
// Fill logic (kept intentionally simple — no matching engine):
//   MARKET orders  -> filled immediately at current LTP (real market data via Kite)
//   LIMIT/SL/SL-M  -> stored as OPEN, sit in the order book like a real pending
//                     order, can be modified/cancelled, but won't auto-fill on
//                     price movement. Ask me to add a price-watcher if you want
//                     real fill simulation for these.

import db from './db';

db.exec(`
  CREATE TABLE IF NOT EXISTS paper_orders (
    order_id TEXT PRIMARY KEY,
    tradingsymbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    filled_quantity INTEGER NOT NULL DEFAULT 0,
    product TEXT NOT NULL,
    order_type TEXT NOT NULL,
    price REAL,
    trigger_price REAL,
    average_price REAL,
    status TEXT NOT NULL,
    variety TEXT NOT NULL DEFAULT 'regular',
    order_timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS paper_positions (
    tradingsymbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    product TEXT NOT NULL,
    instrument_token INTEGER,
    quantity INTEGER NOT NULL DEFAULT 0,
    average_price REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (tradingsymbol, product)
  );
`);

function genOrderId() {
  return `PAPER${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function listPaperOrders() {
  return db.prepare('SELECT * FROM paper_orders ORDER BY order_timestamp DESC').all();
}

export function listPaperPositions() {
  return db.prepare('SELECT * FROM paper_positions').all();
}

function upsertPosition({ tradingsymbol, exchange, product, instrument_token, transaction_type, quantity, fillPrice }) {
  const existing = db
    .prepare('SELECT * FROM paper_positions WHERE tradingsymbol = ? AND product = ?')
    .get(tradingsymbol, product);

  const signedQty = transaction_type === 'BUY' ? quantity : -quantity;

  if (!existing) {
    db.prepare(
      `INSERT INTO paper_positions (tradingsymbol, exchange, product, instrument_token, quantity, average_price)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(tradingsymbol, exchange, product, instrument_token || null, signedQty, fillPrice);
    return;
  }

  const newQty = existing.quantity + signedQty;

  // Position flat or flipped direction — reset average price basis
  if (existing.quantity === 0 || Math.sign(existing.quantity) !== Math.sign(newQty || existing.quantity)) {
    const newAvg = newQty === 0 ? 0 : fillPrice;
    db.prepare(
      'UPDATE paper_positions SET quantity = ?, average_price = ?, instrument_token = ? WHERE tradingsymbol = ? AND product = ?'
    ).run(newQty, newAvg, instrument_token || existing.instrument_token, tradingsymbol, product);
    return;
  }

  // Adding to an existing position in the same direction — weighted average
  const addingQty = Math.abs(signedQty);
  const newAvg = (existing.average_price * Math.abs(existing.quantity) + fillPrice * addingQty) / Math.abs(newQty);
  db.prepare(
    'UPDATE paper_positions SET quantity = ?, average_price = ?, instrument_token = ? WHERE tradingsymbol = ? AND product = ?'
  ).run(newQty, newAvg, instrument_token || existing.instrument_token, tradingsymbol, product);
}

// params: { tradingsymbol, exchange, transaction_type, quantity, product,
//           order_type, price, trigger_price, instrument_token, ltp }
// `ltp` must be supplied by the caller (fetched from Kite) for MARKET fills.
export function placePaperOrder(params) {
  const order_id = genOrderId();
  const now = new Date().toISOString();
  const isMarket = params.order_type === 'MARKET';

  const status = isMarket ? 'COMPLETE' : 'OPEN';
  const fillPrice = isMarket ? params.ltp : null;
  const filledQty = isMarket ? params.quantity : 0;

  db.prepare(
    `INSERT INTO paper_orders
      (order_id, tradingsymbol, exchange, transaction_type, quantity, filled_quantity,
       product, order_type, price, trigger_price, average_price, status, variety, order_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    order_id,
    params.tradingsymbol,
    params.exchange,
    params.transaction_type,
    params.quantity,
    filledQty,
    params.product,
    params.order_type,
    params.price || null,
    params.trigger_price || null,
    fillPrice,
    status,
    'regular',
    now
  );

  if (isMarket) {
    upsertPosition({
      tradingsymbol: params.tradingsymbol,
      exchange: params.exchange,
      product: params.product,
      instrument_token: params.instrument_token,
      transaction_type: params.transaction_type,
      quantity: params.quantity,
      fillPrice,
    });
  }

  return order_id;
}

export function modifyPaperOrder(order_id, updates) {
  const order = db.prepare('SELECT * FROM paper_orders WHERE order_id = ?').get(order_id);
  if (!order) throw new Error('Paper order not found');
  if (order.status !== 'OPEN') throw new Error('Only OPEN paper orders can be modified');

  const quantity = updates.quantity !== undefined ? updates.quantity : order.quantity;
  const price = updates.price !== undefined ? updates.price : order.price;
  const trigger_price = updates.trigger_price !== undefined ? updates.trigger_price : order.trigger_price;
  const order_type = updates.order_type !== undefined ? updates.order_type : order.order_type;

  db.prepare(
    'UPDATE paper_orders SET quantity = ?, price = ?, trigger_price = ?, order_type = ? WHERE order_id = ?'
  ).run(quantity, price, trigger_price, order_type, order_id);

  return order_id;
}

export function cancelPaperOrder(order_id) {
  const order = db.prepare('SELECT * FROM paper_orders WHERE order_id = ?').get(order_id);
  if (!order) throw new Error('Paper order not found');
  if (order.status !== 'OPEN') throw new Error('Only OPEN paper orders can be cancelled');

  db.prepare("UPDATE paper_orders SET status = 'CANCELLED' WHERE order_id = ?").run(order_id);
  return order_id;
}