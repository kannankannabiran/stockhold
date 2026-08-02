"use client";
import { useEffect, useState, useRef, useCallback } from "react";

export default function CPRScannerPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wsStatus, setWsStatus] = useState("disconnected");
  const [tickPulse, setTickPulse] = useState(0);

  // New Feature States
  const [strikeRange, setStrikeRange] = useState("10"); // Show ±10 strikes from ATM by default
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
    
    if (pct < 0.15) return { label: "NARROW CPR", desc: "Trending Day", color: "bg-green-100 text-green-800 border-green-300" };
    if (pct > 0.40) return { label: "WIDE CPR", desc: "Sideways Day", color: "bg-red-100 text-red-800 border-red-300" };
    return { label: "AVERAGE CPR", desc: "Normal Vol.", color: "bg-blue-100 text-blue-800 border-blue-300" };
  };

  const getDailyBias = (cpr, spot) => {
    if (!cpr || !spot) return null;
    const top = Math.max(cpr.TC, cpr.BC);
    const bot = Math.min(cpr.TC, cpr.BC);
    if (spot > top) return { label: "BULLISH", icon: "↑", color: "text-green-700 bg-green-100 border-green-300" };
    if (spot < bot) return { label: "BEARISH", icon: "↓", color: "text-red-700 bg-red-100 border-red-300" };
    return { label: "SIDEWAYS", icon: "↔", color: "text-yellow-700 bg-yellow-100 border-yellow-300" };
  };

  const cprWidthStatus = getCprWidthStatus(data?.spotData?.cpr, data?.spot);
  const dailyBias = getDailyBias(data?.spotData?.cpr, data?.spot);

  // --- UI Components ---

  const TouchBadge = ({ touches }) => {
    if (!touches || touches.length === 0)
      return <span className="text-gray-300 text-sm font-medium">—</span>;
    return (
      <div className="flex flex-col gap-1.5 items-center justify-center">
        {touches.map((t, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between w-[120px] px-2 py-1 text-[11px] font-bold rounded-md border ${
              t.level === "Top"
                ? "bg-green-50 border-green-200 text-green-700 shadow-sm"
                : t.level === "Bottom"
                ? "bg-red-50 border-red-200 text-red-700 shadow-sm"
                : "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
            }`}
          >
            <span className="uppercase tracking-widest">{t.level}</span>
            <span className="font-mono text-gray-500 bg-white/60 px-1 rounded">
              {t.time}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const CPRDisplay = ({ cpr }) => {
    if (!cpr) return <span className="text-gray-300">—</span>;
    return (
      <div className="flex items-center justify-center gap-3 text-[11px] font-mono bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 shadow-inner w-fit mx-auto">
        <div className="flex gap-1.5">
          <span className="text-gray-400 font-sans font-bold">TC</span>
          <span className="text-gray-700 font-semibold">{cpr.TC}</span>
        </div>
        <div className="w-[1px] h-3 bg-gray-300"></div>
        <div className="flex gap-1.5">
          <span className="text-blue-500 font-sans font-bold">P</span>
          <span className="text-blue-700 font-bold">{cpr.Pivot}</span>
        </div>
        <div className="w-[1px] h-3 bg-gray-300"></div>
        <div className="flex gap-1.5">
          <span className="text-gray-400 font-sans font-bold">BC</span>
          <span className="text-gray-700 font-semibold">{cpr.BC}</span>
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
    if (sum === null) return <span className="text-gray-300">—</span>;
    let styleClasses = "text-indigo-700 bg-indigo-50 border-indigo-200"; 
    if (colorMode === "green") styleClasses = "text-green-700 bg-green-50 border-green-200";
    else if (colorMode === "red") styleClasses = "text-red-700 bg-red-50 border-red-200";

    return (
      <div className="flex items-center justify-center">
        <span className={`font-mono text-[11.5px] font-bold px-2.5 py-1 rounded-md border shadow-sm ${styleClasses}`}>
          {sum.toFixed(2)}
        </span>
      </div>
    );
  };

  // Helper to format LTP color based on tick direction
  const renderLTP = (ltp, tickDirection, isAtm, isCE) => {
    if (!ltp) return <span className="text-gray-400">—</span>;
    
    // Base colors
    let textColor = isCE ? "text-gray-600" : "text-gray-600";
    if (isAtm) textColor = isCE ? "text-green-700" : "text-red-700";

    // Tick flashing override
    if (tickDirection === "up") textColor = "text-green-600 bg-green-100 px-2 py-0.5 rounded";
    else if (tickDirection === "down") textColor = "text-red-600 bg-red-100 px-2 py-0.5 rounded";

    return <span className={`text-[17px] font-black transition-colors ${textColor}`}>{ltp}</span>;
  };

  if (!data || loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <div className="w-10 h-10 border-4 border-gray-100 border-t-yellow-400 rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm font-semibold tracking-wide">
            Fetching market data...
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
    // Changed padding slightly and removed max-w restriction to allow full 100% width
    <div className="min-h-screen bg-slate-50 text-slate-900 p-2 sm:p-4 lg:p-6 font-sans selection:bg-yellow-200">
      <div className="w-full">
        {/* Top Control Panel */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 md:p-5 mb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 shadow-sm relative overflow-hidden">
          
          {/* Title and Base Controls */}
          <div className="flex items-center gap-5 z-10 flex-wrap">
            <div className="h-12 w-12 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-xl flex items-center justify-center text-yellow-950 shadow-inner flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-800 tracking-tight">
                Selling Scanner <span className="text-xs font-bold text-white bg-gray-800 px-2.5 py-0.5 rounded ml-1">PRO</span>
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-sm font-medium">
                <select
                  value={selectedIndex}
                  onChange={handleIndexChange}
                  className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 outline-none focus:ring-2 focus:ring-yellow-400 text-xs uppercase cursor-pointer transition-all hover:bg-blue-100 shadow-sm"
                >
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                </select>

                <span className="text-gray-300">|</span>

                <span className="text-gray-500 flex items-center gap-1.5">
                  <div
                    className="relative flex items-center justify-between gap-2 font-mono text-gray-900 bg-gray-50 px-3 py-1 rounded-md border border-gray-200 outline-none focus-within:ring-2 focus-within:ring-yellow-400 text-xs font-bold cursor-pointer hover:bg-gray-100 shadow-sm"
                    onClick={openDatePicker}
                  >
                    <span className="pointer-events-none font-mono">{selectedDate}</span>
                    {/* CALENDAR ICON ADDED HERE */}
                    <svg className="w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <input
                      ref={dateInputRef}
                      type="date"
                      value={selectedDate}
                      onChange={handleDateChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </span>

                <span className="text-gray-300">|</span>

                <span className="text-gray-500 flex items-center gap-1.5 text-xs font-bold">
                  Exp
                  <select
                    value={selectedExpiry || data?.expiry || ""}
                    onChange={handleExpiryChange}
                    className="font-mono text-gray-900 bg-gray-50 px-2 py-1 rounded-md border border-gray-200 outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer hover:bg-gray-100 shadow-sm"
                  >
                    {data?.availableExpiries?.map((exp) => (
                      <option key={exp} value={exp}>{exp}</option>
                    ))}
                  </select>
                </span>
                
                <span className="text-gray-300">|</span>

                <span className="text-gray-500 flex items-center gap-1.5 text-xs font-bold">
                  Strikes
                  <select
                    value={strikeRange}
                    onChange={(e) => setStrikeRange(e.target.value)}
                    className="font-mono text-gray-900 bg-gray-50 px-2 py-1 rounded-md border border-gray-200 outline-none focus:ring-2 focus:ring-yellow-400 cursor-pointer hover:bg-gray-100 shadow-sm"
                  >
                    <option value="5">± 5</option>
                    <option value="10">± 10</option>
                    <option value="20">± 20</option>
                    <option value="ALL">All</option>
                  </select>
                </span>
              </div>
            </div>
          </div>

          {/* Analytical Dashboards & Audio */}
          <div className="flex flex-wrap items-center gap-4 z-10 w-full lg:w-auto mt-2 lg:mt-0">
            {/* CPR Width Widget */}
            {cprWidthStatus && (
              <div className={`flex flex-col px-3 py-1.5 rounded-lg border shadow-sm ${cprWidthStatus.color}`}>
                <span className="text-[10px] font-black tracking-widest uppercase opacity-80">{cprWidthStatus.label}</span>
                <span className="text-xs font-bold">{cprWidthStatus.desc}</span>
              </div>
            )}

            {/* Daily Bias Widget */}
            {dailyBias && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm ${dailyBias.color}`}>
                <span className="text-lg font-black">{dailyBias.icon}</span>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black tracking-widest uppercase opacity-80">Trend Bias</span>
                  <span className="text-xs font-bold">{dailyBias.label}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col items-end gap-2 ml-auto">
              <div className={`flex items-center gap-2 text-xs font-bold tracking-widest uppercase ${wsStatus === "fallback" ? "text-blue-600" : wsStatus === "disconnected" ? "text-gray-500" : "text-green-600"}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${wsStatus === "connected" ? "animate-ping bg-green-400" : wsStatus === "connecting" ? "animate-ping bg-yellow-400" : wsStatus === "fallback" ? "animate-ping bg-blue-400" : "bg-gray-400"}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${wsStatus === "connected" ? "bg-green-500" : wsStatus === "connecting" ? "bg-yellow-500" : wsStatus === "fallback" ? "bg-blue-500" : "bg-gray-500"}`}></span>
                </span>
                {wsStatus === "connected" ? `Live Stream [${tickPulse}]` : wsStatus === "connecting" ? "Connecting..." : wsStatus === "fallback" ? "10s Auto-Sync" : "Historical View"}
              </div>
              
              <button 
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded border transition-colors ${audioEnabled ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}
              >
                {audioEnabled ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                )}
                {audioEnabled ? "Alerts On" : "Alerts Off"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm text-sm font-medium w-fit">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Table Container - fully responsive width */}
        <div className="w-full overflow-x-auto pb-10">
          {!filteredRows || filteredRows.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 font-semibold flex flex-col items-center gap-3 shadow-sm">
              <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-base text-gray-800 font-bold">
                {loading ? `Loading data...` : error ? `Could not load data.` : `No strikes match range for ${selectedIndex}.`}
              </p>
            </div>
          ) : (
            <table className="w-full text-center border-separate" style={{ borderSpacing: "0 8px" }}>
              <thead>
                <tr className="text-xs uppercase tracking-widest font-extrabold text-gray-500">
                  <th className="pb-2 w-[15%]">Yesterday CPR</th>
                  <th className="pb-2 w-[8%] text-gray-700">TC+BC</th>
                  <th className="pb-2 w-[9%] text-gray-800">LTP</th>
                  <th className="pb-2 w-[13%] text-green-600">CE Touches</th>
                  <th className="pb-2 w-[10%] text-gray-400">Strike / Spot</th>
                  <th className="pb-2 w-[13%] text-red-600">PE Touches</th>
                  <th className="pb-2 w-[9%] text-gray-800">LTP</th>
                  <th className="pb-2 w-[8%] text-gray-700">TC+BC</th>
                  <th className="pb-2 w-[15%]">Yesterday CPR</th>
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item, index) => {
                  if (item.type === "SPOT") {
                    const spotSum = getTcBcSumValue(data.spotData?.cpr);
                    return (
                      <tr key={`spot-${index}`} className="bg-blue-50/60 shadow-sm relative z-20 transition-all">
                        <td className="py-4 px-2 rounded-l-xl border-y border-l border-blue-200"><CPRDisplay cpr={data.spotData?.cpr} /></td>
                        <td className="py-4 px-2 border-y border-blue-200">{renderTcBcBadge(spotSum, "default")}</td>
                        <td className="py-4 px-2 border-y border-blue-200">
                          {renderLTP(data.spotData?.ltp || data.spot, data.spotData?.tickDirection, false, true)}
                        </td>
                        <td className="py-4 px-2 border-y border-blue-200 bg-blue-100/30"><TouchBadge touches={data.spotData?.touches} /></td>
                        <td className="py-4 px-2 relative border-y border-blue-200 bg-blue-100/30">
                          <div className="mx-auto w-28 py-1.5 rounded-lg flex flex-col items-center justify-center font-black text-base tracking-tight bg-blue-600 text-white shadow-md ring-2 ring-blue-300 ring-offset-2 relative">
                            <span className="absolute -top-2.5 text-[9px] uppercase tracking-widest font-black bg-blue-900 text-blue-100 px-2 py-0.5 rounded shadow-sm border border-blue-700">{selectedIndex} SPOT</span>
                            {data.spot}
                          </div>
                        </td>
                        <td className="py-4 px-2 border-y border-blue-200 bg-blue-100/30"><TouchBadge touches={data.spotData?.touches} /></td>
                        <td className="py-4 px-2 border-y border-blue-200">
                           {renderLTP(data.spotData?.ltp || data.spot, data.spotData?.tickDirection, false, false)}
                        </td>
                        <td className="py-4 px-2 border-y border-blue-200">{renderTcBcBadge(spotSum, "default")}</td>
                        <td className="py-4 px-2 rounded-r-xl border-y border-r border-blue-200"><CPRDisplay cpr={data.spotData?.cpr} /></td>
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
                    <tr key={row.strike} className={`group transition-all duration-300 shadow-sm ${isAtm ? "bg-yellow-50 relative z-10" : "bg-white hover:bg-gray-50"}`}>
                      <td className={`py-4 px-2 rounded-l-xl border-y border-l ${isAtm ? "border-yellow-300" : "border-gray-200 group-hover:border-gray-300"}`}><CPRDisplay cpr={row.CE?.cpr} /></td>
                      <td className={`py-4 px-2 border-y ${isAtm ? "border-yellow-300" : "border-gray-200 group-hover:border-gray-300"}`}>{renderTcBcBadge(ceSum, ceColor)}</td>
                      <td className={`py-4 px-2 border-y ${isAtm ? "border-yellow-300" : "border-gray-200 group-hover:border-gray-300"}`}>
                        {renderLTP(row.CE?.ltp, row.CE?.tickDirection, isAtm, true)}
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? "border-yellow-300 bg-yellow-100/30" : "border-gray-200 bg-green-50/30 group-hover:border-gray-300"}`}><TouchBadge touches={row.CE?.touches} /></td>
                      <td className={`py-4 px-2 relative border-y ${isAtm ? "border-yellow-300 bg-yellow-100/30" : "border-gray-200 group-hover:border-gray-300"}`}>
                        <div className={`mx-auto w-24 py-1.5 rounded-lg flex flex-col items-center justify-center font-black text-lg tracking-tight transition-all ${isAtm ? "bg-yellow-400 text-yellow-950 shadow-md ring-2 ring-yellow-200 ring-offset-2" : "bg-gray-100 text-gray-800 border border-gray-200 group-hover:bg-gray-200"}`}>
                          {isAtm && <span className="absolute -top-2.5 text-[9px] uppercase tracking-widest font-black bg-yellow-900 text-yellow-100 px-2 py-0.5 rounded shadow-sm border border-yellow-700">ATM</span>}
                          {row.strike}
                        </div>
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? "border-yellow-300 bg-yellow-100/30" : "border-gray-200 bg-red-50/30 group-hover:border-gray-300"}`}><TouchBadge touches={row.PE?.touches} /></td>
                      <td className={`py-4 px-2 border-y ${isAtm ? "border-yellow-300" : "border-gray-200 group-hover:border-gray-300"}`}>
                        {renderLTP(row.PE?.ltp, row.PE?.tickDirection, isAtm, false)}
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? "border-yellow-300" : "border-gray-200 group-hover:border-gray-300"}`}>{renderTcBcBadge(peSum, peColor)}</td>
                      <td className={`py-4 px-2 rounded-r-xl border-y border-r ${isAtm ? "border-yellow-300" : "border-gray-200 group-hover:border-gray-300"}`}><CPRDisplay cpr={row.PE?.cpr} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}