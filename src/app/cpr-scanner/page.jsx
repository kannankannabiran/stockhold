"use client";
import { useEffect, useState, useRef } from "react";

export default function CPRScannerPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState("NIFTY");
  const [selectedExpiry, setSelectedExpiry] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  });

  const [notifPermission, setNotifPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  const fetchingRef = useRef(false);
  // Tracks touch-count per key ("spot", "<strike>-CE", "<strike>-PE") so we only
  // notify on NEW touches, not ones that already existed on first load.
  const prevTouchesRef = useRef({});
  // True until the first successful fetch for the current index/expiry/date context
  // completes — suppresses notifications for pre-existing touches on load/context switch.
  const isFirstLoadRef = useRef(true);

  const requestNotifPermission = () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      Notification.requestPermission().then(setNotifPermission);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().then(setNotifPermission);
    }
  }, []);

  const notifyNewTouches = (label, newTouches) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    newTouches.forEach((t) => {
      try {
        new Notification(`CPR ${t.level} Touch`, {
          body: `${selectedIndex} — ${label} touched ${t.level} CPR at ${t.time}`,
          tag: `${selectedIndex}-${label}-${t.level}-${t.time}`,
        });
      } catch (e) {
        console.error("Notification failed", e);
      }
    });
  };

  const checkForNewTouches = (json) => {
    const spotKey = "spot";
    const spotTouches = json.spotData?.touches || [];
    const prevSpotLen = prevTouchesRef.current[spotKey] || 0;
    if (!isFirstLoadRef.current && spotTouches.length > prevSpotLen) {
      notifyNewTouches(`${json.index} Spot`, spotTouches.slice(prevSpotLen));
    }
    prevTouchesRef.current[spotKey] = spotTouches.length;

    (json.rows || []).forEach((row) => {
      ["CE", "PE"].forEach((side) => {
        const key = `${row.strike}-${side}`;
        const touches = row[side]?.touches || [];
        const prevLen = prevTouchesRef.current[key] || 0;
        if (!isFirstLoadRef.current && touches.length > prevLen) {
          notifyNewTouches(`${row.strike} ${side}`, touches.slice(prevLen));
        }
        prevTouchesRef.current[key] = touches.length;
      });
    });

    isFirstLoadRef.current = false;
  };

  const fetchScannerData = async (isBackground = false) => {
    if (fetchingRef.current && !isBackground) return;
    fetchingRef.current = true;

    if (!isBackground && !data) setLoading(true);
    setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      params.append("index", selectedIndex);
      if (selectedExpiry) params.append("expiry", selectedExpiry);
      if (selectedDate) params.append("date", selectedDate);

      const res = await fetch(`/api/cpr-scanner?${params.toString()}`);
      if (!res.ok) throw new Error("Kite data not connected or failed to fetch");
      const json = await res.json();

      checkForNewTouches(json);
      setData(json);

      if (!selectedExpiry || !json.availableExpiries?.includes(selectedExpiry)) {
        if (json.expiry) setSelectedExpiry(json.expiry);
      }

      setLastUpdated(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" }));
      setError(null);
    } catch (err) {
      if (!isBackground) setError(err.message);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    // New context (index/expiry/date) — reset touch tracking so we don't fire
    // notifications for touches that already existed before this context was selected.
    prevTouchesRef.current = {};
    isFirstLoadRef.current = true;

    fetchScannerData(false);
    const interval = setInterval(() => fetchScannerData(true), 10000);
    return () => clearInterval(interval);
  }, [selectedExpiry, selectedIndex, selectedDate]);

  const handleIndexChange = (e) => {
    const newIdx = e.target.value;
    if (newIdx === selectedIndex) return;
    setSelectedIndex(newIdx);
    setSelectedExpiry("");
  };

  const TouchBadge = ({ touches }) => {
    if (!touches || touches.length === 0) return <span className="text-gray-300 text-sm font-medium">—</span>;
    return (
      <div className="flex flex-col gap-1.5 items-center justify-center">
        {touches.map((t, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between w-[120px] px-2 py-1 text-[11px] font-bold rounded-md border ${
              t.level === "Top" ? "bg-green-50 border-green-200 text-green-700 shadow-sm" :
              t.level === "Bottom" ? "bg-red-50 border-red-200 text-red-700 shadow-sm" :
              "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
            }`}
          >
            <span className="uppercase tracking-widest">{t.level}</span>
            <span className="font-mono text-gray-500 bg-white/60 px-1 rounded">{t.time}</span>
          </div>
        ))}
      </div>
    );
  };

  const CPRDisplay = ({ cpr }) => {
    if (!cpr) return <span className="text-gray-300">—</span>;
    return (
      <div className="flex items-center justify-center gap-3 text-[11px] font-mono bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 shadow-inner w-fit mx-auto">
        <div className="flex gap-1.5"><span className="text-gray-400 font-sans font-bold">TC</span><span className="text-gray-700 font-semibold">{cpr.TC}</span></div>
        <div className="w-[1px] h-3 bg-gray-300"></div>
        <div className="flex gap-1.5"><span className="text-blue-500 font-sans font-bold">P</span><span className="text-blue-700 font-bold">{cpr.Pivot}</span></div>
        <div className="w-[1px] h-3 bg-gray-300"></div>
        <div className="flex gap-1.5"><span className="text-gray-400 font-sans font-bold">BC</span><span className="text-gray-700 font-semibold">{cpr.BC}</span></div>
      </div>
    );
  };

  if (!data && loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
      <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <div className="w-10 h-10 border-4 border-gray-100 border-t-yellow-400 rounded-full animate-spin"></div>
        <p className="text-gray-500 text-sm font-semibold tracking-wide">Connecting to Market...</p>
      </div>
    </div>
  );

  const atmStrike = data?.rows?.length > 0
    ? data.rows.reduce((prev, curr) =>
        Math.abs(curr.strike - data.spot) < Math.abs(prev.strike - data.spot) ? curr : prev
      ).strike
    : 0;

  const tableItems = [];
  let spotAdded = false;

  if (data?.rows) {
    data.rows.forEach((row) => {
      if (!spotAdded && data.spot <= row.strike) {
        tableItems.push({ type: 'SPOT', strike: data.spot });
        spotAdded = true;
      }
      tableItems.push({ type: 'ROW', data: row });
    });
    if (!spotAdded) {
      tableItems.push({ type: 'SPOT', strike: data.spot });
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8 font-sans selection:bg-yellow-200">
      <div className="w-full mx-auto">

        {/* Terminal Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4 flex flex-col lg:flex-row justify-between items-center gap-6 shadow-sm relative overflow-hidden">

          <div className="flex items-center gap-5 z-10 flex-wrap">
            <div className="h-12 w-12 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-xl flex items-center justify-center text-yellow-950 shadow-inner">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-800 tracking-tight">CPR Scanner <span className="text-xs font-bold text-white bg-gray-800 px-2.5 py-0.5 rounded ml-1">PRO</span></h1>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm font-medium">

                <select
                  value={selectedIndex}
                  onChange={handleIndexChange}
                  className="font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-xs uppercase cursor-pointer transition-all hover:bg-blue-100 shadow-sm tracking-wider"
                >
                  <option value="NIFTY">NIFTY</option>
                  <option value="BANKNIFTY">BANKNIFTY</option>
                  <option value="SENSEX">SENSEX</option>
                </select>

                <span className="text-gray-300">|</span>

                <span className="text-gray-500 flex items-center gap-1.5">
                  Date
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="font-mono text-gray-900 bg-gray-50 px-2 py-1 rounded-md border border-gray-200 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-xs font-bold cursor-pointer transition-all hover:bg-gray-100 shadow-sm"
                  />
                </span>

                <span className="text-gray-300">|</span>

                <span className="text-gray-500 flex items-center gap-1.5">
                  Exp
                  <select
                    value={selectedExpiry || data?.expiry || ""}
                    onChange={(e) => setSelectedExpiry(e.target.value)}
                    className="font-mono text-gray-900 bg-gray-50 px-2 py-1 rounded-md border border-gray-200 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-xs font-bold cursor-pointer transition-all hover:bg-gray-100 shadow-sm"
                  >
                    {data?.availableExpiries?.map((exp) => (
                      <option key={exp} value={exp}>{exp}</option>
                    ))}
                  </select>
                </span>

                <span className="text-gray-300">|</span>
                <span className="text-gray-500">Spot <span className="font-mono text-gray-900 bg-gray-100 px-1.5 rounded ml-1">{data?.spot || "-"}</span></span>

              </div>
            </div>
          </div>

          <div className="flex items-center gap-5 z-10">
            {/* Notification permission indicator */}
            <button
              onClick={requestNotifPermission}
              disabled={notifPermission === "granted" || notifPermission === "unsupported"}
              title={
                notifPermission === "granted" ? "Alerts enabled — you'll be notified on new CPR touches" :
                notifPermission === "denied" ? "Notifications blocked — enable them in your browser's site settings" :
                notifPermission === "unsupported" ? "Notifications not supported in this browser" :
                "Click to enable CPR touch alerts"
              }
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border transition-all ${
                notifPermission === "granted" ? "bg-green-50 border-green-200 text-green-700 cursor-default" :
                notifPermission === "denied" ? "bg-red-50 border-red-200 text-red-600 cursor-not-allowed" :
                "bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100 cursor-pointer"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
              {notifPermission === "granted" ? "Alerts On" : notifPermission === "denied" ? "Alerts Blocked" : "Enable Alerts"}
            </button>

            <div className="flex flex-col items-end">
              <div className={`flex items-center gap-2 text-xs font-bold tracking-widest uppercase mb-1 ${error ? 'text-red-500' : 'text-green-600'}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isRefreshing ? 'animate-ping' : ''} ${error ? 'bg-red-400' : 'bg-green-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${error ? 'bg-red-500' : 'bg-green-500'}`}></span>
                </span>
                {isRefreshing ? 'Updating...' : error ? 'Disconnected' : 'Live Market'}
              </div>
              <span className="font-mono text-xs text-gray-400">Sync: {lastUpdated || "--:--:--"}</span>
            </div>
            <button
              onClick={() => fetchScannerData(false)}
              className="bg-gray-900 hover:bg-gray-800 border border-gray-900 text-white text-sm py-2 px-4 rounded-lg transition-all active:scale-95 flex items-center gap-2 shadow-sm"
            >
              <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
        </div>

        {/* Small Inline Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm text-sm font-medium w-fit">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>{error}</span>
          </div>
        )}

        {/* Pro Data Table or Empty State Notice */}
        <div className="w-full overflow-x-auto pb-10">
          {(!data?.rows || data.rows.length === 0) ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 font-semibold flex flex-col items-center gap-3 shadow-sm">
              <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <div>
                <p className="text-base text-gray-800 font-bold">
                  {isRefreshing ? `Loading data for ${selectedIndex}...` : error ? `Could not load data for ${selectedIndex}` : `No data available for ${selectedIndex} on ${selectedDate}.`}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {!isRefreshing && !error && "This date may be a market holiday, weekend, or historical records are not present."}
                  {!isRefreshing && error && "Ensure your Kite data connection is active and try again."}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full text-center border-separate" style={{ borderSpacing: '0 8px' }}>
              <thead>
                <tr className="text-xs uppercase tracking-widest font-extrabold text-gray-500">
                  <th className="pb-2 w-1/4">Yesterday CPR</th>
                  <th className="pb-2 w-[10%] text-gray-800">LTP</th>
                  <th className="pb-2 w-[15%] text-green-600">CE Touches (9:20 - 3:30)</th>
                  <th className="pb-2 w-[10%] text-gray-400">Strike / Spot</th>
                  <th className="pb-2 w-[15%] text-red-600">PE Touches (9:20 - 3:30)</th>
                  <th className="pb-2 w-[10%] text-gray-800">LTP</th>
                  <th className="pb-2 w-1/4">Yesterday CPR</th>
                </tr>
              </thead>

              <tbody>
                {tableItems.map((item, index) => {
                  if (item.type === 'SPOT') {
                    return (
                      <tr key={`spot-${index}`} className="bg-blue-50/60 shadow-sm relative z-20">
                        <td className="py-4 px-2 rounded-l-xl border-y border-l border-blue-200">
                          <CPRDisplay cpr={data.spotData?.cpr} />
                        </td>
                        <td className="py-4 px-2 border-y border-blue-200">
                          <span className="text-[17px] font-black text-blue-700">
                            {data.spotData?.ltp || data.spot}
                          </span>
                        </td>
                        <td className="py-4 px-2 border-y border-blue-200 bg-blue-100/30">
                          <TouchBadge touches={data.spotData?.touches} />
                        </td>
                        <td className="py-4 px-2 relative border-y border-blue-200 bg-blue-100/30">
                          <div className="mx-auto w-28 py-1.5 rounded-lg flex flex-col items-center justify-center font-black text-base tracking-tight bg-blue-600 text-white shadow-md ring-2 ring-blue-300 ring-offset-2 relative">
                            <span className="absolute -top-2.5 text-[9px] uppercase tracking-widest font-black bg-blue-900 text-blue-100 px-2 py-0.5 rounded shadow-sm border border-blue-700">
                              {selectedIndex} SPOT
                            </span>
                            {data.spot}
                          </div>
                        </td>
                        <td className="py-4 px-2 border-y border-blue-200 bg-blue-100/30">
                          <TouchBadge touches={data.spotData?.touches} />
                        </td>
                        <td className="py-4 px-2 border-y border-blue-200">
                          <span className="text-[17px] font-black text-blue-700">
                            {data.spotData?.ltp || data.spot}
                          </span>
                        </td>
                        <td className="py-4 px-2 rounded-r-xl border-y border-r border-blue-200">
                          <CPRDisplay cpr={data.spotData?.cpr} />
                        </td>
                      </tr>
                    );
                  }

                  const row = item.data;
                  const isAtm = row.strike === atmStrike;

                  return (
                    <tr
                      key={row.strike}
                      className={`group transition-all duration-300 shadow-sm ${
                        isAtm
                          ? "bg-yellow-50 relative z-10"
                          : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <td className={`py-4 px-2 rounded-l-xl border-y border-l ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <CPRDisplay cpr={row.CE?.cpr} />
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <span className={`text-[17px] font-black ${isAtm ? 'text-green-700' : 'text-green-600'}`}>
                          {row.CE?.ltp || "-"}
                        </span>
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300 bg-yellow-100/30' : 'border-gray-200 bg-green-50/30 group-hover:border-gray-300'}`}>
                        <TouchBadge touches={row.CE?.touches} />
                      </td>

                      <td className={`py-4 px-2 relative border-y ${isAtm ? 'border-yellow-300 bg-yellow-100/30' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <div className={`mx-auto w-24 py-1.5 rounded-lg flex flex-col items-center justify-center font-black text-lg tracking-tight transition-all
                          ${isAtm
                            ? "bg-yellow-400 text-yellow-950 shadow-md ring-2 ring-yellow-200 ring-offset-2"
                            : "bg-gray-100 text-gray-800 border border-gray-200 group-hover:bg-gray-200"
                          }`}
                        >
                          {isAtm && (
                            <span className="absolute -top-2.5 text-[9px] uppercase tracking-widest font-black bg-yellow-900 text-yellow-100 px-2 py-0.5 rounded shadow-sm border border-yellow-700">
                              ATM
                            </span>
                          )}
                          {row.strike}
                        </div>
                      </td>

                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300 bg-yellow-100/30' : 'border-gray-200 bg-red-50/30 group-hover:border-gray-300'}`}>
                        <TouchBadge touches={row.PE?.touches} />
                      </td>
                      <td className={`py-4 px-2 border-y ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <span className={`text-[17px] font-black ${isAtm ? 'text-red-700' : 'text-red-600'}`}>
                          {row.PE?.ltp || "-"}
                        </span>
                      </td>
                      <td className={`py-4 px-2 rounded-r-xl border-y border-r ${isAtm ? 'border-yellow-300' : 'border-gray-200 group-hover:border-gray-300'}`}>
                        <CPRDisplay cpr={row.PE?.cpr} />
                      </td>
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