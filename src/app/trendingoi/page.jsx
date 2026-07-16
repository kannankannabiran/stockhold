"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { FaBolt, FaTrash } from "react-icons/fa";
import { useAccessControl } from "../../hooks/useAccessControl";
import up from "../../../public/up.svg";
import down from "../../../public/down.svg";

const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];
const REFRESH_MS = 5000;

function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-IN");
}

// Same color convention as the Option Chain page:
// Call OI Δ / Put OI Δ — positive = green, negative = red.
function ChangeCell({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  return (
    <span className="text-gray-800">
      {value > 0 ? "+" : ""}
      {fmtInt(value)}
    </span>
  );
}

function DiffCell({ value }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span className={`font-semibold ${positive ? "text-green-600" : negative ? "text-red-600" : "text-gray-700"}`}>
      {positive ? "+" : ""}
      {fmtInt(value)}
    </span>
  );
}

// Put chg OI - Call chg OI, normalized to a % of total chg OI.
// > 40% bullish (green), < -40% bearish (red), otherwise neutral (gray).
function computeDiffPercent(callOiChange, putOiChange) {
  if (callOiChange === null || callOiChange === undefined) return null;
  if (putOiChange === null || putOiChange === undefined) return null;
  const denom = Math.abs(callOiChange) + Math.abs(putOiChange);
  if (denom === 0) return 0;
  return ((putOiChange - callOiChange) / denom) * 100;
}

// Percentage + strength dots, no text label. 40%-100% magnitude maps to 1-5 dots.
function DiffPercentCell({ callOiChange, putOiChange }) {
  const pct = computeDiffPercent(callOiChange, putOiChange);
  if (pct === null) return <span className="text-gray-400">—</span>;

  const absPct = Math.abs(pct);
  const hasNegativeLeg = callOiChange < 0 || putOiChange < 0;

  let colorClass = "text-gray-600";
  let dotColorClass = "bg-gray-300";
  if (!hasNegativeLeg) {
    if (pct > 40) {
      colorClass = "text-green-600";
      dotColorClass = "bg-green-600";
    } else if (pct < -40) {
      colorClass = "text-red-600";
      dotColorClass = "bg-red-600";
    }
  }

  const filledDots =
    !hasNegativeLeg && absPct >= 40
      ? Math.min(5, Math.max(1, Math.ceil((absPct - 40) / 12)))
      : 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`font-semibold ${colorClass}`}>
        {pct > 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
      {filledDots > 0 && (
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i < filledDots ? dotColorClass : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Sentiment derived directly from diffOi so it always matches the sign shown in the Diff OI column.
function getSentiment(diffOi) {
  if (diffOi === null || diffOi === undefined || diffOi === 0) return "Neutral";
  return diffOi > 0 ? "Bullish" : "Bearish";
}

export default function TrendingOiPage() {
  const { hasAccess, loading: accessLoading } = useAccessControl("/trendingoi");

  const [symbol, setSymbol] = useState("NIFTY");
  const [history, setHistory] = useState([]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/trending-oi/history?symbol=${symbol}`);
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
  }, [symbol]);

  const handleClear = async () => {
    try {
      await fetch(`/api/trending-oi/history?symbol=${symbol}`, {
        method: "DELETE",
      });
      setHistory([]);
    } catch (err) {
      console.error("Failed to clear trending OI history", err);
    }
  };

  if (accessLoading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  // latest row (history is newest-first) drives the current spot readout
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

  return (
    <div className="p-6 max-w-screen-xl mx-auto">
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

      <div className="flex justify-center items-center gap-4 mb-4">
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

        <button
          onClick={handleClear}
          className="flex items-center gap-2 px-4 py-2 rounded bg-red-600 text-white font-semibold shadow-sm hover:bg-red-700"
        >
          <FaTrash /> Clear
        </button>
      </div>

      <div className="overflow-x-auto bg-white border rounded shadow">
        <table className="min-w-full text-sm text-center">
          <thead className="bg-blue-100 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Spot</th>
              <th className="px-3 py-2">Call OI Δ</th>
              <th className="px-3 py-2">Put OI Δ</th>
              <th className="px-3 py-2">Diff OI</th>
              <th className="px-3 py-2">Diff %</th>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row, index) => {
              const prev = history[index + 1];
              let direction = "-";

              if (prev) {
                if (row.overallDiffOi > prev.overallDiffOi) direction = "up";
                else if (row.overallDiffOi < prev.overallDiffOi) direction = "down";
              }

              const sentiment = getSentiment(row.diffOi);

              return (
                <tr
                  key={row.id || `${row.time}-${index}`}
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
                    <ChangeCell value={row.callOiChange} />
                  </td>
                  <td className="px-3 py-2">
                    <ChangeCell value={row.putOiChange} />
                  </td>
                  <td className="px-3 py-2">
                    <DiffCell value={row.diffOi} />
                  </td>
                  <td className="px-3 py-2">
                    <DiffPercentCell callOiChange={row.callOiChange} putOiChange={row.putOiChange} />
                  </td>
                  <td className="px-3 py-2">
                    {direction === "up" ? (
                      <Image src={up} alt="Up" width={40} height={40} className="mx-auto" />
                    ) : direction === "down" ? (
                      <Image src={down} alt="Down" width={40} height={40} className="mx-auto" />
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-3 py-1 font-bold text-sm rounded-full 
                        ${
                          sentiment === "Bullish"
                            ? "bg-green-600 text-white"
                            : sentiment === "Bearish"
                            ? "bg-red-600 text-white"
                            : "bg-gray-100 text-gray-700"
                        }`}
                    >
                      {sentiment}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}