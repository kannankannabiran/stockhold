"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { FaBolt, FaTrash } from "react-icons/fa";
import { useAccessControl } from "../../hooks/useAccessControl";
import up from "../../../public/up.svg";
import down from "../../../public/down.svg";

const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];
const REFRESH_MS = 5000;

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

  const getOiDiffPercent = (row) => {
    const callChange = Math.round(row.callChange);
    const putChange = Math.round(row.putChange);
    const diffOi = Math.round(row.diffOi);
    const total = Math.abs(callChange) + Math.abs(putChange);
    if (!total) return 0;
    return (diffOi / total) * 100;
  };

  const getOiDiffStyle = (pct) => {
    if (pct >= 40) {
      return { label: "Bullish", className: "bg-green-600 text-white" };
    } else if (pct <= -40) {
      return { label: "Bearish", className: "bg-red-600 text-white" };
    }
    return { label: "Neutral", className: "bg-gray-200 text-gray-700" };
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
          <Image src={up} alt="Up" width={32} height={32} />
        )}
        {spotDirection === "down" && (
          <Image src={down} alt="Down" width={32} height={32} />
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
              <th className="px-3 py-2">Call OI</th>
              <th className="px-3 py-2">Put OI</th>
              <th className="px-3 py-2">Call ΔOI</th>
              <th className="px-3 py-2">Put ΔOI</th>
              <th className="px-3 py-2">ΔOI Diff</th>
              <th className="px-3 py-2">ΔOI Diff %</th>
              <th className="px-3 py-2">Direction</th>
              <th className="px-3 py-2">Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {history.map((row, index) => {
              const prev = history[index + 1];
              let direction = "-";

              if (prev) {
                if (row.diffOi > prev.diffOi) direction = "up";
                else if (row.diffOi < prev.diffOi) direction = "down";
              }

              const callChange = Math.round(row.callChange);
              const putChange = Math.round(row.putChange);
              const diffOi = Math.round(row.diffOi);

              // NEW: raw Call OI / Put OI (summed across the 15 ATM-centered strikes)
              const callOi = row.callOi != null ? Math.round(row.callOi) : null;
              const putOi = row.putOi != null ? Math.round(row.putOi) : null;

              const oiDiffPct = getOiDiffPercent(row);
              const { className: oiDiffClass } = getOiDiffStyle(oiDiffPct);

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
                    {callOi != null ? callOi.toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {putOi != null ? putOi.toLocaleString() : "-"}
                  </td>
                  <td className="px-3 py-2">{callChange.toLocaleString()}</td>
                  <td className="px-3 py-2">{putChange.toLocaleString()}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      diffOi > 0
                        ? "text-green-600"
                        : diffOi < 0
                        ? "text-red-600"
                        : "text-gray-700"
                    }`}
                  >
                    {diffOi.toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-3 py-1 font-bold text-sm rounded-full ${oiDiffClass}`}
                    >
                      {oiDiffPct.toFixed(1)}%
                    </span>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}