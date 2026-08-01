// lib/kiteTickerClient.js
// Browser-side Kite Connect WebSocket ticker.
// Connects directly from the client to wss://ws.kite.trade using api_key + access_token.
// This is the same access_token your server already stores (SQLite token store) —
// pass it down to the page as a prop from a server component, don't hardcode it.
//
// NOTE on errors: WebSocket's native `onerror` event carries no code, message,
// or reason by design (browser security — see MDN). Logging it directly always
// prints `{}`. Real diagnostic info (if the server sent any) arrives via the
// `onclose` event's `code`/`reason` instead, so that's what onError now reports.

const MODE_LTP = 'ltp';
const MODE_QUOTE = 'quote';
const MODE_FULL = 'full';

// Kite closes the socket with 1006 (abnormal closure, no reason given) when
// the api_key/access_token pair is missing, malformed, or expired. It's the
// single most common cause of a ticker that fails on every page load —
// Kite access tokens expire daily and need a fresh login flow.
const LIKELY_AUTH_CLOSE_CODES = new Set([1006, 1008, 4001]);

class KiteTickerClient {
  constructor({ apiKey, accessToken, onTick, onConnect, onDisconnect, onError }) {
    this.apiKey = apiKey;
    this.accessToken = accessToken;
    this.onTick = onTick || (() => {});
    this.onConnect = onConnect || (() => {});
    this.onDisconnect = onDisconnect || (() => {});
    this.onError = onError || (() => {});

    this.ws = null;
    this.subscribed = new Set();
    this.modes = new Map(); // instrument_token -> mode
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 15000;
    this.manuallyClosed = false;
    this._lastCloseWasClean = true;
  }

  connect() {
    if (!this.apiKey || !this.accessToken) {
      // Building the URL with "undefined" in it produces the exact same
      // symptom as an expired token: a connection that fails instantly with
      // no useful error. Fail loudly here instead so it's obvious which one
      // it is.
      this.onError({
        reason: 'missing_credentials',
        message: 'KiteTickerClient.connect() called without apiKey/accessToken — not connecting.',
      });
      return;
    }

    this.manuallyClosed = false;
    const url = `wss://ws.kite.trade?api_key=${encodeURIComponent(this.apiKey)}&access_token=${encodeURIComponent(this.accessToken)}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this._lastCloseWasClean = true;
      this.onConnect();
      // Re-subscribe on reconnect
      if (this.subscribed.size > 0) {
        this._send({ a: 'subscribe', v: [...this.subscribed] });
        for (const [token, mode] of this.modes.entries()) {
          this._send({ a: 'mode', v: [mode, [token]] });
        }
      }
    };

    this.ws.onmessage = (event) => {
      if (typeof event.data === 'string') return; // heartbeat/postback text frames
      const ticks = this._parseBinary(event.data);
      if (ticks.length) this.onTick(ticks);
    };

    // The raw error event has nothing useful on it — don't forward it as-is.
    // The close event below carries the actual code/reason, so just mark
    // that this connection attempt didn't end cleanly and let onclose report.
    this.ws.onerror = () => {
      this._lastCloseWasClean = false;
    };

    this.ws.onclose = (closeEvent) => {
      // A close triggered by our own disconnect() (including the effect
      // cleanup that React 18/19 Strict Mode runs on every dev-mode mount,
      // tearing down a socket that's still mid-handshake) is not an error —
      // don't report it, and don't reconnect.
      const wasManual = this.manuallyClosed;
      if (!wasManual && (!this._lastCloseWasClean || !closeEvent.wasClean)) {
        const likelyAuthIssue = LIKELY_AUTH_CLOSE_CODES.has(closeEvent.code);
        this.onError({
          reason: likelyAuthIssue ? 'likely_invalid_or_expired_token' : 'connection_closed_uncleanly',
          code: closeEvent.code,
          closeReason: closeEvent.reason || '(none provided by server)',
          message: likelyAuthIssue
            ? `Kite ticker closed with code ${closeEvent.code} — this usually means the access_token is missing, malformed, or expired. Re-run the Kite login flow to get a fresh token.`
            : `Kite ticker closed unexpectedly with code ${closeEvent.code}.`,
        });
      }
      this.onDisconnect();
      if (!wasManual) this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts += 1;
    setTimeout(() => this.connect(), delay);
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  subscribe(tokens, mode = MODE_FULL) {
    tokens.forEach((t) => {
      this.subscribed.add(t);
      this.modes.set(t, mode);
    });
    this._send({ a: 'subscribe', v: tokens });
    this._send({ a: 'mode', v: [mode, tokens] });
  }

  unsubscribe(tokens) {
    tokens.forEach((t) => {
      this.subscribed.delete(t);
      this.modes.delete(t);
    });
    this._send({ a: 'unsubscribe', v: tokens });
  }

  disconnect() {
    this.manuallyClosed = true;
    if (this.ws) this.ws.close();
  }

  // Parses Kite's binary tick packet format.
  // Layout: 2-byte packet count header, then for each packet: 2-byte length + payload.
  _parseBinary(buf) {
    // Kite sends a 1-byte binary heartbeat frame periodically to keep the
    // connection alive — it has no packet-count header, just skip it.
    if (buf.byteLength < 2) return [];

    const dv = new DataView(buf);
    const numPackets = dv.getInt16(0);
    const ticks = [];
    let offset = 2;

    for (let i = 0; i < numPackets; i++) {
      if (offset + 2 > buf.byteLength) break; // malformed/truncated frame, bail safely
      const packetLen = dv.getInt16(offset);
      offset += 2;
      if (offset + packetLen > buf.byteLength) break;
      const packet = new DataView(buf, offset, packetLen);
      ticks.push(this._parsePacket(packet, packetLen));
      offset += packetLen;
    }
    return ticks;
  }

  _parsePacket(dv, len) {
    const instrument_token = dv.getInt32(0);
    const segment = instrument_token & 0xff;
    const isIndex = segment === 9; // NSE indices (e.g. NIFTY 50, NIFTY BANK)

    // LTP-only mode (8 bytes)
    if (len === 8) {
      return {
        mode: MODE_LTP,
        instrument_token,
        last_price: dv.getInt32(4) / 100,
      };
    }

    // Index quote/full modes have a different, shorter layout than tradeable instruments
    if (isIndex) {
      const tick = {
        mode: len === 28 ? MODE_QUOTE : MODE_FULL,
        instrument_token,
        last_price: dv.getInt32(4) / 100,
        ohlc: {
          high: dv.getInt32(8) / 100,
          low: dv.getInt32(12) / 100,
          open: dv.getInt32(16) / 100,
          close: dv.getInt32(20) / 100,
        },
      };
      tick.change = dv.getInt32(24) / 100;
      if (len === 32) {
        tick.exchange_timestamp = new Date(dv.getInt32(28) * 1000);
      }
      return tick;
    }

    const tick = {
      mode: len === 44 ? MODE_QUOTE : MODE_FULL,
      instrument_token,
      last_price: dv.getInt32(4) / 100,
    };

    if (len === 8) return tick;

    tick.last_traded_quantity = dv.getInt32(8);
    tick.average_traded_price = dv.getInt32(12) / 100;
    tick.volume_traded = dv.getInt32(16);
    tick.total_buy_quantity = dv.getInt32(20);
    tick.total_sell_quantity = dv.getInt32(24);
    tick.ohlc = {
      open: dv.getInt32(28) / 100,
      high: dv.getInt32(32) / 100,
      low: dv.getInt32(36) / 100,
      close: dv.getInt32(40) / 100,
    };

    if (len >= 44) {
      tick.change = ((tick.last_price - tick.ohlc.close) / tick.ohlc.close) * 100;
    }

    if (len === 184) {
      // Full mode: timestamp, oi, oi day high/low, exchange timestamp, market depth
      tick.last_trade_time = new Date(dv.getInt32(44) * 1000);
      tick.oi = dv.getInt32(48);
      tick.oi_day_high = dv.getInt32(52);
      tick.oi_day_low = dv.getInt32(56);
      tick.exchange_timestamp = new Date(dv.getInt32(60) * 1000);

      const depth = { buy: [], sell: [] };
      let depthOffset = 64;
      for (let i = 0; i < 5; i++) {
        depth.buy.push({
          quantity: dv.getInt32(depthOffset),
          price: dv.getInt32(depthOffset + 4) / 100,
          orders: dv.getInt16(depthOffset + 8),
        });
        depthOffset += 12;
      }
      for (let i = 0; i < 5; i++) {
        depth.sell.push({
          quantity: dv.getInt32(depthOffset),
          price: dv.getInt32(depthOffset + 4) / 100,
          orders: dv.getInt16(depthOffset + 8),
        });
        depthOffset += 12;
      }
      tick.depth = depth;
    }

    return tick;
  }
}

export { KiteTickerClient, MODE_LTP, MODE_QUOTE, MODE_FULL };