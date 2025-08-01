"use client";

import React, { useEffect, useState, useRef } from "react";
import { FaSitemap } from "react-icons/fa";

const indexOptions = ["NIFTY", "BANKNIFTY", "RELIANCE", "ITC", "HDFCBANK", "MANAPPURAM", "KALYANKJIL"];

export default function OptionChain() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [rows, setRows] = useState([]);
  const [atm, setAtm] = useState(null);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState({});
  const [highs, setHighs] = useState({});
  const intervalRef = useRef(null);

  const fetchData = async (sym) => {
    try {
      const res = await fetch(`/api/option-chain?symbol=${sym}`);
      const data = await res.json();
      if (!Array.isArray(data)) return setError("API error");

      setRows(data);
      const atmStrike = data[Math.floor(data.length / 2)]?.strikePrice || null;
      setAtm(atmStrike);

      const atmIndex = data.findIndex(r => r.strikePrice === atmStrike);
      const selected = data.slice(Math.max(0, atmIndex - 7), atmIndex + 8);

      let callOi = 0, putOi = 0, callChange = 0, putChange = 0;
      selected.forEach(r => {
        callOi += r.openInterest || 0;
        putOi += r.openInterest_PE || 0;
        callChange += r.changeinOpenInterest || 0;
        putChange += r.changeinOpenInterest_PE || 0;
      });

      const diffOi = putOi- callOi;
      const diffChange = putChange - callChange;
      const direction = diffChange > 0 ? "Bullish" : diffChange < 0 ? "Bearish" : "Neutral";

      setSummary({ callOi, putOi, callChange, putChange, diffOi, diffChange, direction });

      let maxCallChange = -Infinity, minCallChange = Infinity;
      let maxPutChange = -Infinity, minPutChange = Infinity;

      selected.forEach(r => {
        maxCallChange = Math.max(maxCallChange, r.changeinOpenInterest || 0);
        minCallChange = Math.min(minCallChange, r.changeinOpenInterest || 0);
        maxPutChange = Math.max(maxPutChange, r.changeinOpenInterest_PE || 0);
        minPutChange = Math.min(minPutChange, r.changeinOpenInterest_PE || 0);
      });

      setHighs({ maxCallChange, minCallChange, maxPutChange, minPutChange });
    } catch (err) {
      setError("Network error");
    }
  };

  useEffect(() => {
    fetchData(symbol);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchData(symbol), 10000);
    return () => clearInterval(intervalRef.current);
  }, [symbol]);

  const cls = (strike, side) => {
    if (strike === atm) return "bg-yellow-100 font-bold text-gray-900";
    if (side === "CE" && strike < atm) return "bg-green-50 text-blue-800";
    if (side === "PE" && strike > atm) return "bg-pink-50 text-pink-800";
    return "text-gray-700";
  };

  const highlightBg = (val, side) => {
    if (side === "CE") {
      if (val === highs.maxCallChange && val > 0) return "bg-green-200 font-bold text-green-800";
      if (val === highs.minCallChange && val < 0) return "bg-red-200 font-bold text-red-800";
    }
    if (side === "PE") {
      if (val === highs.maxPutChange && val > 0) return "bg-green-200 font-bold text-green-800";
      if (val === highs.minPutChange && val < 0) return "bg-red-200 font-bold text-red-800";
    }
    return "";
  };

  return (
    <div className="p-6 md:p-8 max-w-screen-xxl mx-auto bg-white rounded-lg">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-semibold text-gray-800 flex justify-center items-center gap-3">
          <FaSitemap className="text-blue-600" /> {symbol} Option Chain
        </h2>
      </div>

      <div className="flex justify-center mb-6">
        <select
          className="border border-gray-300 px-5 py-2 rounded shadow-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        >
          {indexOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-gray-50 rounded-md shadow-inner p-4 mb-6 grid grid-cols-2 md:grid-cols-3 text-sm text-gray-700 gap-4 text-center">
        <div><strong>Call OI:</strong> {summary.callOi?.toLocaleString()}</div>
        <div><strong>Put OI:</strong> {summary.putOi?.toLocaleString()}</div>
        <div><strong>OI Diff:</strong> {summary.diffOi?.toLocaleString()}</div>
        <div><strong>ΔCall OI:</strong> {summary.callChange?.toLocaleString()}</div>
        <div><strong>ΔPut OI:</strong> {summary.putChange?.toLocaleString()}</div>
        <div>
          <strong>ΔOI Diff:</strong> {summary.diffChange?.toLocaleString()}
        </div>
        <div className="col-span-2 md:col-span-3 text-lg">
          <strong>Market Direction:</strong>{" "}
          <span
            className={`font-semibold ${
              summary.direction === "Bullish"
                ? "text-green-600"
                : summary.direction === "Bearish"
                ? "text-red-600"
                : "text-gray-500"
            }`}
          >
            {summary.direction}
          </span>
        </div>
      </div>

      {error && <div className="text-center text-red-600 mb-4">{error}</div>}

      <div className="overflow-x-auto border border-gray-200 rounded-lg shadow">
        <table className="min-w-full text-sm text-center text-gray-800">
          <thead className="bg-blue-100 text-blue-800 sticky top-0">
            <tr>
              <th className="py-3 px-2">Vol</th>
              <th className="py-3 px-2">OI</th>
              <th className="py-3 px-2">ΔOI</th>
              <th className="py-3 px-2">LTP</th>
              <th className="py-3 px-2 bg-yellow-200 text-gray-900">Strike</th>
              <th className="py-3 px-2">LTP</th>
              <th className="py-3 px-2">ΔOI</th>
              <th className="py-3 px-2">OI</th>
              <th className="py-3 px-2">Vol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-200 hover:bg-gray-50">
                <td className={`py-3 px-3 ${cls(r.strikePrice, "CE")}`}>{r.totalTradedVolume}</td>
                <td className={`py-3 px-3 ${cls(r.strikePrice, "CE")}`}>{r.openInterest}</td>
                <td className={`py-3 px-3 ${cls(r.strikePrice, "CE")} ${highlightBg(r.changeinOpenInterest, "CE")}`}>
                  {r.changeinOpenInterest}
                </td>
                <td className={`py-3 px-3 ${cls(r.strikePrice, "CE")}`}>{r.lastPrice}</td>
                <td className={`py-3 px-3 font-medium ${r.strikePrice === atm ? "bg-yellow-200" : ""}`}>
                  {r.strikePrice}
                </td>
                <td className={`py-3 px-3 ${cls(r.strikePrice, "PE")}`}>{r.lastPrice_PE}</td>
                <td className={`py-3 px-3 ${cls(r.strikePrice, "PE")} ${highlightBg(r.changeinOpenInterest_PE, "PE")}`}>
                  {r.changeinOpenInterest_PE}
                </td>
                <td className={`py-3 px-3 ${cls(r.strikePrice, "PE")}`}>{r.openInterest_PE}</td>
                <td className={`py-3 px-3 ${cls(r.strikePrice, "PE")}`}>{r.totalTradedVolume_PE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
