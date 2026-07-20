"use client";

import React, { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { FaBolt, FaTrash, FaPalette, FaCalendarTimes } from "react-icons/fa";
import { useAccessControl } from "../../hooks/useAccessControl";
import up from "../../../public/up.svg";
import down from "../../../public/down.svg";

const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];
const REFRESH_MS = 5000;
const TIMEFRAME_OPTIONS = [1, 3, 5, 15, 30, 60];

// Divide raw OI change values by these before accumulating.
const DIVISORS = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };

// yyyy-mm-dd, matching both the stored `date` column and what
// <input type="date"> gives/expects.
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(Number(n)).toLocaleString("en-IN");
}

// Sentiment derived directly from diffOi so it always matches the sign shown in the Diff OI column.
function getSentiment(diffOi) {
  if (diffOi === null || diffOi === undefined || diffOi === 0) return "Neutral";
  return diffOi > 0 ? "Bullish" : "Bearish";
}

// "HH:MM:SS" -> minutes since midnight, for bucketing into timeframe windows.
function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export default function TrendingOiPage() {
  const { hasAccess, loading: accessLoading } = useAccessControl("/trendingoi");

  const [symbol, setSymbol] = useState("NIFTY");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [timeframe, setTimeframe] = useState(1); // minutes
  const [history, setHistory] = useState([]);
  // Toggles green/red coloring on Call+/Call-/Call Chg/Put+/Put-/Put Chg columns.
  // When off, those cells render in plain gray instead.
  const [colorsEnabled, setColorsEnabled] = useState(false);

  // Fetches only the selected date's rows — the backend serves this straight
  // from SQLite (not the capped in-memory window), so any past date works,
  // not just ones still sitting in the last ~500 in-memory rows.
  const fetchHistory = async () => {
    try {
      const res = await fetch(
        `/api/trending-oi/history?symbol=${symbol}&date=${selectedDate}`
      );
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch trending OI history", err);
    }
  };

  useEffect(() => {
    fetchHistory();
    // Only worth auto-refreshing while looking at today — past dates are static.
    if (selectedDate !== todayStr()) return;
    const interval = setInterval(fetchHistory, REFRESH_MS);
    return () => clearInterval(interval);
  }, [symbol, selectedDate]);

  const handleClearDay = async () => {
    try {
      await fetch(
        `/api/trending-oi/history?symbol=${symbol}&date=${selectedDate}`,
        { method: "DELETE" }
      );
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear trending OI history for date", err);
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch(`/api/trending-oi/history?symbol=${symbol}`, {
        method: "DELETE",
      });
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear trending OI history", err);
    }
  };

  // Cumulative summary snapshot as of each stored minute — Call+/Call-/Call
  // Chg, Put+/Put-/Put Chg, Diff OI (|putChg| - |callChg|), Diff %,
  // recomputed at every raw 1-min row so you get a minute-by-minute log of
  // how the running totals evolved. `history` is already scoped to the
  // selected date by the fetch above, so totals naturally restart each day.
  // Raw callOiChange/putOiChange are divided by the per-symbol DIVISORS
  // value before accumulating. Also tracks the day's running Spot
  // high/low and flags the row where a new one is set.
  const rawCumulativeRows = useMemo(() => {
    const divisor = DIVISORS[symbol] || 1;
    const chronological = [...history].reverse();
    let callPlus = 0;
    let callMinus = 0;
    let putPlus = 0;
    let putMinus = 0;
    let dayHigh = -Infinity;
    let dayLow = Infinity;
    const out = [];

    for (const row of chronological) {
      const c =
        row.callOiChange !== null && row.callOiChange !== undefined
          ? row.callOiChange / divisor
          : row.callOiChange;
      const p =
        row.putOiChange !== null && row.putOiChange !== undefined
          ? row.putOiChange / divisor
          : row.putOiChange;
      if (c !== null && c !== undefined) {
        if (c > 0) callPlus += c;
        else if (c < 0) callMinus += c; // stays negative
      }
      if (p !== null && p !== undefined) {
        if (p > 0) putPlus += p;
        else if (p < 0) putMinus += p; // stays negative
      }

      const callChg = callPlus + callMinus;
      const putChg = putPlus + putMinus;
      const diffOi = Math.abs(putChg) - Math.abs(callChg);
      const denom = Math.abs(callChg) + Math.abs(putChg);
      const diffPct = denom === 0 ? 0 : (diffOi / denom) * 100;

      // Day High/Low break: compared against the running high/low BEFORE
      // this row's spot is folded in, so the very first row of the day
      // just sets the baseline rather than "breaking" it.
      let dayBreak = "-";
      if (row.spot !== null && row.spot !== undefined) {
        if (dayHigh !== -Infinity && row.spot > dayHigh) dayBreak = "Day High Break";
        else if (dayLow !== Infinity && row.spot < dayLow) dayBreak = "Day Low Break";
        dayHigh = Math.max(dayHigh, row.spot);
        dayLow = Math.min(dayLow, row.spot);
      }

      out.push({
        id: row.id,
        date: row.date,
        time: row.time,
        spot: row.spot,
        dayBreak,
        callPlus,
        callMinus,
        callChg,
        putPlus,
        putMinus,
        putChg,
        diffOi,
        diffPct,
      });
    }

    return out; // chronological (oldest -> newest)
  }, [history, symbol]);

  // Consolidates the 1-min rows into N-minute buckets: since Call+/Call-/etc
  // are already running totals for the day, a bucket just needs the LAST raw
  // row that falls inside it — that row's totals already reflect everything
  // that happened up to that point in the bucket. Direction/Sentiment are
  // then computed across the consolidated sequence, not the raw one, so the
  // up/down arrow compares bucket-to-bucket rather than minute-to-minute.
  const summaryRows = useMemo(() => {
    let buckets = [];

    if (timeframe <= 1) {
      buckets = rawCumulativeRows;
    } else {
      let currentBucketKey = null;
      for (const row of rawCumulativeRows) {
        const mins = timeToMinutes(row.time);
        const bucketKey = mins === null ? null : Math.floor(mins / timeframe) * timeframe;
        if (bucketKey !== currentBucketKey || buckets.length === 0) {
          buckets.push(row);
          currentBucketKey = bucketKey;
        } else {
          buckets[buckets.length - 1] = row; // overwrite with the latest row in this bucket
        }
      }
    }

    let prevDiffOi = null;
    const out = buckets.map((row) => {
      let direction = "-";
      if (prevDiffOi !== null) {
        if (row.diffOi > prevDiffOi) direction = "up";
        else if (row.diffOi < prevDiffOi) direction = "down";
      }
      prevDiffOi = row.diffOi;
      return { ...row, direction, sentiment: getSentiment(row.diffOi) };
    });

    return out.reverse(); // newest-first
  }, [rawCumulativeRows, timeframe]);

  if (accessLoading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  // latest row (history is newest-first, scoped to selectedDate) drives the spot readout
  const currentSpot = history[0]?.spot ?? null;
  const prevSpotRow = history[1]?.spot ?? null;
  const spotDirection =
    currentSpot != null && prevSpotRow != null
      ? currentSpot > prevSpotRow
        ? "up"
        : currentSpot < prevSpotRow
        ? "down"
        : "-"
      : "-";

  // Helper: pick green/red/gray based on sign, or plain gray when colors are toggled off.
  const signClass = (val, { zeroClass = "text-gray-700" } = {}) => {
    if (!colorsEnabled) return "text-gray-700";
    if (val > 0) return "text-green-600";
    if (val < 0) return "text-red-600";
    return zeroClass;
  };

  return (
    <div className="p-6 max-w-screen-xxl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-2 text-gray-800 flex items-center justify-center gap-3">
        <FaBolt className="text-yellow-500" /> Trending OI - {symbol}
      </h2>
      <p className="text-center text-xs text-gray-500 mb-4">
        Snapshot stored every 1 minute — same Call OI Δ / Put OI Δ / Diff OI as the Option Chain page.
      </p>

      {/* current spot price readout */}
      <div className="flex justify-center items-center gap-2 mb-4">
        <span className="text-gray-500 text-sm">Spot:</span>
        <span
          className={`text-xl font-bold ${
            spotDirection === "up"
              ? "text-green-600"
              : spotDirection === "down"
              ? "text-red-600"
              : "text-gray-800"
          }`}
        >
          {currentSpot != null
            ? currentSpot.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : "—"}
        </span>
        {spotDirection === "up" && (
          <Image src={up} alt="Up" width={52} height={52} />
        )}
        {spotDirection === "down" && (
          <Image src={down} alt="Down" width={52} height={52} />
        )}
      </div>

      <div className="flex justify-center items-center gap-4 mb-4 flex-wrap">
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="border px-4 py-2 rounded shadow-sm focus:ring-2 focus:ring-blue-500"
        >
          {indexOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={selectedDate}
          max={todayStr()}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border px-4 py-2 rounded shadow-sm focus:ring-2 focus:ring-blue-500"
        />

        <select
          value={timeframe}
          onChange={(e) => setTimeframe(Number(e.target.value))}
          className="border px-4 py-2 rounded shadow-sm focus:ring-2 focus:ring-blue-500"
          title="Consolidate rows into this many minutes"
        >
          {TIMEFRAME_OPTIONS.map((tf) => (
            <option key={tf} value={tf}>
              {tf} min
            </option>
          ))}
        </select>

        <button
          onClick={() => setColorsEnabled((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded font-semibold shadow-sm border ${
            colorsEnabled
              ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
          title="Toggle Call/Put column colors"
        >
          <FaPalette /> {colorsEnabled ? "Colors: On" : "Colors: Off"}
        </button>

        <button
          onClick={handleClearDay}
          className="flex items-center gap-2 px-4 py-2 rounded bg-orange-600 text-white font-semibold shadow-sm hover:bg-orange-700"
          title="Clear only the selected date's data"
        >
          <FaCalendarTimes /> Clear Day
        </button>

        <button
          onClick={handleClearAll}
          className="flex items-center gap-2 px-4 py-2 rounded bg-red-600 text-white font-semibold shadow-sm hover:bg-red-700"
          title="Clear all stored data for this symbol"
        >
          <FaTrash /> Clear All
        </button>
      </div>

      <div className="overflow-x-auto bg-white border rounded shadow">
        <table className="w-full min-w-full text-sm text-center">
          <thead className="bg-blue-100 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Spot</th>
              <th className="px-3 py-2">Day High/Low</th>
              <th className="px-3 py-2">Call +</th>
              <th className="px-3 py-2">Call −</th>
              <th className="px-3 py-2">Call Chg</th>
              <th className="px-3 py-2">Put +</th>
              <th className="px-3 py-2">Put −</th>
              <th className="px-3 py-2">Put Chg</th>
              <th className="px-3 py-2">Diff OI</th>
              <th className="px-3 py-2">Diff %</th>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((row, index) => (
              <tr
                key={row.id || `${row.date}-${row.time}-${index}`}
                className="border-t hover:bg-gray-50"
              >
                <td className="px-3 py-2 text-gray-700">{row.date}</td>
                <td className="px-3 py-2 text-gray-700">{row.time}</td>
                <td className="px-3 py-2 text-gray-700">
                  {row.spot != null
                    ? Number(row.spot).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })
                    : "-"}
                </td>
                <td className="px-3 py-2">
                  {row.dayBreak === "Day High Break" ? (
                    <span className="px-3 py-1 font-bold text-xs rounded-full bg-green-600 text-white whitespace-nowrap">
                      Day High Break
                    </span>
                  ) : row.dayBreak === "Day Low Break" ? (
                    <span className="px-3 py-1 font-bold text-xs rounded-full bg-red-600 text-white whitespace-nowrap">
                      Day Low Break
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.callPlus > 0 ? (
                    <span className={` ${colorsEnabled ? "text-green-600" : "text-gray-700"}`}>
                      {fmtInt(row.callPlus)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.callMinus < 0 ? (
                    <span className={`${colorsEnabled ? "text-red-600" : "text-gray-700"}`}>
                      {fmtInt(Math.abs(row.callMinus))}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`${signClass(row.callChg)}`}>
                    {fmtInt(Math.abs(row.callChg))}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.putPlus > 0 ? (
                    <span className={`${colorsEnabled ? "text-green-600" : "text-gray-700"}`}>
                      {fmtInt(row.putPlus)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.putMinus < 0 ? (
                    <span className={`${colorsEnabled ? "text-red-600" : "text-gray-700"}`}>
                      {fmtInt(Math.abs(row.putMinus))}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span className={`${signClass(row.putChg)}`}>
                    {fmtInt(Math.abs(row.putChg))}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`font-semibold ${
                      row.diffOi > 0
                        ? "text-green-600"
                        : row.diffOi < 0
                        ? "text-red-600"
                        : "text-gray-700"
                    }`}
                  >
                    {fmtInt(Math.abs(row.diffOi))}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`font-semibold ${
                      row.diffPct > 40
                        ? "text-green-600"
                        : row.diffPct < -40
                        ? "text-red-600"
                        : "text-gray-700"
                    }`}
                  >
                    {Math.abs(row.diffPct).toFixed(1)}%
                  </span>
                </td>
                <td className="px-3 py-2">
                  {row.direction === "up" ? (
                    <Image src={up} alt="Up" width={40} height={40} className="mx-auto" />
                  ) : row.direction === "down" ? (
                    <Image src={down} alt="Down" width={40} height={40} className="mx-auto" />
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`px-3 py-1 font-bold text-sm rounded-full 
                      ${
                        row.sentiment === "Bullish"
                          ? "bg-green-600 text-white"
                          : row.sentiment === "Bearish"
                          ? "bg-red-600 text-white"
                          : "bg-gray-100 text-gray-700"
                      }`}
                  >
                    {row.sentiment}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}