'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { KiteTickerClient } from '@/lib/kiteTickerClient';

const EXCHANGES = ['NFO', 'BFO', 'NSE', 'BSE'];
const PRODUCTS = ['MIS', 'NRML', 'CNC'];
const ORDER_TYPES = ['MARKET', 'LIMIT', 'SL', 'SL-M'];

const posKey = (p) => `${p.tradingsymbol}__${p.product}`;

// Instrument expiry values sometimes arrive as full ISO datetimes
// (e.g. "2026-08-11T00:00:00.000Z") rather than a plain date — this
// strips it down to a clean "11 Aug 2026" for display. Falls back to
// the raw string if it doesn't parse as a date.
const formatExpiryLabel = (exp) => {
  if (!exp) return exp;
  const d = new Date(exp);
  if (Number.isNaN(d.getTime())) return exp;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function TradingDashboard({ apiKey, accessToken }) {
  const [mode, setMode] = useState('paper'); // 'paper' | 'live' — default to paper for safety
  const [orders, setOrders] = useState([]);
  const [positions, setPositions] = useState([]);
  const [ltpMap, setLtpMap] = useState({}); // instrument_token -> last_price
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [placing, setPlacing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const tickerRef = useRef(null);

  const [symbolQuery, setSymbolQuery] = useState('');
  const [symbolResults, setSymbolResults] = useState([]);
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [symbolSearching, setSymbolSearching] = useState(false);
  const [symbolError, setSymbolError] = useState('');
  const symbolBoxRef = useRef(null);

  const [form, setForm] = useState({
    exchange: 'NFO',
    tradingsymbol: '',
    instrument_token: null,
    lot_size: null,
    transaction_type: 'BUY',
    quantity: '',
    product: 'MIS',
    order_type: 'MARKET',
    price: '',
    trigger_price: '',
  });

  const [pendingConfirm, setPendingConfirm] = useState(null); // { transaction_type, payload? } while awaiting live-order confirmation — payload overrides `form` when set (used by the NFO quick-trade pad)

  // ---- NFO quick-trade: index + strike picker resolving to CE/PE contracts ----
  const NFO_INDEXES = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
  // SENSEX options trade on BFO, not NFO — everything else here does.
  // Used to pick the right exchange when fetching instruments/quotes,
  // regardless of which top-level Exchange ('NFO') the order form itself
  // is set to (that field controls the order payload's exchange, not
  // where we look up the option chain).
  const NFO_INDEX_EXCHANGE = { NIFTY: 'NFO', BANKNIFTY: 'NFO', SENSEX: 'BFO' };
  const [nfoIndex, setNfoIndex] = useState('NIFTY');
  const [nfoInstruments, setNfoInstruments] = useState([]); // raw NFO instrument list for the chosen index
  const [nfoExpiries, setNfoExpiries] = useState([]);
  const [nfoExpiry, setNfoExpiry] = useState('');
  const [nfoStrikes, setNfoStrikes] = useState([]); // available strikes for the chosen index + expiry
  const [nfoStrikesLoading, setNfoStrikesLoading] = useState(false);
  const [nfoCallStrike, setNfoCallStrike] = useState('');
  const [nfoPutStrike, setNfoPutStrike] = useState('');
  const [nfoLots, setNfoLots] = useState(1);
  const [nfoCallOption, setNfoCallOption] = useState(null); // { tradingsymbol, exchange, instrument_token, lot_size }
  const [nfoPutOption, setNfoPutOption] = useState(null);
  const [nfoError, setNfoError] = useState('');
  const [oneClickEnabled, setOneClickEnabled] = useState(true); // when on, skip the live-confirm modal for quick-trade orders
  const [spotQuote, setSpotQuote] = useState(null); // { ltp, change, changePercent }
  const [nfoCallLtpFallback, setNfoCallLtpFallback] = useState(null); // REST value, used only when the WS ticker hasn't delivered a tick yet
  const [nfoPutLtpFallback, setNfoPutLtpFallback] = useState(null);
  const [symbolLtpFallback, setSymbolLtpFallback] = useState(null); // same idea, for the plain Trading Symbol search field (NSE/BSE/BFO)
  const [activeOrdersTab, setActiveOrdersTab] = useState('positions'); // 'positions' | 'orderbook' | 'tradebook'

  // ---- Risk management: day max loss / target, trailing stop-loss ----
  const [risk, setRisk] = useState({
    maxLoss: '',
    target: '',
    trailPoints: '',
    autoSquareOffEnabled: false,
    trailingSlEnabled: false,
  });
  const [riskStatus, setRiskStatus] = useState('');
  const [trailingStops, setTrailingStops] = useState({}); // posKey -> { stopPrice, steps }
  const dayLimitTriggeredRef = useRef(false);
  const squaringRef = useRef(false);
  const trailTriggeredRef = useRef(new Set());
  const peakRef = useRef({}); // posKey -> best (favorable) price seen since entry

  useEffect(() => {
    const savedMode = window.localStorage.getItem('trading_mode');
    if (savedMode === 'paper' || savedMode === 'live') setMode(savedMode);
    const savedRisk = window.localStorage.getItem('trading_risk');
    if (savedRisk) {
      try {
        setRisk(JSON.parse(savedRisk));
      } catch (e) {
        // ignore malformed saved settings
      }
    }
  }, []);

  const updateRisk = (patch) => {
    const next = { ...risk, ...patch };
    setRisk(next);
    window.localStorage.setItem('trading_risk', JSON.stringify(next));
  };

  const switchMode = (next) => {
    if (next === 'live') {
      const confirmed = window.confirm(
        'Switch to LIVE trading? Orders placed in this mode use real money in your Zerodha account.'
      );
      if (!confirmed) return;
    }
    setMode(next);
    window.localStorage.setItem('trading_mode', next);
    setStatusMsg('');
    dayLimitTriggeredRef.current = false;
    trailTriggeredRef.current = new Set();
    peakRef.current = {};
    setTrailingStops({});
  };

  const refreshOrders = async () => {
    const res = await fetch(`/api/orders?mode=${mode}`);
    const data = await res.json();
    if (data.success) setOrders(data.orders);
  };

  const refreshPositions = async () => {
    const res = await fetch(`/api/positions?mode=${mode}`);
    const data = await res.json();
    if (data.success) {
      setPositions(data.net || []);
      const tokens = (data.net || [])
        .filter((p) => p.quantity !== 0 && p.instrument_token)
        .map((p) => p.instrument_token);
      if (tickerRef.current && tokens.length) {
        tickerRef.current.subscribe(tokens, 'ltp');
      }
    }
  };

  useEffect(() => {
    refreshOrders();
    refreshPositions();
    const interval = setInterval(() => {
      refreshOrders();
      refreshPositions();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!apiKey || !accessToken) return;
    const ticker = new KiteTickerClient({
      apiKey,
      accessToken,
      onTick: (ticks) => {
        setLtpMap((prev) => {
          const next = { ...prev };
          ticks.forEach((t) => {
            next[t.instrument_token] = t.last_price;
          });
          return next;
        });
      },
      onError: (e) =>
        console.error(
          `Ticker error — reason: ${e?.reason ?? 'unknown'}, code: ${e?.code ?? 'n/a'}, closeReason: ${e?.closeReason ?? 'n/a'}, message: ${e?.message ?? 'n/a'}`
        ),
    });
    ticker.connect();
    tickerRef.current = ticker;
    return () => ticker.disconnect();
  }, [apiKey, accessToken]);

  useEffect(() => {
    if (!symbolQuery.trim()) {
      setSymbolResults([]);
      return;
    }
    setSymbolSearching(true);
    setSymbolError('');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/instruments?q=${encodeURIComponent(symbolQuery)}&exchange=${form.exchange}`
        );
        const data = await res.json();
        if (data.success) {
          setSymbolResults(data.results);
        } else {
          setSymbolResults([]);
          setSymbolError(data.error || 'Search failed');
        }
      } catch (err) {
        setSymbolResults([]);
        setSymbolError(err.message || 'Search failed');
      } finally {
        setSymbolSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolQuery, form.exchange]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (symbolBoxRef.current && !symbolBoxRef.current.contains(e.target)) {
        setSymbolDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectSymbol = (result) => {
    setForm({
      ...form,
      tradingsymbol: result.tradingsymbol,
      exchange: result.exchange,
      instrument_token: result.instrument_token,
      lot_size: result.lot_size || null,
      // default to 1 lot on select — except NSE, which has no real lot
      // concept, so quantity is left as-is for the user to type
      quantity: result.lot_size && result.exchange !== 'NSE' ? String(result.lot_size) : form.quantity,
    });
    setSymbolQuery(result.tradingsymbol);
    setSymbolDropdownOpen(false);
    if (result.instrument_token && tickerRef.current) {
      tickerRef.current.subscribe([result.instrument_token], 'ltp');
    }
  };

  // 1) Fetch the full NFO instrument list for the chosen index and derive
  // its available expiries. Runs once per index change.
  useEffect(() => {
    if (form.exchange !== 'NFO') {
      setNfoInstruments([]);
      setNfoExpiries([]);
      setNfoExpiry('');
      return;
    }
    setNfoStrikesLoading(true);
    setNfoError('');
    setNfoExpiry('');
    setNfoCallStrike('');
    setNfoPutStrike('');
    setNfoCallOption(null);
    setNfoPutOption(null);
    const timer = setTimeout(async () => {
      try {
        // limit=1000: the route defaults to only 30 rows sorted alphabetically
        // by tradingsymbol, which (for NIFTY's price range) means only the
        // lowest ~30 strikes come back — nowhere near current spot. We need
        // the full chain to find real ATM.
        const chainExchange = NFO_INDEX_EXCHANGE[nfoIndex] || 'NFO';
        const res = await fetch(`/api/instruments?q=${encodeURIComponent(nfoIndex)}&exchange=${chainExchange}&limit=1000`);
        const data = await res.json();
        if (!data.success) {
          setNfoInstruments([]);
          setNfoExpiries([]);
          setNfoError(data.error || 'Could not load instruments');
          return;
        }
        // A search for "NIFTY" can also match other NIFTY-family
        // instruments (NIFTYNXT50, etc.) if /api/instruments does a loose
        // substring match — those have their own, very different strike
        // ranges and will silently wreck the ATM calculation if they slip
        // in. Keep only rows whose tradingsymbol is the index name followed
        // immediately by a digit (the start of a date/strike), which real
        // NIFTY/BANKNIFTY/SENSEX option symbols always are, but a
        // differently-named instrument sharing the prefix never is.
        const rawResults = data.results || [];
        const results = rawResults.filter(
          (r) => r.tradingsymbol && r.tradingsymbol.startsWith(nfoIndex) && /^[0-9]/.test(r.tradingsymbol.slice(nfoIndex.length))
        );
        if (rawResults.length && !results.length) {
          console.warn(`All ${rawResults.length} /api/instruments results for "${nfoIndex}" were filtered out by the tradingsymbol-prefix check — the filter is probably too strict for your symbol format.`);
        }
        setNfoInstruments(results);
        const expiries = Array.from(new Set(results.filter((r) => r.expiry).map((r) => r.expiry))).sort();
        setNfoExpiries(expiries);
        if (!expiries.length) setNfoError(`No expiries found for ${nfoIndex}.`);
        else setNfoExpiry(expiries[0]); // nearest expiry first, assumes API/expiry strings sort chronologically
      } catch (err) {
        setNfoInstruments([]);
        setNfoExpiries([]);
        setNfoError(err.message || 'Could not load instruments');
      } finally {
        setNfoStrikesLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [nfoIndex, form.exchange]);

  // 2) Derive the strike list for the chosen expiry, fetch spot to find ATM,
  // then window the shown strikes to ATM ± 20 (instead of the full chain)
  // and default both Call/Put pickers to that ATM strike.
  const STRIKE_WINDOW = 20;
  useEffect(() => {
    if (form.exchange !== 'NFO' || !nfoExpiry || !nfoInstruments.length) {
      setNfoStrikes([]);
      return;
    }
    const forExpiry = nfoInstruments.filter((r) => r.expiry === nfoExpiry);
    const allStrikes = Array.from(new Set(forExpiry.filter((r) => r.strike).map((r) => Number(r.strike)))).sort((a, b) => a - b);
    if (!allStrikes.length) {
      setNfoStrikes([]);
      setNfoError(`No strikes found for ${nfoIndex} ${nfoExpiry}.`);
      return;
    }
    (async () => {
      let atmIndex = Math.floor(allStrikes.length / 2);
      let spotOk = false;
      try {
        const spotRes = await fetch(`/api/spot-ltp?index=${encodeURIComponent(nfoIndex)}`);
        const spotData = await spotRes.json();
        if (spotData.success && typeof spotData.ltp === 'number') {
          spotOk = true;
          setSpotQuote({ ltp: spotData.ltp, change: spotData.change ?? null, changePercent: spotData.changePercent ?? null });
          atmIndex = allStrikes.reduce(
            (bestIdx, s, i) => (Math.abs(s - spotData.ltp) < Math.abs(allStrikes[bestIdx] - spotData.ltp) ? i : bestIdx),
            0
          );
        } else {
          console.warn('spot-ltp fetch returned no usable price:', spotData);
        }
      } catch (spotErr) {
        console.warn('spot-ltp fetch failed:', spotErr.message);
      }
      if (!spotOk) {
        setNfoError(`Could not fetch ${nfoIndex} spot price — defaulted to a mid-range strike instead of ATM. Check the console/terminal for /api/spot-ltp errors.`);
      }

      const windowStart = Math.max(0, atmIndex - STRIKE_WINDOW);
      const windowEnd = Math.min(allStrikes.length, atmIndex + STRIKE_WINDOW + 1);
      const windowedStrikes = allStrikes.slice(windowStart, windowEnd);
      const defaultStrike = allStrikes[atmIndex];

      setNfoStrikes(windowedStrikes);
      setNfoCallStrike(String(defaultStrike));
      setNfoPutStrike(String(defaultStrike));
    })();
  }, [nfoExpiry, nfoInstruments, nfoIndex, form.exchange]);

  // Poll the index spot quote every 5s while on NFO, independent of strike
  // selection — keeps the center ticker (LTP + change%) live.
  useEffect(() => {
    if (form.exchange !== 'NFO' || !nfoIndex) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/spot-ltp?index=${encodeURIComponent(nfoIndex)}`);
        const data = await res.json();
        if (data.success && typeof data.ltp === 'number') {
          setSpotQuote({ ltp: data.ltp, change: data.change ?? null, changePercent: data.changePercent ?? null });
        }
      } catch (err) {
        // Polling failure isn't worth surfacing every 5s — the initial fetch
        // above already reports it once via nfoError.
      }
    };
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [nfoIndex, form.exchange]);

  // Resolve CE for the chosen call strike + PE for the chosen put strike,
  // independently, from the already-fetched instrument list for this expiry
  // — no extra network calls.
  useEffect(() => {
    if (form.exchange !== 'NFO' || !nfoExpiry || !nfoInstruments.length) {
      setNfoCallOption(null);
      return;
    }
    if (!nfoCallStrike) {
      setNfoCallOption(null);
      return;
    }
    const match = nfoInstruments.find(
      (r) => r.expiry === nfoExpiry && Number(r.strike) === Number(nfoCallStrike) && r.instrument_type === 'CE'
    );
    setNfoCallOption(match || null);
    if (match?.instrument_token && tickerRef.current) {
      tickerRef.current.subscribe([match.instrument_token], 'ltp');
    }
  }, [nfoCallStrike, nfoExpiry, nfoInstruments, form.exchange]);

  useEffect(() => {
    if (form.exchange !== 'NFO' || !nfoExpiry || !nfoInstruments.length) {
      setNfoPutOption(null);
      return;
    }
    if (!nfoPutStrike) {
      setNfoPutOption(null);
      return;
    }
    const match = nfoInstruments.find(
      (r) => r.expiry === nfoExpiry && Number(r.strike) === Number(nfoPutStrike) && r.instrument_type === 'PE'
    );
    setNfoPutOption(match || null);
    if (match?.instrument_token && tickerRef.current) {
      tickerRef.current.subscribe([match.instrument_token], 'ltp');
    }
  }, [nfoPutStrike, nfoExpiry, nfoInstruments, form.exchange]);

  // REST fallback for Call/Put LTP: only polls when the WS ticker hasn't
  // delivered a tick for that instrument_token yet (ltpMap has no entry).
  // Runs every 5s but is a no-op once ticks start arriving over WS, since
  // ltpMap[token] will exist and this value stops being read below.
  useEffect(() => {
    if (form.exchange !== 'NFO') {
      setNfoCallLtpFallback(null);
      setNfoPutLtpFallback(null);
      return;
    }
    const pollLeg = async (option, tokenHasTick, setter) => {
      if (!option || tokenHasTick) {
        setter(null);
        return;
      }
      try {
        const symbol = `${option.exchange || 'NFO'}:${option.tradingsymbol}`;
        const res = await fetch(`/api/spot-ltp?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (data.success && typeof data.ltp === 'number') {
          setter(data.ltp);
        } else {
          console.warn(`spot-ltp fallback for ${symbol} returned no usable price:`, data);
        }
      } catch (err) {
        console.warn(`spot-ltp fallback fetch failed for ${option.tradingsymbol}:`, err.message);
      }
    };
    const poll = () => {
      pollLeg(nfoCallOption, nfoCallOption?.instrument_token != null && ltpMap[nfoCallOption.instrument_token] != null, setNfoCallLtpFallback);
      pollLeg(nfoPutOption, nfoPutOption?.instrument_token != null && ltpMap[nfoPutOption.instrument_token] != null, setNfoPutLtpFallback);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [nfoCallOption, nfoPutOption, form.exchange, ltpMap]);

  // Same REST fallback, for the plain Trading Symbol search field used on
  // NSE/BSE/BFO (i.e. whenever exchange !== 'NFO', where a symbol is picked
  // directly rather than resolved via strike). Only polls while the WS
  // ticker hasn't delivered a tick for the selected instrument_token.
  useEffect(() => {
    if (form.exchange === 'NFO' || !form.tradingsymbol || form.instrument_token == null) {
      setSymbolLtpFallback(null);
      return;
    }
    const tokenHasTick = ltpMap[form.instrument_token] != null;
    if (tokenHasTick) {
      setSymbolLtpFallback(null);
      return;
    }
    const poll = async () => {
      try {
        const symbol = `${form.exchange}:${form.tradingsymbol}`;
        const res = await fetch(`/api/spot-ltp?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (data.success && typeof data.ltp === 'number') {
          setSymbolLtpFallback(data.ltp);
        } else {
          console.warn(`spot-ltp fallback for ${symbol} returned no usable price:`, data);
        }
      } catch (err) {
        console.warn(`spot-ltp fallback fetch failed for ${form.tradingsymbol}:`, err.message);
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [form.exchange, form.tradingsymbol, form.instrument_token, ltpMap]);

  // side: 'call' | 'put'
  const placeQuickOrder = (side, transaction_type) => {
    const option = side === 'call' ? nfoCallOption : nfoPutOption;
    if (!option) {
      setStatusMsg(`No ${side === 'call' ? 'CE' : 'PE'} contract resolved for that strike yet.`);
      return;
    }
    const quantity = (option.lot_size || 1) * nfoLots;
    const payload = {
      exchange: option.exchange || 'NFO',
      tradingsymbol: option.tradingsymbol,
      instrument_token: option.instrument_token,
      quantity,
      product: form.product,
      order_type: 'MARKET',
    };

    if (mode === 'live' && !oneClickEnabled) {
      setPendingConfirm({ transaction_type, payload });
      return;
    }
    submitOrder(transaction_type, payload);
  };

  const setLots = (n) => {
    if (!form.lot_size) return;
    setForm({ ...form, quantity: String(form.lot_size * n) });
  };


  const ltpPreview = (form.instrument_token != null ? ltpMap[form.instrument_token] : null) ?? symbolLtpFallback ?? null;
  const nfoCallLtp =
    (nfoCallOption?.instrument_token != null ? ltpMap[nfoCallOption.instrument_token] : null) ?? nfoCallLtpFallback ?? null;
  const nfoPutLtp =
    (nfoPutOption?.instrument_token != null ? ltpMap[nfoPutOption.instrument_token] : null) ?? nfoPutLtpFallback ?? null;

  // Nearest strike to live spot = ATM. For a call, strikes below spot are
  // ITM and above are OTM; for a put it's the reverse.
  const atmStrike = spotQuote && nfoStrikes.length
    ? nfoStrikes.reduce((nearest, s) => (Math.abs(s - spotQuote.ltp) < Math.abs(nearest - spotQuote.ltp) ? s : nearest))
    : null;
  const strikeMoneyness = (strike, side) => {
    if (!spotQuote || atmStrike === null) return '';
    if (strike === atmStrike) return 'ATM';
    if (side === 'call') return strike < spotQuote.ltp ? 'ITM' : 'OTM';
    return strike > spotQuote.ltp ? 'ITM' : 'OTM';
  };

  const estimatedValue =
    ltpPreview && form.quantity
      ? Number(form.quantity) *
        (form.order_type === 'MARKET' ? ltpPreview : Number(form.price) || ltpPreview)
      : null;

  const validateOrder = () => {
    if (!form.tradingsymbol) return 'Pick a trading symbol.';
    if (!form.quantity || Number(form.quantity) <= 0) return 'Enter a quantity greater than 0.';
    if (['LIMIT', 'SL'].includes(form.order_type) && !form.price) return `${form.order_type} orders need a price.`;
    if (['SL', 'SL-M'].includes(form.order_type) && !form.trigger_price) return `${form.order_type} orders need a trigger price.`;
    return null;
  };

  useEffect(() => {
    if (!statusMsg) return;
    const timer = setTimeout(() => setStatusMsg(''), 5000);
    return () => clearTimeout(timer);
  }, [statusMsg]);

  const submitOrder = async (transaction_type, overridePayload = null) => {
    setPlacing(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          overridePayload
            ? { ...overridePayload, transaction_type, mode }
            : { ...form, transaction_type, mode }
        ),
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg(`[${mode.toUpperCase()}] ${transaction_type} order placed: ${data.order_id}`);
        // Reset symbol/quantity so the form is ready for the next trade;
        // keep exchange/product/order_type since those tend to repeat.
        // (Quick-trade orders don't touch `form`, so this is a no-op for those.)
        setForm((f) => ({ ...f, tradingsymbol: '', instrument_token: null, lot_size: null, quantity: '', price: '', trigger_price: '' }));
        setSymbolQuery('');
        refreshOrders();
        refreshPositions();
      } else {
        setStatusMsg(`Failed: ${data.error}`);
      }
    } catch (err) {
      setStatusMsg(`Failed: ${err.message}`);
    } finally {
      setPlacing(false);
    }
  };

  // Live orders (real money) get a confirmation step first; paper orders
  // go straight through since nothing real is at risk.
  const handlePlaceOrder = async (transaction_type) => {
    const error = validateOrder();
    if (error) {
      setStatusMsg(error);
      return;
    }
    if (mode === 'live') {
      setPendingConfirm({ transaction_type });
      return;
    }
    await submitOrder(transaction_type);
  };

  // Places an opposite MARKET order to flatten a single position.
  const squareOffPosition = async (p) => {
    const transaction_type = p.quantity > 0 ? 'SELL' : 'BUY';
    await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        exchange: p.exchange,
        tradingsymbol: p.tradingsymbol,
        instrument_token: p.instrument_token,
        transaction_type,
        quantity: Math.abs(p.quantity),
        product: p.product,
        order_type: 'MARKET',
      }),
    });
  };

  const squareOffAll = async (reason) => {
    if (squaringRef.current) return;
    squaringRef.current = true;
    setRiskStatus(reason);
    try {
      for (const p of livePositionsRef.current) {
        await squareOffPosition(p);
      }
      await refreshOrders();
      await refreshPositions();
    } finally {
      squaringRef.current = false;
    }
  };

  const cancelAllOrders = async () => {
    setStatusMsg('Cancelling all open orders…');
    for (const o of openOrders) {
      try {
        await fetch(`/api/orders/${o.order_id}?variety=${o.variety || 'regular'}&mode=${mode}`, { method: 'DELETE' });
      } catch (err) {
        // keep going even if one cancel fails — refreshOrders below will
        // show whichever ones didn't actually cancel
      }
    }
    setStatusMsg('Cancel-all requested — check the order book for any that failed.');
    refreshOrders();
  };

  const startEdit = (order) => {
    setEditingOrderId(order.order_id);
    setEditValues({
      quantity: order.quantity,
      price: order.price,
      order_type: order.order_type,
      trigger_price: order.trigger_price,
    });
  };

  const submitModify = async (order) => {
    const res = await fetch(`/api/orders/${order.order_id}?variety=${order.variety || 'regular'}&mode=${mode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editValues),
    });
    const data = await res.json();
    if (data.success) {
      setEditingOrderId(null);
      refreshOrders();
    } else {
      setStatusMsg(`Modify failed: ${data.error}`);
    }
  };

  const cancelOrder = async (order) => {
    if (!order?.order_id) {
      setStatusMsg('Cancel failed: this order has no order_id.');
      return;
    }
    try {
      const res = await fetch(
        `/api/orders/${order.order_id}?variety=${order.variety || 'regular'}&mode=${mode}`,
        { method: 'DELETE' }
      );
      if (res.status === 404) {
        setStatusMsg('Cancel failed: /api/orders/[order_id] route not found (404) — restart your dev server.');
        return;
      }
      const data = await res.json();
      if (data.success) {
        refreshOrders();
      } else {
        setStatusMsg(`Cancel failed: ${data.error}`);
      }
    } catch (err) {
      setStatusMsg(`Cancel failed: ${err.message}`);
    }
  };

  const openOrders = useMemo(
    () => orders.filter((o) => ['OPEN', 'TRIGGER PENDING', 'OPEN PENDING'].includes(o.status)),
    [orders]
  );
  const otherOrders = useMemo(
    () => orders.filter((o) => !['OPEN', 'TRIGGER PENDING', 'OPEN PENDING'].includes(o.status)),
    [orders]
  );

  const livePositions = useMemo(
    () =>
      positions
        .filter((p) => p.quantity !== 0)
        .map((p) => {
          const ltp = ltpMap[p.instrument_token] ?? p.last_price;
          const pnl = p.quantity * (ltp - p.average_price) * (p.multiplier || 1);
          return { ...p, ltp, pnl };
        }),
    [positions, ltpMap]
  );

  // Kept in sync via effect below — lets squareOffAll read the latest
  // positions without becoming a dependency of the callback itself.
  const livePositionsRef = useRef([]);
  useEffect(() => {
    livePositionsRef.current = livePositions;
  }, [livePositions]);

  const dayPnl = useMemo(() => livePositions.reduce((sum, p) => sum + p.pnl, 0), [livePositions]);
  const orderError = validateOrder();

  // Day max-loss / target watcher
  useEffect(() => {
    if (!risk.autoSquareOffEnabled) return;
    if (dayLimitTriggeredRef.current) return;
    if (livePositions.length === 0) return;

    const maxLoss = Number(risk.maxLoss);
    const target = Number(risk.target);

    if (maxLoss > 0 && dayPnl <= -maxLoss) {
      dayLimitTriggeredRef.current = true;
      squareOffAll(`Max loss of ${maxLoss} hit (day P&L ${dayPnl.toFixed(2)}) — squaring off all positions.`);
    } else if (target > 0 && dayPnl >= target) {
      dayLimitTriggeredRef.current = true;
      squareOffAll(`Target of ${target} hit (day P&L ${dayPnl.toFixed(2)}) — squaring off all positions.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayPnl, risk.autoSquareOffEnabled, risk.maxLoss, risk.target]);

  // Trailing stop-loss watcher.
  // Works the same for BUY (long) and SELL/short positions — direction is
  // read from the sign of p.quantity.
  //
  // Behavior: as soon as a position exists it gets an immediate protective
  // stop `trailPoints` away from entry (e.g. entry - 10 for a long). As the
  // price moves further in your favor, the stop trails behind the best
  // price reached so far, stepping up by `trailPoints` for every
  // `trailPoints` of favorable movement — it never moves back against you,
  // even if price pulls back temporarily before continuing.
  useEffect(() => {
    if (!risk.trailingSlEnabled) return;
    const trailPoints = Number(risk.trailPoints);
    if (!trailPoints || trailPoints <= 0) return;

    const nextStops = {};
    const liveKeys = new Set(livePositions.map(posKey));

    // Drop peak-tracking for positions that no longer exist (closed/flipped)
    Object.keys(peakRef.current).forEach((key) => {
      if (!liveKeys.has(key)) delete peakRef.current[key];
    });

    livePositions.forEach((p) => {
      const key = posKey(p);
      if (trailTriggeredRef.current.has(key)) return;

      const isLong = p.quantity > 0;

      // Track the best (most favorable) price seen since entry so the
      // stop only ever moves in your favor, never backward.
      const prevPeak = peakRef.current[key] ?? p.average_price;
      const peak = isLong ? Math.max(prevPeak, p.ltp) : Math.min(prevPeak, p.ltp);
      peakRef.current[key] = peak;

      const favorableMove = isLong ? peak - p.average_price : p.average_price - peak;
      const steps = Math.floor(favorableMove / trailPoints); // 0 = still within first stop distance

      // steps=0 -> stop sits trailPoints away from entry (initial protective stop)
      // steps=1 -> stop at breakeven; steps=2 -> one trailPoints of locked profit; etc.
      const stopPrice = isLong
        ? p.average_price + (steps - 1) * trailPoints
        : p.average_price - (steps - 1) * trailPoints;

      nextStops[key] = { stopPrice, steps };

      const hit = isLong ? p.ltp <= stopPrice : p.ltp >= stopPrice;
      if (hit) {
        trailTriggeredRef.current.add(key);
        squareOffPosition(p).then(() => {
          refreshOrders();
          refreshPositions();
        });
        setRiskStatus(`Trailing stop hit on ${p.tradingsymbol} at ${stopPrice.toFixed(2)} — position closed.`);
      }
    });
    setTrailingStops(nextStops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePositions, risk.trailingSlEnabled, risk.trailPoints]);


  return (
    <div style={pageStyle}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

        .stk-btn { transition: filter 0.12s ease, transform 0.05s ease, box-shadow 0.15s ease; }
        .stk-btn:hover { filter: brightness(1.12); }
        .stk-btn:active { transform: translateY(1px); }
        .stk-btn:focus-visible { outline: 2px solid #6E7BFF; outline-offset: 2px; }

        input:focus-visible, select:focus-visible {
          outline: none;
          border-color: #6E7BFF !important;
          box-shadow: 0 0 0 3px rgba(110,123,255,0.18);
        }
        input::placeholder { color: #9CA3AF; }

        .stk-table tbody tr { transition: background 0.1s ease; }
        .stk-table tbody tr:hover { background: rgba(255,255,255,0.025); }

        .stk-live-dot {
          width: 7px; height: 7px; border-radius: 999px; background: #FF4B5C;
          box-shadow: 0 0 0 0 rgba(255,75,92,0.6);
          animation: stk-pulse 1.6s ease-out infinite;
        }
        @keyframes stk-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,75,92,0.55); }
          70%  { box-shadow: 0 0 0 7px rgba(255,75,92,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,75,92,0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .stk-live-dot { animation: none; }
        }

        @media (max-width: 640px) {
          .stk-form-grid { grid-template-columns: 1fr !important; }
          .stk-topbar { flex-direction: column; align-items: flex-start !important; }
        }
      `}</style>
      <div style={{ width: '100%', boxSizing: 'border-box', padding: '24px clamp(20px, 3.5vw, 56px) 60px' }}>
        {/* Top bar */}
        <div style={{ ...topBarStyle }} className="stk-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={wordmarkGlyphStyle}>S</div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.16em', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600, fontFamily: monoFont }}>
                Stockhold
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, margin: '2px 0 0', color: '#111827', letterSpacing: '-0.01em', fontFamily: displayFont }}>
                Trading
              </h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={dayPnlBadgeStyle(dayPnl)}>
              <span style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                Day P&amp;L
              </span>
              <span style={{ fontFamily: monoFont, fontSize: 19, fontWeight: 700 }}>
                {dayPnl >= 0 ? '+' : ''}
                {dayPnl.toFixed(2)}
              </span>
            </div>

            <div style={modeToggleStyle}>
              <button className="stk-btn" onClick={() => switchMode('paper')} style={modeBtnStyle(mode === 'paper', '#1FD980')}>
                Paper
              </button>
              <button className="stk-btn" onClick={() => switchMode('live')} style={modeBtnStyle(mode === 'live', '#FF4B5C')}>
                {mode === 'live' && <span className="stk-live-dot" />}
                Live
              </button>
            </div>
          </div>
        </div>

        {mode === 'live' && (
          <div style={liveWarningStyle}>
            <span className="stk-live-dot" style={{ background: '#F5A623', boxShadow: 'none' }} />
            Live mode — orders placed here use real money in your Zerodha account.
          </div>
        )}

        {/* Risk management */}
        <section style={cardStyle('#F5A623')}>
          <h2 style={sectionTitleStyle}>Risk Management</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 240px))', gap: 14 }}>
            <label style={labelStyle}>
              Max loss (₹)
              <input
                type="number"
                value={risk.maxLoss}
                onChange={(e) => updateRisk({ maxLoss: e.target.value })}
                placeholder="e.g. 5000"
                style={darkInputStyle}
              />
            </label>
            <label style={labelStyle}>
              Target (₹)
              <input
                type="number"
                value={risk.target}
                onChange={(e) => updateRisk({ target: e.target.value })}
                placeholder="e.g. 8000"
                style={darkInputStyle}
              />
            </label>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
              <input
                type="checkbox"
                checked={risk.autoSquareOffEnabled}
                onChange={(e) => updateRisk({ autoSquareOffEnabled: e.target.checked })}
                style={checkboxStyle}
              />
              <span style={{ fontSize: 13, color: '#374151' }}>Auto square-off all on max loss / target</span>
            </label>

            <label style={labelStyle}>
              Trailing SL step (points)
              <input
                type="number"
                value={risk.trailPoints}
                onChange={(e) => updateRisk({ trailPoints: e.target.value })}
                placeholder="e.g. 10"
                style={darkInputStyle}
              />
            </label>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
              <input
                type="checkbox"
                checked={risk.trailingSlEnabled}
                onChange={(e) => updateRisk({ trailingSlEnabled: e.target.checked })}
                style={checkboxStyle}
              />
              <span style={{ fontSize: 13, color: '#374151' }}>
                Trail stop by {risk.trailPoints || 'N'} pts every {risk.trailPoints || 'N'} pts gained
              </span>
            </label>
          </div>
          {riskStatus && <p style={{ marginTop: 12, fontSize: 13, color: '#F5A623', fontFamily: monoFont }}>{riskStatus}</p>}
        </section>

        {/* Order entry */}
        <section style={cardStyle('#6E7BFF')}>
          <h2 style={sectionTitleStyle}>Place Order</h2>

          {/* Control strip: Exchange, and — for NFO — Index / Expiry / Call Strike / Put Strike / Lots / Product / One-click */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 160px))', gap: 12 }} className="stk-form-grid">
            <label style={labelStyle}>
              Exchange
              <select
                value={form.exchange}
                onChange={(e) => setForm({ ...form, exchange: e.target.value })}
                style={darkInputStyle}
              >
                {EXCHANGES.map((ex) => (
                  <option key={ex} value={ex}>{ex}</option>
                ))}
              </select>
            </label>

            {form.exchange === 'NFO' && (
              <>
                <label style={labelStyle}>
                  Select Options
                  <select value={nfoIndex} onChange={(e) => setNfoIndex(e.target.value)} style={darkInputStyle}>
                    {NFO_INDEXES.map((idx) => (
                      <option key={idx} value={idx}>{idx}</option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  Expiry Date
                  <select
                    value={nfoExpiry}
                    onChange={(e) => setNfoExpiry(e.target.value)}
                    disabled={!nfoExpiries.length}
                    style={darkInputStyle}
                  >
                    {!nfoExpiries.length && <option value="">Loading…</option>}
                    {nfoExpiries.map((exp) => (
                      <option key={exp} value={exp}>{formatExpiryLabel(exp)}</option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  Call Strike Price
                  <select
                    value={nfoCallStrike}
                    onChange={(e) => setNfoCallStrike(e.target.value)}
                    disabled={nfoStrikesLoading || !nfoStrikes.length}
                    style={darkInputStyle}
                  >
                    {(nfoStrikesLoading || !nfoStrikes.length) && <option value="">—</option>}
                    {nfoStrikes.map((s) => {
                      const tag = strikeMoneyness(s, 'call');
                      return (
                        <option key={s} value={s}>{s}{tag ? ` (${tag})` : ''}</option>
                      );
                    })}
                  </select>
                  <div style={{ marginTop: 4, fontSize: 11, color: '#9CA3AF' }}>
                    Spot: <span style={{ fontFamily: monoFont, color: '#6B7280' }}>{spotQuote ? spotQuote.ltp.toFixed(2) : '—'}</span>
                    {' · '}
                    LTP: <span style={{ fontFamily: monoFont, color: '#6B7280' }}>{nfoCallLtp != null ? nfoCallLtp.toFixed(2) : '—'}</span>
                  </div>
                </label>

                <label style={labelStyle}>
                  Put Strike Price
                  <select
                    value={nfoPutStrike}
                    onChange={(e) => setNfoPutStrike(e.target.value)}
                    disabled={nfoStrikesLoading || !nfoStrikes.length}
                    style={darkInputStyle}
                  >
                    {(nfoStrikesLoading || !nfoStrikes.length) && <option value="">—</option>}
                    {nfoStrikes.map((s) => {
                      const tag = strikeMoneyness(s, 'put');
                      return (
                        <option key={s} value={s}>{s}{tag ? ` (${tag})` : ''}</option>
                      );
                    })}
                  </select>
                  <div style={{ marginTop: 4, fontSize: 11, color: '#9CA3AF' }}>
                    Spot: <span style={{ fontFamily: monoFont, color: '#6B7280' }}>{spotQuote ? spotQuote.ltp.toFixed(2) : '—'}</span>
                    {' · '}
                    LTP: <span style={{ fontFamily: monoFont, color: '#6B7280' }}>{nfoPutLtp != null ? nfoPutLtp.toFixed(2) : '—'}</span>
                  </div>
                </label>

                <label style={labelStyle}>
                  Qty (Lots)
                  <input
                    type="number"
                    min={1}
                    value={nfoLots}
                    onChange={(e) => setNfoLots(Math.max(1, Number(e.target.value) || 1))}
                    style={darkInputStyle}
                  />
                </label>

                <label style={labelStyle}>
                  Product
                  <select
                    value={form.product}
                    onChange={(e) => setForm({ ...form, product: e.target.value })}
                    style={darkInputStyle}
                  >
                    {PRODUCTS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>

                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                  <input
                    type="checkbox"
                    checked={oneClickEnabled}
                    onChange={(e) => setOneClickEnabled(e.target.checked)}
                    style={checkboxStyle}
                  />
                  <span style={{ fontSize: 13, color: '#374151' }}>
                    One click: <strong style={{ color: oneClickEnabled ? '#1FD980' : '#9CA3AF' }}>{oneClickEnabled ? 'Enabled' : 'Disabled'}</strong>
                  </span>
                </label>
              </>
            )}

            {form.exchange !== 'NFO' && (
              <>
                <label style={{ ...labelStyle, gridColumn: 'span 2' }}>
                  Trading Symbol
                  <div ref={symbolBoxRef} style={{ position: 'relative' }}>
                    <input
                      type="text"
                      value={symbolQuery}
                      onChange={(e) => {
                        setSymbolQuery(e.target.value.toUpperCase());
                        setSymbolDropdownOpen(true);
                      }}
                      onFocus={() => setSymbolDropdownOpen(true)}
                      placeholder="Search e.g. NIFTY, BANKNIFTY, SENSEX..."
                      style={darkInputStyle}
                      autoComplete="off"
                    />
                    {symbolDropdownOpen && symbolQuery.trim() && (
                      <div style={dropdownStyle}>
                        {symbolSearching && <div style={dropdownItemStyle}>Searching...</div>}
                        {!symbolSearching && symbolError && (
                          <div style={{ ...dropdownItemStyle, color: '#FF4B5C' }}>{symbolError}</div>
                        )}
                        {!symbolSearching && !symbolError && symbolResults.length === 0 && (
                          <div style={dropdownItemStyle}>No matches</div>
                        )}
                        {!symbolSearching &&
                          !symbolError &&
                          symbolResults.map((r) => (
                            <div
                              key={r.instrument_token}
                              onClick={() => selectSymbol(r)}
                              style={dropdownItemStyle}
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              <span style={{ fontWeight: 600, color: '#111827', fontFamily: monoFont }}>{r.tradingsymbol}</span>
                              <span style={{ color: '#9CA3AF', marginLeft: 8, fontSize: 12 }}>
                                {r.exchange}
                                {r.expiry ? ` · exp ${r.expiry}` : ''}
                                {r.strike ? ` · ${r.strike}` : ''}
                                {r.lot_size && r.exchange !== 'NSE' ? ` · lot ${r.lot_size}` : ''}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                  {form.tradingsymbol && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#6B7280', display: 'flex', gap: 10 }}>
                      <span>
                        LTP:{' '}
                        <span style={{ fontFamily: monoFont, color: '#111827', fontWeight: 600 }}>
                          {ltpPreview ? ltpPreview.toFixed(2) : '...'}
                        </span>
                      </span>
                      {form.lot_size && form.exchange !== 'NSE' && <span>Lot size: {form.lot_size}</span>}
                    </div>
                  )}
                </label>

                <label style={labelStyle}>
                  Quantity
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    style={darkInputStyle}
                  />
                  {form.lot_size && form.exchange !== 'NSE' ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {[1, 2, 5, 10].map((n) => {
                        const active = Number(form.quantity) === form.lot_size * n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setLots(n)}
                            className="stk-btn"
                            style={{
                              ...lotChipStyle,
                              background: active ? 'rgba(110,123,255,0.14)' : '#F3F4F6',
                              borderColor: active ? '#6E7BFF' : '#E5E7EB',
                              color: active ? '#A9B2FF' : '#6B7280',
                            }}
                          >
                            {n} lot{n > 1 ? 's' : ''}
                          </button>
                        );
                      })}
                    </div>
                  ) : form.exchange !== 'NSE' ? (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>Pick a symbol to see lot-size shortcuts</div>
                  ) : null}
                </label>
                <label style={labelStyle}>
                  Product
                  <select
                    value={form.product}
                    onChange={(e) => setForm({ ...form, product: e.target.value })}
                    style={darkInputStyle}
                  >
                    {PRODUCTS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>

                <label style={{ ...labelStyle, gridColumn: 'span 2' }}>
                  Order Type
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    {ORDER_TYPES.map((t) => {
                      const active = form.order_type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm({ ...form, order_type: t })}
                          className="stk-btn"
                          style={{
                            ...segBtnStyle,
                            background: active ? '#6E7BFF' : '#F3F4F6',
                            borderColor: active ? '#6E7BFF' : '#E5E7EB',
                            color: active ? '#FFFFFF' : '#6B7280',
                          }}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </label>

                {['LIMIT', 'SL'].includes(form.order_type) && (
                  <label style={labelStyle}>
                    Price
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="number"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        style={{ ...darkInputStyle, flex: 1 }}
                      />
                      {ltpPreview && (
                        <button
                          type="button"
                          className="stk-btn"
                          onClick={() => setForm({ ...form, price: String(ltpPreview) })}
                          style={{ ...smallBtnStyle, marginTop: 6, whiteSpace: 'nowrap' }}
                        >
                          Use LTP
                        </button>
                      )}
                    </div>
                  </label>
                )}
                {['SL', 'SL-M'].includes(form.order_type) && (
                  <label style={labelStyle}>
                    Trigger Price
                    <input
                      type="number"
                      value={form.trigger_price}
                      onChange={(e) => setForm({ ...form, trigger_price: e.target.value })}
                      style={darkInputStyle}
                    />
                  </label>
                )}
              </>
            )}
          </div>

          {form.exchange === 'NFO' ? (
            <>
              {nfoError && <p style={{ marginTop: 10, fontSize: 12, color: '#FF4B5C' }}>{nfoError}</p>}

              {/* Horizontal Call | Index ticker | Put quick-trade bar, mirroring a standard 1-click options terminal */}
              <div
                style={{
                  marginTop: 18,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  gap: 16,
                  alignItems: 'center',
                }}
              >
                {/* Call side */}
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', fontFamily: monoFont }}>
                    {nfoCallStrike || '—'} <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>CE</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2, fontFamily: monoFont }}>
                    {nfoCallOption ? nfoCallOption.tradingsymbol : '—'}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
                    LTP: <strong style={{ fontFamily: monoFont, color: '#111827' }}>{nfoCallLtp != null ? nfoCallLtp.toFixed(2) : '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={placing || !nfoCallOption}
                      onClick={() => placeQuickOrder('call', 'SELL')}
                      className="stk-btn"
                      style={{ ...quickPadBtnStyle, ...sellBtnStyle, ...(!nfoCallOption ? disabledBtnStyle : {}) }}
                    >
                      ← Sell Call
                    </button>
                    <button
                      disabled={placing || !nfoCallOption}
                      onClick={() => placeQuickOrder('call', 'BUY')}
                      className="stk-btn"
                      style={{ ...quickPadBtnStyle, ...buyBtnStyle, ...(!nfoCallOption ? disabledBtnStyle : {}) }}
                    >
                      ↑ Buy Call
                    </button>
                  </div>
                </div>

                {/* Center: index ticker + global actions */}
                <div style={{ textAlign: 'center', minWidth: 220 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', fontFamily: displayFont }}>{nfoIndex}</div>
                  <div style={{ fontSize: 15, fontFamily: monoFont, marginTop: 2 }}>
                    LTP: <strong style={{ color: '#111827' }}>{spotQuote ? spotQuote.ltp.toFixed(2) : '—'}</strong>{' '}
                    {spotQuote && spotQuote.change !== null && (
                      <span style={{ color: spotQuote.change >= 0 ? '#1FD980' : '#FF4B5C', fontSize: 12 }}>
                        ({spotQuote.change >= 0 ? '+' : ''}{spotQuote.change.toFixed(2)}
                        {spotQuote.changePercent !== null ? ` / ${spotQuote.changePercent >= 0 ? '+' : ''}${spotQuote.changePercent.toFixed(2)}%` : ''})
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                    <button
                      onClick={() => squareOffAll('Close All Positions requested.')}
                      className="stk-btn"
                      style={{ ...smallBtnStyle, color: '#FF4B5C', borderColor: 'rgba(255,75,92,0.35)' }}
                    >
                      Close All Positions
                    </button>
                    <button
                      onClick={cancelAllOrders}
                      className="stk-btn"
                      style={{ ...smallBtnStyle, color: '#F5A623', borderColor: 'rgba(245,166,35,0.35)' }}
                    >
                      Cancel All Orders
                    </button>
                  </div>
                  {statusMsg && (
                    <div style={{ marginTop: 8, fontSize: 11, color: statusMsg.toLowerCase().includes('fail') ? '#991B1B' : '#6B7280' }}>
                      {statusMsg}
                    </div>
                  )}
                </div>

                {/* Put side */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', fontFamily: monoFont }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>PE</span> {nfoPutStrike || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2, fontFamily: monoFont }}>
                    {nfoPutOption ? nfoPutOption.tradingsymbol : '—'}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
                    LTP: <strong style={{ fontFamily: monoFont, color: '#111827' }}>{nfoPutLtp != null ? nfoPutLtp.toFixed(2) : '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      disabled={placing || !nfoPutOption}
                      onClick={() => placeQuickOrder('put', 'BUY')}
                      className="stk-btn"
                      style={{ ...quickPadBtnStyle, ...buyBtnStyle, ...(!nfoPutOption ? disabledBtnStyle : {}) }}
                    >
                      ↓ Buy Put
                    </button>
                    <button
                      disabled={placing || !nfoPutOption}
                      onClick={() => placeQuickOrder('put', 'SELL')}
                      className="stk-btn"
                      style={{ ...quickPadBtnStyle, ...sellBtnStyle, ...(!nfoPutOption ? disabledBtnStyle : {}) }}
                    >
                      Sell Put →
                    </button>
                  </div>
                </div>
              </div>
              <p style={{ marginTop: 10, fontSize: 11, color: '#9CA3AF', textAlign: 'center' }}>
                Orders place at MARKET, {nfoLots} lot{nfoLots > 1 ? 's' : ''} × lot size, product {form.product}
                {oneClickEnabled ? ' — one-click enabled, live orders skip confirmation.' : ' — live orders still ask for confirmation.'}
              </p>
            </>
          ) : (
            <>
              {estimatedValue !== null && (
                <div style={{ marginTop: 14, fontSize: 13, color: '#6B7280' }}>
                  Est. order value:{' '}
                  <span style={{ fontFamily: monoFont, fontWeight: 700, color: '#111827' }}>
                    ₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button disabled={placing || !!orderError} onClick={() => handlePlaceOrder('BUY')} style={{ ...buyBtnStyle, ...(orderError ? disabledBtnStyle : {}) }} className="stk-btn">
                  {mode === 'paper' ? 'BUY (paper)' : 'BUY'}
                </button>
                <button disabled={placing || !!orderError} onClick={() => handlePlaceOrder('SELL')} style={{ ...sellBtnStyle, ...(orderError ? disabledBtnStyle : {}) }} className="stk-btn">
                  {mode === 'paper' ? 'SELL (paper)' : 'SELL'}
                </button>
              </div>
              {orderError && !placing && (
                <p style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF' }}>{orderError}</p>
              )}
            </>
          )}
        </section>

        {statusMsg && (
          <div style={toastStyle(statusMsg.toLowerCase().includes('fail'))}>
            {statusMsg}
          </div>
        )}

        {pendingConfirm && (
          <div style={modalBackdropStyle} onClick={() => setPendingConfirm(null)}>
            <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827', fontFamily: displayFont }}>Confirm live order</h3>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '6px 0 16px' }}>
                This places a real order in your Zerodha account.
              </p>
              <div style={confirmRowStyle}>
                <span>Symbol</span>
                <strong style={{ color: '#111827', fontFamily: monoFont }}>
                  {pendingConfirm.payload?.tradingsymbol ?? form.tradingsymbol}
                </strong>
              </div>
              <div style={confirmRowStyle}>
                <span>Side</span>
                <strong style={{ color: pendingConfirm.transaction_type === 'BUY' ? '#1FD980' : '#FF4B5C' }}>
                  {pendingConfirm.transaction_type}
                </strong>
              </div>
              <div style={confirmRowStyle}>
                <span>Quantity</span>
                <strong style={{ fontFamily: monoFont, color: '#111827' }}>
                  {pendingConfirm.payload?.quantity ?? form.quantity}
                </strong>
              </div>
              <div style={confirmRowStyle}>
                <span>Order type</span>
                <strong style={{ color: '#111827' }}>
                  {pendingConfirm.payload?.order_type ?? form.order_type}
                </strong>
              </div>
              {!pendingConfirm.payload && form.order_type !== 'MARKET' && (
                <div style={confirmRowStyle}>
                  <span>Price</span>
                  <strong style={{ fontFamily: monoFont, color: '#111827' }}>{form.price || form.trigger_price}</strong>
                </div>
              )}
              {!pendingConfirm.payload && estimatedValue !== null && (
                <div style={confirmRowStyle}>
                  <span>Est. value</span>
                  <strong style={{ fontFamily: monoFont, color: '#111827' }}>
                    ₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </strong>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button
                  className="stk-btn"
                  onClick={() => setPendingConfirm(null)}
                  style={{ ...smallBtnStyle, flex: 1, padding: '10px 0', textAlign: 'center' }}
                >
                  Cancel
                </button>
                <button
                  className="stk-btn"
                  disabled={placing}
                  onClick={async () => {
                    const tt = pendingConfirm.transaction_type;
                    const payload = pendingConfirm.payload;
                    setPendingConfirm(null);
                    await submitOrder(tt, payload);
                  }}
                  style={pendingConfirm.transaction_type === 'BUY' ? buyBtnStyle : sellBtnStyle}
                >
                  Confirm {pendingConfirm.transaction_type}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Positions */}
        <section style={cardStyle('#3AA0FF')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={sectionTitleStyle}>Positions</h2>
            {livePositions.length > 0 && (
              <button
                onClick={() => squareOffAll('Manual square-off requested.')}
                style={{ ...smallBtnStyle, color: '#FF4B5C', borderColor: 'rgba(255,75,92,0.35)' }}
                className="stk-btn"
              >
                Square off all
              </button>
            )}
          </div>
          <table style={tableStyle} className="stk-table">
            <thead>
              <tr>
                <th style={thStyle}>Symbol</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Avg</th>
                <th style={thStyle}>LTP</th>
                <th style={thStyle}>Trail Stop</th>
                <th style={thStyle}>P&amp;L</th>
                <th style={thStyle}>Product</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {livePositions.length === 0 && (
                <tr><td colSpan={8} style={emptyCellStyle}>No open positions</td></tr>
              )}
              {livePositions.map((p) => {
                const stop = trailingStops[posKey(p)];
                return (
                  <tr key={posKey(p)}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{p.tradingsymbol}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFont }}>{p.quantity}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFont }}>{p.average_price?.toFixed(2)}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFont }}>{p.ltp?.toFixed(2)}</td>
                    <td style={{ ...tdStyle, fontFamily: monoFont, color: '#F5A623' }}>
                      {stop ? stop.stopPrice.toFixed(2) : '-'}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: monoFont, color: p.pnl >= 0 ? '#1FD980' : '#FF4B5C', fontWeight: 700 }}>
                      {p.pnl >= 0 ? '+' : ''}{p.pnl?.toFixed(2)}
                    </td>
                    <td style={tdStyle}>{p.product}</td>
                    <td style={tdStyle}>
                      <button onClick={() => squareOffPosition(p).then(() => { refreshOrders(); refreshPositions(); })} style={smallBtnStyle} className="stk-btn">
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* Order book */}
        <section style={cardStyle('#9A6BFF')}>
          <h2 style={sectionTitleStyle}>Open Orders</h2>
          <table style={tableStyle} className="stk-table">
            <thead>
              <tr>
                <th style={thStyle}>Symbol</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Price</th>
                <th style={thStyle}>Trigger</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.length === 0 && (
                <tr><td colSpan={7} style={emptyCellStyle}>No open orders</td></tr>
              )}
              {openOrders.map((o) => (
                <tr key={o.order_id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{o.tradingsymbol}</td>
                  <td style={{ ...tdStyle, color: o.transaction_type === 'BUY' ? '#1FD980' : '#FF4B5C', fontWeight: 700 }}>
                    {o.transaction_type}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: monoFont }}>
                    {editingOrderId === o.order_id ? (
                      <input
                        type="number"
                        value={editValues.quantity}
                        onChange={(e) => setEditValues({ ...editValues, quantity: e.target.value })}
                        style={{ ...darkInputStyle, width: 70, marginTop: 0 }}
                      />
                    ) : o.quantity}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: monoFont }}>
                    {editingOrderId === o.order_id ? (
                      <input
                        type="number"
                        value={editValues.price}
                        onChange={(e) => setEditValues({ ...editValues, price: e.target.value })}
                        style={{ ...darkInputStyle, width: 80, marginTop: 0 }}
                      />
                    ) : o.price}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: monoFont }}>{o.trigger_price || '-'}</td>
                  <td style={tdStyle}>
                    <span style={statusPillStyle(o.status)}>{o.status}</span>
                  </td>
                  <td style={tdStyle}>
                    {editingOrderId === o.order_id ? (
                      <>
                        <button onClick={() => submitModify(o)} style={smallBtnStyle} className="stk-btn">Save</button>
                        <button onClick={() => setEditingOrderId(null)} style={smallBtnStyle} className="stk-btn">Cancel edit</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(o)} style={smallBtnStyle} className="stk-btn">Modify</button>
                        <button onClick={() => cancelOrder(o)} style={{ ...smallBtnStyle, color: '#FF4B5C' }} className="stk-btn">Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Order history */}
        <section style={{ ...cardStyle('#9CA3AF'), marginBottom: 0 }}>
          <h2 style={sectionTitleStyle}>Order History</h2>
          <table style={tableStyle} className="stk-table">
            <thead>
              <tr>
                <th style={thStyle}>Symbol</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Qty</th>
                <th style={thStyle}>Avg Price</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Time</th>
              </tr>
            </thead>
            <tbody>
              {otherOrders.length === 0 && (
                <tr><td colSpan={6} style={emptyCellStyle}>No completed orders yet</td></tr>
              )}
              {otherOrders.map((o) => (
                <tr key={o.order_id}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#111827' }}>{o.tradingsymbol}</td>
                  <td style={{ ...tdStyle, color: o.transaction_type === 'BUY' ? '#1FD980' : '#FF4B5C', fontWeight: 700 }}>
                    {o.transaction_type}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: monoFont }}>{o.filled_quantity ?? o.quantity}</td>
                  <td style={{ ...tdStyle, fontFamily: monoFont }}>{o.average_price}</td>
                  <td style={tdStyle}><span style={statusPillStyle(o.status)}>{o.status}</span></td>
                  <td style={{ ...tdStyle, color: '#9CA3AF', fontSize: 12, fontFamily: monoFont }}>{o.order_timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

// ---- Theme: light trading-terminal design system ----
const monoFont = "'JetBrains Mono', 'SF Mono', Consolas, monospace";
const sansFont = "'Inter', system-ui, -apple-system, sans-serif";
const displayFont = "'Space Grotesk', 'Inter', system-ui, sans-serif";

const pageStyle = {
  minHeight: '100vh',
  width: '100%',
  background: '#F2F1EE',
  backgroundImage:
    'radial-gradient(circle at 20% 0%, rgba(110,123,255,0.03), transparent 45%), radial-gradient(circle at 100% 20%, rgba(31,217,128,0.03), transparent 40%)',
  fontFamily: sansFont,
  color: '#111827',
};

const topBarStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 14,
  flexWrap: 'wrap',
  gap: 14,
};

const dayPnlBadgeStyle = (pnl) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  padding: '6px 16px',
  borderRadius: 8,
  background: pnl >= 0 ? 'rgba(31,217,128,0.08)' : 'rgba(255,75,92,0.08)',
  border: `1px solid ${pnl >= 0 ? 'rgba(31,217,128,0.3)' : 'rgba(255,75,92,0.3)'}`,
  color: pnl >= 0 ? '#1FD980' : '#FF4B5C',
});

const modeToggleStyle = {
  display: 'flex',
  background: '#FFFFFF',
  borderRadius: 8,
  padding: 3,
  border: '1px solid #E5E7EB',
};

const modeBtnStyle = (active, color) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 16px',
  borderRadius: 6,
  border: 'none',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  background: active ? color : 'transparent',
  color: active ? '#FFFFFF' : '#9CA3AF',
  transition: 'all 0.15s ease',
});

const liveWarningStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(245,166,35,0.06)',
  border: '1px solid rgba(245,166,35,0.25)',
  color: '#F5A623',
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 13,
  marginBottom: 18,
};

const cardStyle = (accent) => ({
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderTop: `2px solid ${accent || '#E5E7EB'}`,
  borderRadius: 8,
  padding: 18,
  marginBottom: 14,
  boxShadow: '0 1px 2px rgba(16,24,40,0.05)',
});

const disabledBtnStyle = {
  opacity: 0.4,
  cursor: 'not-allowed',
};

const toastStyle = (isError) => ({
  position: 'fixed',
  bottom: 24,
  right: 24,
  zIndex: 50,
  padding: '12px 18px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: monoFont,
  color: isError ? '#991B1B' : '#166534',
  background: isError ? 'rgba(255,75,92,0.1)' : 'rgba(31,217,128,0.1)',
  border: `1px solid ${isError ? 'rgba(255,75,92,0.4)' : 'rgba(31,217,128,0.4)'}`,
  boxShadow: '0 8px 24px rgba(16,24,40,0.12)',
  maxWidth: 360,
  backdropFilter: 'blur(8px)',
});

const wordmarkGlyphStyle = {
  width: 30,
  height: 30,
  borderRadius: 8,
  background: 'linear-gradient(135deg, #6E7BFF, #9A6BFF)',
  color: '#FFFFFF',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 15,
  fontFamily: displayFont,
};

const sectionTitleStyle = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#9CA3AF',
  marginBottom: 12,
  fontFamily: monoFont,
};

const labelStyle = {
  fontSize: 12,
  color: '#6B7280',
  display: 'block',
};

const darkInputStyle = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 6,
  padding: '9px 10px',
  background: '#F9FAFB',
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  fontSize: 14,
  color: '#111827',
  fontFamily: sansFont,
};

const checkboxStyle = {
  accentColor: '#6E7BFF',
  width: 15,
  height: 15,
};

const buyBtnStyle = {
  flex: 1,
  padding: '12px 0',
  color: '#FFFFFF',
  background: '#1FD980',
  border: 'none',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: '0 0 0 0 rgba(31,217,128,0)',
};

const sellBtnStyle = {
  ...buyBtnStyle,
  background: '#FF4B5C',
  color: '#FFFFFF',
};

const smallBtnStyle = {
  marginRight: 6,
  padding: '5px 10px',
  fontSize: 12,
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  background: '#F3F4F6',
  color: '#374151',
  cursor: 'pointer',
};

const segBtnStyle = {
  flex: 1,
  padding: '9px 0',
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid #E5E7EB',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'center',
};

const quickPadBtnStyle = {
  padding: '14px 6px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
  borderRadius: 8,
  border: 'none',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const lotChipStyle = {
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 600,
  border: '1px solid #E5E7EB',
  borderRadius: 999,
  cursor: 'pointer',
};

const modalBackdropStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(16,24,40,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 16,
  backdropFilter: 'blur(4px)',
};

const modalCardStyle = {
  background: '#FFFFFF',
  border: '1px solid #E5E7EB',
  borderRadius: 12,
  padding: 22,
  width: '100%',
  maxWidth: 380,
  boxShadow: '0 20px 40px rgba(16,24,40,0.18)',
};

const confirmRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '7px 0',
  borderBottom: '1px solid #E5E7EB',
  fontSize: 13,
  color: '#6B7280',
};

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 4 };
const thStyle = {
  textAlign: 'left',
  borderBottom: '1px solid #E5E7EB',
  padding: '6px 8px',
  color: '#9CA3AF',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontWeight: 600,
  fontFamily: monoFont,
};
const tdStyle = { borderBottom: '1px solid #E5E7EB', padding: '7px 8px', color: '#374151', fontSize: 12.5 };
const emptyCellStyle = { ...tdStyle, textAlign: 'center', color: '#9CA3AF', padding: '20px 8px' };

const statusPillStyle = (status) => {
  const complete = status === 'COMPLETE';
  const cancelled = status === 'CANCELLED' || status === 'REJECTED';
  return {
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: monoFont,
    background: complete ? 'rgba(31,217,128,0.1)' : cancelled ? 'rgba(255,75,92,0.1)' : 'rgba(245,166,35,0.1)',
    color: complete ? '#1FD980' : cancelled ? '#FF4B5C' : '#F5A623',
  };
};

const dropdownStyle = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  zIndex: 10,
  background: '#F3F4F6',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  marginTop: 4,
  maxHeight: 260,
  overflowY: 'auto',
  boxShadow: '0 8px 24px rgba(16,24,40,0.12)',
};

const dropdownItemStyle = {
  padding: '9px 12px',
  fontSize: 13,
  cursor: 'pointer',
  borderBottom: '1px solid #E5E7EB',
  color: '#374151',
};