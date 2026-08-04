"use client";
import { useEffect, useState, useRef, useCallback } from "react";

export default function CPRScannerPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [tickPulse, setTickPulse] = useState(0);

  // New Feature States
  const [strikeRange, setStrikeRange] = useState("5"); // Show ±10 strikes from ATM by default
  const [audioEnabled, setAudioEnabled] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  });

  const prevTouchesRef = useRef({});
  const isFirstLoadRef = useRef(true);
  const lastLtpRef = useRef({});
  const dateInputRef = useRef(null);

  // Simple Web Audio API beep for alerts
  const playAlertSound = useCallback(() => {
    if (!audioEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime); // Low volume
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error("Audio play failed:", e);
    }
  }, [audioEnabled]);

  const checkForNewTouches = useCallback((json) => {
    const spotKey = "spot";
    const spotTouches = json.spotData?.touches || [];
    const prevSpotLen = prevTouchesRef.current[spotKey] || 0;
    prevTouchesRef.current[spotKey] = spotTouches.length;

    (json.rows || []).forEach((row) => {
      ["CE", "PE"].forEach((side) => {
        const key = `${row.strike}-${side}`;
        const touches = row[side]?.touches || [];
        prevTouchesRef.current[key] = touches.length;
      });
    });

    isFirstLoadRef.current = false;
  }, []);

  const fetchScannerData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        const params = new URLSearchParams();
        params.append("index", selectedIndex);
        if (selectedExpiry) params.append("expiry", selectedExpiry);
        if (selectedDate) params.append("date", selectedDate);
        params.append("_t", Date.now());

        const res = await fetch(`/api/selling-scanner?${params.toString()}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });

        if (!res.ok) throw new Error("Kite data not connected or failed to fetch");
        const json = await res.json();

        checkForNewTouches(json);
        setData(json);

        if (!selectedExpiry && json.expiry) setSelectedExpiry(json.expiry);
        if (!isBackground) setError(null);
      } catch (err) {
        if (!isBackground) setError(err.message);
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [selectedIndex, selectedExpiry, selectedDate, checkForNewTouches]
  );

  useEffect(() => {
    prevTouchesRef.current = {};
    isFirstLoadRef.current = true;
    lastLtpRef.current = {};

    fetchScannerData(false);

    const interval = setInterval(() => fetchScannerData(true), 10000);
    return () => clearInterval(interval);
  }, [fetchScannerData]);

  useEffect(() => {
    if (!data || !data.credentials) return;

    const { apiKey, accessToken } = data.credentials;
    if (!apiKey) {
      setWsStatus("fallback");
      return;
    }

    const istTodayStr = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    if (selectedDate !== istTodayStr) {
      setWsStatus("disconnected");
      return;
    }

    setWsStatus("connecting");
    const wsUrl = `wss://ws.kite.trade/?api_key=${apiKey}&access_token=${accessToken}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      setWsStatus("connected");
      const tokens = [];
      if (data.spotData?.token) tokens.push(Number(data.spotData.token));
      data.rows?.forEach((r) => {
        if (r.CE?.token) tokens.push(Number(r.CE.token));
        if (r.PE?.token) tokens.push(Number(r.PE.token));
      });

      if (tokens.length > 0) {
        ws.send(JSON.stringify({ a: "mode", v: ["ltp", tokens] }));
        ws.send(JSON.stringify({ a: "subscribe", v: tokens }));
      }
    };

    ws.onmessage = (e) => {
      if (!(e.data instanceof ArrayBuffer)) return;
      const buffer = new DataView(e.data);
      if (buffer.byteLength < 2) return;

      const numPackets = buffer.getInt16(0);
      let offset = 2;
      const newTicks = {};

      for (let i = 0; i < numPackets; i++) {
        if (offset + 2 > buffer.byteLength) break;
        const packetLength = buffer.getInt16(offset);
        offset += 2;
        if (packetLength === 8 && offset + 8 <= buffer.byteLength) {
          const token = buffer.getInt32(offset);
          const ltp = buffer.getInt32(offset + 4) / 100;
          newTicks[token] = ltp;
        }
        offset += packetLength;
      }

      if (Object.keys(newTicks).length > 0) {
        setTickPulse((p) => (p >= 99 ? 1 : p + 1));
        let newlyTouched = false;

        setData((prevData) => {
          if (!prevData) return prevData;
          let hasChanges = false;

          const processItem = (item) => {
            if (!item || !item.token || newTicks[item.token] === undefined) return item;

            const newLtp = newTicks[item.token];
            const prevLtp = lastLtpRef.current[item.token];
            let newTouches = item.touches ? [...item.touches] : [];
            let itemUpdated = false;
            
            // Determine Tick Direction (Green for Up, Red for Down)
            let tickDirection = item.tickDirection || "default";
            if (prevLtp !== undefined) {
              if (newLtp > prevLtp) tickDirection = "up";
              else if (newLtp < prevLtp) tickDirection = "down";
            }

            if (item.cpr && prevLtp !== undefined && prevLtp !== newLtp) {
              const tStr = new Date().toLocaleTimeString("en-GB", {
                timeZone: "Asia/Kolkata",
                hour: "2-digit",
                minute: "2-digit",
              });

              const checkCross = (levelName, val) => {
                if (
                  (prevLtp < val && newLtp >= val) ||
                  (prevLtp > val && newLtp <= val)
                ) {
                  if (!newTouches.find((t) => t.level === levelName && t.time === tStr)) {
                    newTouches.push({ level: levelName, time: tStr });
                    itemUpdated = true;
                    newlyTouched = true;
                  }
                }
              };

              checkCross("Top", item.cpr.TC);
              checkCross("Pivot", item.cpr.Pivot);
              checkCross("Bottom", item.cpr.BC);
            }

            lastLtpRef.current[item.token] = newLtp;

            if (item.ltp !== newLtp || itemUpdated || item.tickDirection !== tickDirection) {
              return { ...item, ltp: newLtp, touches: newTouches, tickDirection };
            }
            return item;
          };

          const nextSpotData = processItem(prevData.spotData);
          if (nextSpotData !== prevData.spotData) hasChanges = true;

          const nextRows = prevData.rows.map((row) => {
            const nextCE = processItem(row.CE);
            const nextPE = processItem(row.PE);
            if (nextCE !== row.CE || nextPE !== row.PE) {
              hasChanges = true;
              return { ...row, CE: nextCE, PE: nextPE };
            }
            return row;
          });

          if (hasChanges) {
            return {
              ...prevData,
              spotData: nextSpotData,
              spot: nextSpotData ? nextSpotData.ltp : prevData.spot,
              rows: nextRows,
            };
          }
          return prevData;
        });

        // Fire audio alert if a new touch occurred
        if (newlyTouched) {
          playAlertSound();
        }
      }
    };

    ws.onclose = () => setWsStatus("fallback");
    ws.onerror = () => setWsStatus("fallback");

    return () => ws.close();
  }, [data?.credentials?.accessToken, selectedDate, playAlertSound]);

  const handleIndexChange = (e) => {
    setData(null);
    setSelectedIndex(e.target.value);
    setSelectedExpiry("");
  };

  const handleDateChange = (e) => {
    setData(null);
    setSelectedDate(e.target.value);
  };

  const handleExpiryChange = (e) => {
    setData(null);
    setSelectedExpiry(e.target.value);
  };

  const openDatePicker = () => {
    if (dateInputRef.current?.showPicker) {
      dateInputRef.current.showPicker();
    } else {
      dateInputRef.current?.focus();
      dateInputRef.current?.click();
    }
  };

  // --- Analytical Widgets Computations ---
  
  const getCprWidthStatus = (cpr, spot) => {
    if (!cpr || !spot) return null;
    const width = Math.abs(cpr.TC - cpr.BC);
    const pct = (width / spot) * 100;
    
    if (pct < 0.15) return { label: "Narrow CPR", desc: "Trending Day", color: "from-emerald-500/10 to-white border-emerald-200 text-emerald-700" };
    if (pct > 0.40) return { label: "Wide CPR", desc: "Sideways Day", color: "from-rose-500/10 to-white border-rose-200 text-rose-700" };
    return { label: "Average CPR", desc: "Normal Volatility", color: "from-blue-500/10 to-white border-blue-200 text-blue-700" };
  };

  const getDailyBias = (cpr, spot) => {
    if (!cpr || !spot) return null;
    const top = Math.max(cpr.TC, cpr.BC);
    const bot = Math.min(cpr.TC, cpr.BC);
    if (spot > top) return { label: "Bullish", icon: "↑", color: "from-emerald-500/10 to-white border-emerald-200 text-emerald-700" };
    if (spot < bot) return { label: "Bearish", icon: "↓", color: "from-rose-500/10 to-white border-rose-200 text-rose-700" };
    return { label: "Sideways", icon: "↔", color: "from-amber-500/10 to-white border-amber-200 text-amber-700" };
  };

  const cprWidthStatus = getCprWidthStatus(data?.spotData?.cpr, data?.spot);
  const dailyBias = getDailyBias(data?.spotData?.cpr, data?.spot);

  // --- UI Components ---

  const TouchBadge = ({ touches }) => {
    if (!touches || touches.length === 0)
      return <span className="text-slate-300 text-sm font-medium">—</span>;
    return (
      <div className="flex flex-col gap-1.5 items-center justify-center">
        {touches.map((t, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between w-[120px] px-2 py-1 text-[11px] font-bold rounded shadow-sm border ${
              t.level === "Top"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : t.level === "Bottom"
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-blue-50 border-blue-200 text-blue-700"
            }`}
          >
            <span className="uppercase tracking-widest">{t.level}</span>
            <span className="font-mono text-slate-500 bg-white px-1 rounded shadow-sm">
              {t.time}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const CPRDisplay = ({ cpr }) => {
    if (!cpr) return <span className="text-slate-300">—</span>;
    return (
      <div className="flex items-center justify-center gap-2.5 text-[11px] font-mono bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm w-fit mx-auto">
        <div className="flex gap-1.5">
          <span className="text-slate-400 font-sans font-bold">TC</span>
          <span className="text-slate-700 font-semibold">{cpr.TC}</span>
        </div>
        <div className="w-[1px] h-3 bg-slate-200"></div>
        <div className="flex gap-1.5">
          <span className="text-blue-500 font-sans font-bold">P</span>
          <span className="text-blue-700 font-bold">{cpr.Pivot}</span>
        </div>
        <div className="w-[1px] h-3 bg-slate-200"></div>
        <div className="flex gap-1.5">
          <span className="text-slate-400 font-sans font-bold">BC</span>
          <span className="text-slate-700 font-semibold">{cpr.BC}</span>
        </div>
      </div>
    );
  };

  const getTcBcSumValue = (cpr) => {
    if (!cpr || cpr.TC === undefined || cpr.BC === undefined) return null;
    const sum = parseFloat(cpr.TC) - parseFloat(cpr.BC);
    return isNaN(sum) ? null : sum;
  };

  const renderTcBcBadge = (sum, colorMode) => {
    if (sum === null) return <span className="text-slate-300">—</span>;
    let styleClasses = "text-indigo-700 bg-indigo-50 border-indigo-200"; 
    if (colorMode === "green") styleClasses = "text-emerald-700 bg-emerald-50 border-emerald-200";
    else if (colorMode === "red") styleClasses = "text-rose-700 bg-rose-50 border-rose-200";

    return (
      <div className="flex items-center justify-center">
        <span className={`font-mono tabular-nums text-[11.5px] font-bold px-2.5 py-0.5 rounded border shadow-sm ${styleClasses}`}>
          {sum.toFixed(2)}
        </span>
      </div>
    );
  };

  const renderLTP = (ltp, tickDirection, isAtm, isCE) => {
    if (!ltp) return <span className="text-slate-400">—</span>;
    
    let textColor = "text-slate-700";
    if (isAtm) textColor = "text-amber-900";

    if (tickDirection === "up") textColor = "text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded shadow-sm";
    else if (tickDirection === "down") textColor = "text-rose-700 bg-rose-100 px-2 py-0.5 rounded shadow-sm";

    return <span className={`text-[15px] font-bold tabular-nums transition-colors ${textColor}`}>{ltp}</span>;
  };

  if (!data || loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] text-slate-800">
        <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <div className="w-10 h-10 border-4 border-slate-100 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 text-sm font-medium tracking-wide">
            Fetching scanner data...
          </p>
        </div>
      </div>
    );

  const atmStrike =
    data?.rows?.length > 0
      ? data.rows.reduce((prev, curr) =>
          Math.abs(curr.strike - data.spot) < Math.abs(prev.strike - data.spot)
            ? curr
            : prev
        ).strike
      : 0;

  // Apply Strike Range Filter
  let filteredRows = [];
  if (data?.rows) {
    if (strikeRange === "ALL") {
      filteredRows = data.rows;
    } else {
      const atmIndex = data.rows.findIndex((r) => r.strike === atmStrike);
      const range = parseInt(strikeRange, 10);
      const minIndex = Math.max(0, atmIndex - range);
      const maxIndex = Math.min(data.rows.length - 1, atmIndex + range);
      filteredRows = data.rows.slice(minIndex, maxIndex + 1);
    }
  }

  const tableItems = [];
  let spotAdded = false;

  filteredRows.forEach((row) => {
    if (!spotAdded && data.spot <= row.strike) {
      tableItems.push({ type: "SPOT", strike: data.spot });
      spotAdded = true;
    }
    tableItems.push({ type: "ROW", data: row });
  });
  if (!spotAdded && filteredRows.length > 0) tableItems.push({ type: "SPOT", strike: data.spot });

  return (
    <main className="min-h-screen w-full bg-[#f8f9fa] px-2 py-5 text-slate-800 sm:px-4 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        
        {/* Header Controls */}
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 shadow-sm">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl flex items-center gap-2">
                    Selling Scanner
                    <span className="text-[10px] font-bold text-white bg-slate-800 px-2 py-0.5 rounded uppercase tracking-wider">PRO</span>
                  </h1>
                  <p className="mt-0.5 text-sm font-medium text-slate-500">
                    Options CPR Touch Analysis and Tracking
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedIndex}
                onChange={handleIndexChange}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="NIFTY">NIFTY</option>
                <option value="BANKNIFTY">BANKNIFTY</option>
                <option value="SENSEX">SENSEX</option>
              </select>

              <div className="relative">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  onClick={openDatePicker}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                />
              </div>

              <select
                value={selectedExpiry || data?.expiry || ""}
                onChange={handleExpiryChange}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {data?.availableExpiries?.map((exp) => (
                  <option key={exp} value={exp}>{exp}</option>
                ))}
              </select>

              <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 shadow-sm">
                <span className="text-sm font-medium text-slate-500">Strikes:</span>
                <select
                  value={strikeRange}
                  onChange={(e) => setStrikeRange(e.target.value)}
                  className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer"
                >
                  <option value="5">± 5</option>
                  <option value="10">± 10</option>
                  <option value="20">± 20</option>
                  <option value="ALL">All</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cprWidthStatus && (
              <div className={`rounded-2xl border bg-gradient-to-br px-5 py-4 shadow-sm ${cprWidthStatus.color}`}>
                <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] opacity-80">CPR Width</div>
                <div className="mt-1 font-display text-lg font-bold">{cprWidthStatus.label}</div>
                <div className="mt-1 text-xs font-semibold opacity-80">{cprWidthStatus.desc}</div>
              </div>
            )}
            
            {dailyBias && (
              <div className={`rounded-2xl border bg-gradient-to-br px-5 py-4 shadow-sm ${dailyBias.color}`}>
                <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] opacity-80">Trend Bias</div>
                <div className="mt-1 flex items-center gap-2 font-display text-lg font-bold">
                  {dailyBias.icon} {dailyBias.label}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-500/10 to-white px-5 py-4 shadow-sm flex flex-col justify-center">
              <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">Live Status</div>
              <div className={`mt-1 flex items-center gap-2 font-display text-sm font-bold ${wsStatus === "fallback" ? "text-blue-600" : wsStatus === "disconnected" ? "text-slate-500" : "text-emerald-600"}`}>
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${wsStatus === "connected" ? "animate-ping bg-emerald-400" : wsStatus === "connecting" ? "animate-ping bg-amber-400" : wsStatus === "fallback" ? "animate-ping bg-blue-400" : "bg-slate-400"}`}></span>
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${wsStatus === "connected" ? "bg-emerald-500" : wsStatus === "connecting" ? "bg-amber-500" : wsStatus === "fallback" ? "bg-blue-500" : "bg-slate-500"}`}></span>
                </span>
                {wsStatus === "connected" ? `Streaming [${tickPulse}]` : wsStatus === "connecting" ? "Connecting..." : wsStatus === "fallback" ? "Auto-Sync Mode" : "Historical View"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-500/10 to-white px-5 py-4 shadow-sm flex flex-col justify-center items-start">
              <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500 mb-2">Audio Alerts</div>
              <button 
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors shadow-sm ${audioEnabled ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
              >
                {audioEnabled ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                )}
                {audioEnabled ? "Alerts On" : "Alerts Off"}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {error}
          </div>
        )}

        {/* Data Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto w-full">
            {!filteredRows || filteredRows.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <span className="font-medium text-slate-500">
                  {loading ? `Loading data...` : error ? `Could not load data.` : `No strikes match range for ${selectedIndex}.`}
                </span>
              </div>
            ) : (
              <table className="w-full min-w-[1200px] border-collapse text-center font-sans text-[13px]">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b border-slate-200 font-medium">
                    <th colSpan={4} className="border-r border-white bg-emerald-50 px-3 py-2.5 text-center text-[12px] font-bold uppercase tracking-wider text-emerald-800">
                      Call Data
                    </th>
                    <th className="bg-slate-100 px-3 py-2.5 border-l border-r border-slate-200 text-center text-[12px] font-bold uppercase tracking-wider text-slate-700">
                      Center
                    </th>
                    <th colSpan={4} className="bg-rose-50 px-3 py-2.5 text-center text-[12px] font-bold uppercase tracking-wider text-rose-800">
                      Put Data
                    </th>
                  </tr>
                  <tr className="border-b border-slate-200 bg-white text-xs font-semibold tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 border-r border-slate-100">Yesterday CPR</th>
                    <th className="px-3 py-2.5 border-r border-slate-100">TC+BC</th>
                    <th className="px-3 py-2.5 border-r border-slate-100 text-slate-800">LTP</th>
                    <th className="px-3 py-2.5 text-emerald-700">CE Touches</th>
                    
                    <th className="border-l border-r border-slate-200 bg-slate-50/50 px-3 py-2.5 text-slate-800">Strike / Spot</th>
                    
                    <th className="px-3 py-2.5 border-r border-slate-100 text-rose-700">PE Touches</th>
                    <th className="px-3 py-2.5 border-r border-slate-100 text-slate-800">LTP</th>
                    <th className="px-3 py-2.5 border-r border-slate-100">TC+BC</th>
                    <th className="px-3 py-2.5">Yesterday CPR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableItems.map((item, index) => {
                    if (item.type === "SPOT") {
                      const spotSum = getTcBcSumValue(data.spotData?.cpr);
                      return (
                        <tr key={`spot-${index}`} className="bg-blue-50/60 shadow-sm border-b-2 border-t-2 border-blue-200 relative z-20 transition-colors">
                          <td className="px-3 py-3 border-r border-blue-100"><CPRDisplay cpr={data.spotData?.cpr} /></td>
                          <td className="px-3 py-3 border-r border-blue-100">{renderTcBcBadge(spotSum, "default")}</td>
                          <td className="px-3 py-3 border-r border-blue-100">
                            {renderLTP(data.spotData?.ltp || data.spot, data.spotData?.tickDirection, false, true)}
                          </td>
                          <td className="px-3 py-3 bg-blue-100/30 border-r border-blue-200"><TouchBadge touches={data.spotData?.touches} /></td>
                          
                          <td className="px-3 py-3 relative border-x border-blue-300 bg-blue-100/50">
                            <div className="mx-auto w-32 py-1.5 rounded-lg flex flex-col items-center justify-center font-bold text-base tracking-tight bg-blue-600 text-white shadow-md relative">
                              <span className="absolute -top-2.5 text-[9px] uppercase tracking-widest font-black bg-blue-900 text-blue-100 px-2 py-0.5 rounded shadow-sm border border-blue-700">{selectedIndex} SPOT</span>
                              {data.spot}
                            </div>
                          </td>
                          
                          <td className="px-3 py-3 bg-blue-100/30 border-r border-blue-100"><TouchBadge touches={data.spotData?.touches} /></td>
                          <td className="px-3 py-3 border-r border-blue-100">
                            {renderLTP(data.spotData?.ltp || data.spot, data.spotData?.tickDirection, false, false)}
                          </td>
                          <td className="px-3 py-3 border-r border-blue-100">{renderTcBcBadge(spotSum, "default")}</td>
                          <td className="px-3 py-3"><CPRDisplay cpr={data.spotData?.cpr} /></td>
                        </tr>
                      );
                    }

                    const row = item.data;
                    const isAtm = row.strike === atmStrike;
                    const ceSum = getTcBcSumValue(row.CE?.cpr);
                    const peSum = getTcBcSumValue(row.PE?.cpr);

                    let ceColor = "default";
                    let peColor = "default";
                    if (ceSum !== null && peSum !== null) {
                      if (ceSum > peSum) { ceColor = "green"; peColor = "red"; } 
                      else if (peSum > ceSum) { peColor = "green"; ceColor = "red"; }
                    }

                    return (
                      <tr key={row.strike} className={`transition-colors hover:bg-slate-50 ${isAtm ? "bg-amber-50/50 relative z-10" : "bg-white"}`}>
                        <td className={`px-3 py-3 border-r border-slate-100 ${isAtm ? "border-amber-200" : ""}`}><CPRDisplay cpr={row.CE?.cpr} /></td>
                        <td className={`px-3 py-3 border-r border-slate-100 ${isAtm ? "border-amber-200" : ""}`}>{renderTcBcBadge(ceSum, ceColor)}</td>
                        <td className={`px-3 py-3 border-r border-slate-100 ${isAtm ? "border-amber-200" : ""}`}>
                          {renderLTP(row.CE?.ltp, row.CE?.tickDirection, isAtm, true)}
                        </td>
                        <td className={`px-3 py-3 border-r border-slate-200 ${isAtm ? "bg-amber-100/30 border-amber-300" : "bg-emerald-50/20"}`}><TouchBadge touches={row.CE?.touches} /></td>
                        
                        <td className={`px-3 py-3 relative border-x border-slate-200 ${isAtm ? "bg-amber-100/50 border-amber-300" : ""}`}>
                          <div className={`mx-auto w-24 py-1.5 rounded-lg flex flex-col items-center justify-center font-bold text-base tracking-tight transition-all ${isAtm ? "bg-amber-400 text-amber-950 shadow-md ring-2 ring-amber-200 ring-offset-1" : "bg-slate-100 text-slate-800 border border-slate-200"}`}>
                            {isAtm && <span className="absolute -top-2 text-[9px] uppercase tracking-widest font-black bg-amber-900 text-amber-100 px-2 py-0.5 rounded shadow-sm border border-amber-700">ATM</span>}
                            {row.strike}
                          </div>
                        </td>
                        
                        <td className={`px-3 py-3 border-r border-slate-100 ${isAtm ? "bg-amber-100/30 border-amber-200" : "bg-rose-50/20"}`}><TouchBadge touches={row.PE?.touches} /></td>
                        <td className={`px-3 py-3 border-r border-slate-100 ${isAtm ? "border-amber-200" : ""}`}>
                          {renderLTP(row.PE?.ltp, row.PE?.tickDirection, isAtm, false)}
                        </td>
                        <td className={`px-3 py-3 border-r border-slate-100 ${isAtm ? "border-amber-200" : ""}`}>{renderTcBcBadge(peSum, peColor)}</td>
                        <td className={`px-3 py-3 ${isAtm ? "border-amber-200" : ""}`}><CPRDisplay cpr={row.PE?.cpr} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}