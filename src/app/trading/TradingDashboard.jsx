'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { KiteTickerClient } from '@/lib/kiteTickerClient';

const EXCHANGES = ['NFO', 'BFO', 'NSE', 'BSE'];
const PRODUCTS = ['MIS', 'NRML', 'CNC'];
const ORDER_TYPES = ['MARKET', 'LIMIT', 'SL', 'SL-M'];

const posKey = (p) => `${p.tradingsymbol}__${p.product}`;

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

  const [pendingConfirm, setPendingConfirm] = useState(null); 

  // ---- NFO quick-trade: index + strike picker resolving to CE/PE contracts ----
  const NFO_INDEXES = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
  const [nfoIndex, setNfoIndex] = useState('NIFTY');
  const [nfoInstruments, setNfoInstruments] = useState([]); 
  const [nfoExpiries, setNfoExpiries] = useState([]);
  const [nfoExpiry, setNfoExpiry] = useState('');
  const [nfoStrikes, setNfoStrikes] = useState([]); 
  const [nfoStrikesLoading, setNfoStrikesLoading] = useState(false);
  const [nfoCallStrike, setNfoCallStrike] = useState('');
  const [nfoPutStrike, setNfoPutStrike] = useState('');
  const [nfoLots, setNfoLots] = useState(1);
  const [nfoCallOption, setNfoCallOption] = useState(null); 
  const [nfoPutOption, setNfoPutOption] = useState(null);
  const [nfoError, setNfoError] = useState('');
  const [oneClickEnabled, setOneClickEnabled] = useState(true); 
  const [spotQuote, setSpotQuote] = useState(null); 
  const [nfoCallLtp, setNfoCallLtp] = useState(null);
  const [nfoPutLtp, setNfoPutLtp] = useState(null);
  const [activeOrdersTab, setActiveOrdersTab] = useState('positions'); 

  // ---- Risk management: day max loss / target, trailing stop-loss ----
  const [risk, setRisk] = useState({
    maxLoss: '',
    target: '',
    trailPoints: '',
    autoSquareOffEnabled: false,
    trailingSlEnabled: false,
  });
  const [riskStatus, setRiskStatus] = useState('');
  const [trailingStops, setTrailingStops] = useState({}); 
  const dayLimitTriggeredRef = useRef(false);
  const squaringRef = useRef(false);
  const trailTriggeredRef = useRef(new Set());
  const peakRef = useRef({}); 

  useEffect(() => {
    const savedMode = window.localStorage.getItem('trading_mode');
    if (savedMode === 'paper' || savedMode === 'live') setMode(savedMode);
    const savedRisk = window.localStorage.getItem('trading_risk');
    if (savedRisk) {
      try {
        setRisk(JSON.parse(savedRisk));
      } catch (e) {}
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
      quantity: result.lot_size ? String(result.lot_size) : form.quantity,
    });
    setSymbolQuery(result.tradingsymbol);
    setSymbolDropdownOpen(false);
    if (result.instrument_token && tickerRef.current) {
      tickerRef.current.subscribe([result.instrument_token], 'ltp');
    }
  };

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
        const res = await fetch(`/api/instruments?q=${encodeURIComponent(nfoIndex)}&exchange=NFO&limit=1000`);
        const data = await res.json();
        if (!data.success) {
          setNfoInstruments([]);
          setNfoExpiries([]);
          setNfoError(data.error || 'Could not load instruments');
          return;
        }
        const rawResults = data.results || [];
        const results = rawResults.filter(
          (r) => r.tradingsymbol && r.tradingsymbol.startsWith(nfoIndex) && /^[0-9]/.test(r.tradingsymbol.slice(nfoIndex.length))
        );
        if (rawResults.length && !results.length) {
          console.warn(`All ${rawResults.length} /api/instruments results for "${nfoIndex}" were filtered out by the tradingsymbol-prefix check.`);
        }
        setNfoInstruments(results);
        const expiries = Array.from(new Set(results.filter((r) => r.expiry).map((r) => r.expiry))).sort();
        setNfoExpiries(expiries);
        if (!expiries.length) setNfoError(`No expiries found for ${nfoIndex}.`);
        else setNfoExpiry(expiries[0]); 
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
        }
      } catch (spotErr) {}
      if (!spotOk) {
        setNfoError(`Could not fetch ${nfoIndex} spot price — defaulted to a mid-range strike.`);
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

  useEffect(() => {
    if (form.exchange !== 'NFO' || !nfoIndex) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/spot-ltp?index=${encodeURIComponent(nfoIndex)}`);
        const data = await res.json();
        if (data.success && typeof data.ltp === 'number') {
          setSpotQuote({ ltp: data.ltp, change: data.change ?? null, changePercent: data.changePercent ?? null });
        }
      } catch (err) {}
    };
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [nfoIndex, form.exchange]);

  useEffect(() => {
    if (form.exchange !== 'NFO') {
      setNfoCallLtp(null);
      setNfoPutLtp(null);
      return;
    }
    const pollLeg = async (option, setter) => {
      if (!option) {
        setter(null);
        return;
      }
      try {
        const symbol = `${option.exchange || 'NFO'}:${option.tradingsymbol}`;
        const res = await fetch(`/api/spot-ltp?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();
        if (data.success && typeof data.ltp === 'number') {
          setter(data.ltp);
        }
      } catch (err) {}
    };
    const poll = () => {
      pollLeg(nfoCallOption, setNfoCallLtp);
      pollLeg(nfoPutOption, setNfoPutLtp);
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [nfoCallOption, nfoPutOption, form.exchange]);

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

  const ltpPreview = form.instrument_token ? ltpMap[form.instrument_token] : null;

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
      } catch (err) {}
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

  const livePositionsRef = useRef([]);
  useEffect(() => {
    livePositionsRef.current = livePositions;
  }, [livePositions]);

  const dayPnl = useMemo(() => livePositions.reduce((sum, p) => sum + p.pnl, 0), [livePositions]);
  const orderError = validateOrder();

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

  useEffect(() => {
    if (!risk.trailingSlEnabled) return;
    const trailPoints = Number(risk.trailPoints);
    if (!trailPoints || trailPoints <= 0) return;

    const nextStops = {};
    const liveKeys = new Set(livePositions.map(posKey));

    Object.keys(peakRef.current).forEach((key) => {
      if (!liveKeys.has(key)) delete peakRef.current[key];
    });

    livePositions.forEach((p) => {
      const key = posKey(p);
      if (trailTriggeredRef.current.has(key)) return;

      const isLong = p.quantity > 0;
      const prevPeak = peakRef.current[key] ?? p.average_price;
      const peak = isLong ? Math.max(prevPeak, p.ltp) : Math.min(prevPeak, p.ltp);
      peakRef.current[key] = peak;

      const favorableMove = isLong ? peak - p.average_price : p.average_price - peak;
      const steps = Math.floor(favorableMove / trailPoints); 

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
    <main className="min-h-screen w-full bg-[#f8f9fa] px-2 py-5 text-slate-800 sm:px-4 lg:px-6">
      
      {/* Toast Notification */}
      {statusMsg && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-5 py-3 shadow-xl backdrop-blur-md border font-semibold text-sm animate-fade-in-up ${statusMsg.toLowerCase().includes('fail') ? 'bg-rose-50/90 text-rose-700 border-rose-200' : 'bg-emerald-50/90 text-emerald-700 border-emerald-200'}`}>
          {statusMsg}
        </div>
      )}

      {/* Live Order Confirmation Modal */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <h3 className="text-xl font-bold text-slate-900">Confirm Live Order</h3>
            <p className="mt-1 text-sm font-medium text-slate-500 mb-5">This will place a real order in your Zerodha account.</p>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Symbol</span>
                <span className="text-sm font-bold text-slate-900">{pendingConfirm.payload?.tradingsymbol ?? form.tradingsymbol}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Side</span>
                <span className={`text-sm font-bold ${pendingConfirm.transaction_type === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {pendingConfirm.transaction_type}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Quantity</span>
                <span className="text-sm font-bold text-slate-900 tabular-nums">{pendingConfirm.payload?.quantity ?? form.quantity}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-sm text-slate-500">Order Type</span>
                <span className="text-sm font-bold text-slate-900">{pendingConfirm.payload?.order_type ?? form.order_type}</span>
              </div>
              {!pendingConfirm.payload && form.order_type !== 'MARKET' && (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm text-slate-500">Price</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{form.price || form.trigger_price}</span>
                </div>
              )}
              {!pendingConfirm.payload && estimatedValue !== null && (
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <span className="text-sm text-slate-500">Est. Value</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setPendingConfirm(null)}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={placing}
                onClick={async () => {
                  const tt = pendingConfirm.transaction_type;
                  const payload = pendingConfirm.payload;
                  setPendingConfirm(null);
                  await submitOrder(tt, payload);
                }}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  pendingConfirm.transaction_type === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500' : 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500'
                }`}
              >
                Confirm {pendingConfirm.transaction_type}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full space-y-5">
        
        {/* Unified Header & Global Controls */}
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm font-display font-bold text-xl">
                S
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Stockhold</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Trading Dashboard</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className={`flex flex-col items-end px-4 py-2 rounded-xl border ${dayPnl >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">Day P&L</span>
                <span className="font-bold text-lg tabular-nums">
                  {dayPnl >= 0 ? '+' : ''}{dayPnl.toFixed(2)}
                </span>
              </div>

              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  onClick={() => switchMode('paper')}
                  className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
                    mode === 'paper' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Paper
                </button>
                <button
                  onClick={() => switchMode('live')}
                  className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-bold transition-all ${
                    mode === 'live' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {mode === 'live' && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span><span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span></span>}
                  Live
                </button>
              </div>
            </div>
          </div>
          
          {mode === 'live' && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span></span>
              Live mode — orders placed here use real money in your Zerodha account.
            </div>
          )}
        </header>

        {/* Risk Management */}
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm border-t-4 border-t-amber-400">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Risk Management</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Max Loss (₹)</label>
              <input
                type="number"
                placeholder="e.g. 5000"
                value={risk.maxLoss}
                onChange={(e) => updateRisk({ maxLoss: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Target (₹)</label>
              <input
                type="number"
                placeholder="e.g. 8000"
                value={risk.target}
                onChange={(e) => updateRisk({ target: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={risk.autoSquareOffEnabled}
                  onChange={(e) => updateRisk({ autoSquareOffEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-slate-700">Auto square-off on limit</span>
              </label>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Trailing SL Step (pts)</label>
              <input
                type="number"
                placeholder="e.g. 10"
                value={risk.trailPoints}
                onChange={(e) => updateRisk({ trailPoints: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center sm:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={risk.trailingSlEnabled}
                  onChange={(e) => updateRisk({ trailingSlEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold text-slate-700">
                  Trail stop by {risk.trailPoints || 'N'} pts every {risk.trailPoints || 'N'} pts gained
                </span>
              </label>
            </div>
          </div>
          {riskStatus && <p className="mt-3 text-sm font-bold text-amber-600">{riskStatus}</p>}
        </section>

        {/* Order Entry */}
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm border-t-4 border-t-blue-500">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Place Order</h2>

          {/* Form Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Exchange</label>
              <select
                value={form.exchange}
                onChange={(e) => setForm({ ...form, exchange: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {EXCHANGES.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
              </select>
            </div>

            {form.exchange === 'NFO' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Index</label>
                  <select
                    value={nfoIndex}
                    onChange={(e) => setNfoIndex(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {NFO_INDEXES.map((idx) => <option key={idx} value={idx}>{idx}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Expiry Date</label>
                  <select
                    value={nfoExpiry}
                    onChange={(e) => setNfoExpiry(e.target.value)}
                    disabled={!nfoExpiries.length}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {!nfoExpiries.length && <option value="">Loading…</option>}
                    {nfoExpiries.map((exp) => <option key={exp} value={exp}>{exp}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Call Strike</label>
                  <select
                    value={nfoCallStrike}
                    onChange={(e) => setNfoCallStrike(e.target.value)}
                    disabled={nfoStrikesLoading || !nfoStrikes.length}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {(nfoStrikesLoading || !nfoStrikes.length) && <option value="">—</option>}
                    {nfoStrikes.map((s) => {
                      const tag = strikeMoneyness(s, 'call');
                      return <option key={s} value={s}>{s}{tag ? ` (${tag})` : ''}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Put Strike</label>
                  <select
                    value={nfoPutStrike}
                    onChange={(e) => setNfoPutStrike(e.target.value)}
                    disabled={nfoStrikesLoading || !nfoStrikes.length}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {(nfoStrikesLoading || !nfoStrikes.length) && <option value="">—</option>}
                    {nfoStrikes.map((s) => {
                      const tag = strikeMoneyness(s, 'put');
                      return <option key={s} value={s}>{s}{tag ? ` (${tag})` : ''}</option>;
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Qty (Lots)</label>
                  <input
                    type="number"
                    min={1}
                    value={nfoLots}
                    onChange={(e) => setNfoLots(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Product</label>
                  <select
                    value={form.product}
                    onChange={(e) => setForm({ ...form, product: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex items-center md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none mt-4">
                    <input
                      type="checkbox"
                      checked={oneClickEnabled}
                      onChange={(e) => setOneClickEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-semibold text-slate-700">
                      One Click Trade: <strong className={oneClickEnabled ? 'text-emerald-600' : 'text-slate-400'}>{oneClickEnabled ? 'Enabled' : 'Disabled'}</strong>
                    </span>
                  </label>
                </div>
              </>
            )}

            {form.exchange !== 'NFO' && (
              <>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Trading Symbol</label>
                  <div ref={symbolBoxRef} className="relative">
                    <input
                      type="text"
                      value={symbolQuery}
                      onChange={(e) => {
                        setSymbolQuery(e.target.value.toUpperCase());
                        setSymbolDropdownOpen(true);
                      }}
                      onFocus={() => setSymbolDropdownOpen(true)}
                      placeholder="Search e.g. RELIANCE, TCS..."
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      autoComplete="off"
                    />
                    {symbolDropdownOpen && symbolQuery.trim() && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {symbolSearching && <div className="p-3 text-sm text-slate-500">Searching...</div>}
                        {!symbolSearching && symbolError && <div className="p-3 text-sm font-semibold text-rose-600">{symbolError}</div>}
                        {!symbolSearching && !symbolError && symbolResults.length === 0 && <div className="p-3 text-sm text-slate-500">No matches</div>}
                        {!symbolSearching && !symbolError && symbolResults.map((r) => (
                          <div
                            key={r.instrument_token}
                            onClick={() => selectSymbol(r)}
                            onMouseDown={(e) => e.preventDefault()}
                            className="cursor-pointer border-b border-slate-100 p-3 hover:bg-slate-50"
                          >
                            <span className="font-bold text-slate-900">{r.tradingsymbol}</span>
                            <span className="ml-2 text-xs text-slate-400">
                              {r.exchange}
                              {r.expiry ? ` · exp ${r.expiry}` : ''}
                              {r.strike ? ` · ${r.strike}` : ''}
                              {r.lot_size ? ` · lot ${r.lot_size}` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {form.tradingsymbol && (
                    <div className="mt-1 flex gap-3 text-xs font-semibold text-slate-500">
                      <span>LTP: <strong className="text-slate-900 tabular-nums">{ltpPreview ? ltpPreview.toFixed(2) : '...'}</strong></span>
                      {form.lot_size && <span>Lot size: {form.lot_size}</span>}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Quantity</label>
                  <input
                    type="number"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {form.lot_size ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {[1, 2, 5, 10].map((n) => {
                        const active = Number(form.quantity) === form.lot_size * n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setLots(n)}
                            className={`rounded-md border px-2 py-0.5 text-xs font-bold transition-colors ${
                              active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {n} lot{n > 1 ? 's' : ''}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[10px] font-semibold text-slate-400">Pick symbol for lot shortcuts</div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Product</label>
                  <select
                    value={form.product}
                    onChange={(e) => setForm({ ...form, product: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    {PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Order Type</label>
                  <div className="flex gap-2">
                    {ORDER_TYPES.map((t) => {
                      const active = form.order_type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm({ ...form, order_type: t })}
                          className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold transition-all ${
                            active ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {['LIMIT', 'SL'].includes(form.order_type) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Price</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={form.price}
                        onChange={(e) => setForm({ ...form, price: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      {ltpPreview && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, price: String(ltpPreview) })}
                          className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          Use LTP
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {['SL', 'SL-M'].includes(form.order_type) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Trigger Price</label>
                    <input
                      type="number"
                      value={form.trigger_price}
                      onChange={(e) => setForm({ ...form, trigger_price: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* NFO Quick Trade Dashboard */}
          {form.exchange === 'NFO' ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
              {nfoError && <p className="mb-3 text-sm font-bold text-rose-600">{nfoError}</p>}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                
                {/* Call Side */}
                <div className="flex flex-col items-start bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <div className="text-xl font-bold text-slate-900 tabular-nums">
                    {nfoCallStrike || '—'} <span className="text-sm font-bold text-emerald-600">CE</span>
                  </div>
                  <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">{nfoCallOption ? nfoCallOption.tradingsymbol : '—'}</div>
                  <div className="text-sm font-bold text-slate-600 mb-4">
                    LTP: <span className="text-lg text-slate-900 tabular-nums">{nfoCallLtp != null ? nfoCallLtp.toFixed(2) : '—'}</span>
                  </div>
                  <div className="flex w-full gap-2">
                    <button
                      disabled={placing || !nfoCallOption}
                      onClick={() => placeQuickOrder('call', 'SELL')}
                      className="flex-1 rounded-lg bg-rose-100 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 disabled:opacity-50"
                    >
                      Sell Call
                    </button>
                    <button
                      disabled={placing || !nfoCallOption}
                      onClick={() => placeQuickOrder('call', 'BUY')}
                      className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-50"
                    >
                      Buy Call
                    </button>
                  </div>
                </div>

                {/* Center Spot */}
                <div className="flex flex-col items-center text-center">
                  <div className="text-base font-bold uppercase tracking-widest text-slate-500 mb-1">{nfoIndex}</div>
                  <div className="text-3xl font-black text-slate-900 tabular-nums">
                    {spotQuote ? spotQuote.ltp.toFixed(2) : '—'}
                  </div>
                  {spotQuote && spotQuote.change !== null && (
                    <div className={`text-sm font-bold mt-1 ${spotQuote.change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {spotQuote.change >= 0 ? '▲' : '▼'} {spotQuote.change.toFixed(2)} 
                      {spotQuote.changePercent !== null ? ` (${spotQuote.changePercent >= 0 ? '+' : ''}${spotQuote.changePercent.toFixed(2)}%)` : ''}
                    </div>
                  )}
                  <div className="mt-4 flex gap-2 justify-center w-full">
                    <button
                      onClick={() => squareOffAll('Close All Positions requested.')}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100"
                    >
                      Close All
                    </button>
                    <button
                      onClick={cancelAllOrders}
                      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 shadow-sm transition-colors hover:bg-amber-100"
                    >
                      Cancel Orders
                    </button>
                  </div>
                </div>

                {/* Put Side */}
                <div className="flex flex-col items-end bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <div className="text-xl font-bold text-slate-900 tabular-nums">
                    <span className="text-sm font-bold text-rose-600">PE</span> {nfoPutStrike || '—'}
                  </div>
                  <div className="text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">{nfoPutOption ? nfoPutOption.tradingsymbol : '—'}</div>
                  <div className="text-sm font-bold text-slate-600 mb-4">
                    LTP: <span className="text-lg text-slate-900 tabular-nums">{nfoPutLtp != null ? nfoPutLtp.toFixed(2) : '—'}</span>
                  </div>
                  <div className="flex w-full gap-2">
                    <button
                      disabled={placing || !nfoPutOption}
                      onClick={() => placeQuickOrder('put', 'BUY')}
                      className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-50"
                    >
                      Buy Put
                    </button>
                    <button
                      disabled={placing || !nfoPutOption}
                      onClick={() => placeQuickOrder('put', 'SELL')}
                      className="flex-1 rounded-lg bg-rose-100 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-1 disabled:opacity-50"
                    >
                      Sell Put
                    </button>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-center text-xs font-bold text-slate-400">
                Quick orders place at MARKET, {nfoLots} lot{nfoLots > 1 ? 's' : ''} × lot size, product {form.product}
                {oneClickEnabled ? ' — 1-click active (no confirmation).' : ' — confirmation required for live.'}
              </p>
            </div>
          ) : (
            // Non-NFO Order Buttons
            <div className="mt-5">
              {estimatedValue !== null && (
                <div className="mb-3 text-sm font-bold text-slate-600">
                  Est. Order Value: <span className="text-slate-900">₹{estimatedValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button 
                  disabled={placing || !!orderError} 
                  onClick={() => handlePlaceOrder('BUY')} 
                  className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {mode === 'paper' ? 'BUY (Paper)' : 'BUY'}
                </button>
                <button 
                  disabled={placing || !!orderError} 
                  onClick={() => handlePlaceOrder('SELL')} 
                  className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {mode === 'paper' ? 'SELL (Paper)' : 'SELL'}
                </button>
              </div>
              {orderError && !placing && <p className="mt-2 text-xs font-bold text-slate-400">{orderError}</p>}
            </div>
          )}
        </section>

        {/* Positions Table */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Net Positions</h2>
            {livePositions.length > 0 && (
              <button
                onClick={() => squareOffAll('Manual square-off requested.')}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 shadow-sm transition-colors hover:bg-rose-50 focus:outline-none"
              >
                Square Off All
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm font-sans">
              <thead className="bg-white border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Symbol</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Qty</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Avg</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">LTP</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Trail Stop</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">P&L</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Product</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {livePositions.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center font-medium text-slate-400">No open positions</td></tr>
                ) : (
                  livePositions.map((p) => {
                    const stop = trailingStops[posKey(p)];
                    return (
                      <tr key={posKey(p)} className="transition-colors hover:bg-slate-50">
                        <td className="px-5 py-3.5 font-bold text-slate-900">{p.tradingsymbol}</td>
                        <td className="px-5 py-3.5 font-semibold text-slate-700">{p.quantity}</td>
                        <td className="px-5 py-3.5 font-semibold text-slate-700">{p.average_price?.toFixed(2)}</td>
                        <td className="px-5 py-3.5 font-semibold text-slate-700">{p.ltp?.toFixed(2)}</td>
                        <td className="px-5 py-3.5 font-bold text-amber-600">{stop ? stop.stopPrice.toFixed(2) : '-'}</td>
                        <td className={`px-5 py-3.5 font-bold ${p.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {p.pnl >= 0 ? '+' : ''}{p.pnl?.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-slate-500">{p.product}</td>
                        <td className="px-5 py-3.5 text-right">
                          <button 
                            onClick={() => squareOffPosition(p).then(() => { refreshOrders(); refreshPositions(); })} 
                            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm transition-colors hover:bg-slate-100 focus:outline-none"
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Order Book Tables (Open & History) */}
        <div className="grid gap-6 lg:grid-cols-2">
          
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-800">Open Orders</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-collapse text-left text-sm font-sans">
                <thead className="bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Symbol</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Qty</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Price/Trg</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {openOrders.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center font-medium text-slate-400">No open orders</td></tr>
                  ) : (
                    openOrders.map((o) => (
                      <tr key={o.order_id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-900">{o.tradingsymbol}</td>
                        <td className={`px-4 py-3 font-bold ${o.transaction_type === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {o.transaction_type}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {editingOrderId === o.order_id ? (
                            <input
                              type="number"
                              value={editValues.quantity}
                              onChange={(e) => setEditValues({ ...editValues, quantity: e.target.value })}
                              className="w-16 rounded border border-slate-300 px-2 py-1 text-sm outline-none"
                            />
                          ) : o.quantity}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {editingOrderId === o.order_id ? (
                            <input
                              type="number"
                              value={editValues.price}
                              onChange={(e) => setEditValues({ ...editValues, price: e.target.value })}
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-sm outline-none"
                            />
                          ) : (
                            <>{o.price || o.trigger_price}</>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {editingOrderId === o.order_id ? (
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => submitModify(o)} className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">Save</button>
                              <button onClick={() => setEditingOrderId(null)} className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => startEdit(o)} className="rounded border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100">Modify</button>
                              <button onClick={() => cancelOrder(o)} className="rounded border border-rose-200 px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50">Cancel</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-800">Order History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] border-collapse text-left text-sm font-sans">
                <thead className="bg-white border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Symbol</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Type</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Qty / Price</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {otherOrders.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center font-medium text-slate-400">No completed orders yet</td></tr>
                  ) : (
                    otherOrders.map((o) => (
                      <tr key={o.order_id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{o.tradingsymbol}</div>
                          <div className="text-[10px] font-bold text-slate-400">{o.order_timestamp}</div>
                        </td>
                        <td className={`px-4 py-3 font-bold ${o.transaction_type === 'BUY' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {o.transaction_type}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {o.filled_quantity ?? o.quantity} @ {o.average_price || o.price || '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                           <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                             o.status === 'COMPLETE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
                             ['CANCELLED', 'REJECTED'].includes(o.status) ? 'bg-rose-50 text-rose-700 border border-rose-200' : 
                             'bg-amber-50 text-amber-700 border border-amber-200'
                           }`}>
                             {o.status}
                           </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}