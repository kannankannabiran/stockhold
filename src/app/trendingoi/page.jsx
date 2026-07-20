"use client";

import React, { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { FaBolt, FaTrash, FaPalette, FaCalendarTimes } from "react-icons/fa";
import { useAccessControl } from "../../hooks/useAccessControl";
import up from "../../../public/up.svg";
import down from "../../../public/down.svg";

const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];
const REFRESH_MS = 5000;
const DIVISORS = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };

function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(Number(n)).toLocaleString("en-IN");
}

function getSentiment(diffOi) {
  if (diffOi === null || diffOi === undefined || diffOi === 0) return "Neutral";
  return diffOi > 0 ? "Bullish" : "Bearish";
}

function getTodayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function TrendingOiPage() {
  const { hasAccess, loading: accessLoading } = useAccessControl("/trendingoi");

  const [symbol, setSymbol] = useState("NIFTY");
  const [history, setHistory] = useState([]);
  const [colorsEnabled, setColorsEnabled] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getTodayIST());

  const fetchHistory = async () => {
    try {
      const params = new URLSearchParams({ symbol });
      if (selectedDate) params.set("date", selectedDate);

      const res = await fetch(`/api/trending-oi/history?${params.toString()}`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch trending OI history", err);
    }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, REFRESH_MS);
    return () => clearInterval(interval);
  }, [symbol, selectedDate]);

  const availableDates = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of history) {
      if (row.date && !seen.has(row.date)) {
        seen.add(row.date);
        out.push(row.date);
      }
    }
    return out;
  }, [history]);

  const filteredHistory = useMemo(() => {
    if (!selectedDate) return [];
    return history.filter((r) => r.date === selectedDate);
  }, [history, selectedDate]);

  useEffect(() => {
    if (!selectedDate && availableDates.length > 0) {
      setSelectedDate(availableDates[0]);
    }
  }, [availableDates, selectedDate]);

  const handleClearDay = async () => {
    if (!selectedDate) return;
    try {
      await fetch(
        `/api/trending-oi/history?symbol=${symbol}&date=${encodeURIComponent(selectedDate)}`,
        { method: "DELETE" }
      );
      setHistory((prev) => prev.filter((r) => r.date !== selectedDate));
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
      setSelectedDate("");
    } catch (err) {
      console.error("Failed to clear trending OI history", err);
    }
  };

  const summaryRows = useMemo(() => {
    const divisor = DIVISORS[symbol] || 1;
    const chronological = [...filteredHistory].reverse();
    let callPlus = 0;
    let callMinus = 0;
    let putPlus = 0;
    let putMinus = 0;
    let prevDiffOi = null;
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
        else if (c < 0) callMinus += c;
      }

      if (p !== null && p !== undefined) {
        if (p > 0) putPlus += p;
        else if (p < 0) putMinus += p;
      }

      const callChg = callPlus + callMinus;
      const putChg = putPlus + putMinus;
      const diffOi = Math.abs(putChg) - Math.abs(callChg);
      const denom = Math.abs(callChg) + Math.abs(putChg);
      const diffPct = denom === 0 ? 0 : (diffOi / denom) * 100;

      let direction = "-";
      if (prevDiffOi !== null) {
        if (diffOi > prevDiffOi) direction = "up";
        else if (diffOi < prevDiffOi) direction = "down";
      }

      const sentiment = getSentiment(diffOi);

      out.push({
        id: row.id,
        date: row.date,
        time: row.time,
        spot: row.spot,
        callPlus,
        callMinus,
        callChg,
        putPlus,
        putMinus,
        putChg,
        diffOi,
        diffPct,
        direction,
        sentiment,
      });

      prevDiffOi = diffOi;
    }

    return out.reverse();
  }, [filteredHistory, symbol]);

  if (accessLoading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  const currentSpot = filteredHistory[0]?.spot ?? null;
  const prevSpotRow = filteredHistory[1]?.spot ?? null;
  const spotDirection =
    currentSpot != null && prevSpotRow != null
      ? currentSpot > prevSpotRow
        ? "up"
        : currentSpot < prevSpotRow
        ? "down"
        : "-"
      : "-";

  const signClass = (val, { zeroClass = "text-gray-700" } = {}) => {
    if (!colorsEnabled) return "text-gray-700";
    if (val > 0) return "text-green-600";
    if (val < 0) return "text-red-600";
    return zeroClass;
  };

  const renderValue = (val, colorClass = "text-gray-700") => {
    if (val === null || val === undefined || Number.isNaN(val)) {
      return <span className="text-gray-400">—</span>;
    }
    return <span className={colorClass}>{fmtInt(val)}</span>;
  };

  return (
    <div className="p-6 max-w-screen-xxl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-2 text-gray-800 flex items-center justify-center gap-3">
        <FaBolt className="text-yellow-500" /> Trending OI - {symbol}
      </h2>

      <p className="text-center text-xs text-gray-500 mb-4">
        Snapshot stored every 1 minute — select a calendar date to view that day only.
      </p>

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
        {spotDirection === "up" && <Image src={up} alt="Up" width={52} height={52} />}
        {spotDirection === "down" && <Image src={down} alt="Down" width={52} height={52} />}
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
          onChange={(e) => setSelectedDate(e.target.value)}
          className="border px-4 py-2 rounded shadow-sm focus:ring-2 focus:ring-blue-500"
        />

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
          disabled={!selectedDate}
          className="flex items-center gap-2 px-4 py-2 rounded bg-orange-600 text-white font-semibold shadow-sm hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

      <div className="mb-3 text-center text-sm text-gray-500">
        {availableDates.length > 0
          ? `Available dates: ${availableDates.join(", ")}`
          : "No data available"}
      </div>

      <div className="overflow-x-auto bg-white border rounded shadow">
        <table className="w-full min-w-full text-sm text-center">
          <thead className="bg-blue-100 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Spot</th>
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
                  {row.callPlus !== null && row.callPlus !== undefined ? (
                    <span className={`${colorsEnabled ? "text-green-600" : "text-gray-700"}`}>
                      {fmtInt(row.callPlus)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  {row.callMinus !== null && row.callMinus !== undefined ? (
                    <span className={`${colorsEnabled ? "text-red-600" : "text-gray-700"}`}>
                      {fmtInt(Math.abs(row.callMinus))}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  {renderValue(Math.abs(row.callChg), signClass(row.callChg))}
                </td>

                <td className="px-3 py-2">
                  {row.putPlus !== null && row.putPlus !== undefined ? (
                    <span className={`${colorsEnabled ? "text-green-600" : "text-gray-700"}`}>
                      {fmtInt(row.putPlus)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  {row.putMinus !== null && row.putMinus !== undefined ? (
                    <span className={`${colorsEnabled ? "text-red-600" : "text-gray-700"}`}>
                      {fmtInt(Math.abs(row.putMinus))}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  {renderValue(Math.abs(row.putChg), signClass(row.putChg))}
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
                    className={`px-3 py-1 font-bold text-sm rounded-full ${
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