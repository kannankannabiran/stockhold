"use client";

import React, { useEffect, useState, useRef } from "react";
import { FaSitemap } from "react-icons/fa";

const indexOptions = ["NIFTY", "BANKNIFTY", "RELIANCE", "ITC", "HDFCBANK", "MANAPPURAM", "KALYANKJIL"];

export default function OptionChain() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [rows, setRows] = useState([]);
  const [atm, setAtm] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const [topCEOi, setTopCEOi] = useState([]);
  const [topPEOi, setTopPEOi] = useState([]);
  const [topCEDiff, setTopCEDiff] = useState([]);
  const [topPEDiff, setTopPEDiff] = useState([]);
  const [minCEDiff, setMinCEDiff] = useState(null);
  const [minPEDiff, setMinPEDiff] = useState(null);
  const [buySignalStrike, setBuySignalStrike] = useState(null);
  const [sellSignalStrike, setSellSignalStrike] = useState(null);

  const getBuySignalStrike = (filtered) => {
    const minOI = Math.min(...filtered.map(r => r.openInterest));
    const minChangeOI = Math.min(...filtered.map(r => r.changeinOpenInterest));
    return filtered.find(
      r => r.openInterest === minOI && r.changeinOpenInterest === minChangeOI
    )?.strikePrice || null;
  };

  const getSellSignalStrike = (filtered) => {
    const minOI = Math.min(...filtered.map(r => r.openInterest_PE));
    const minChangeOI = Math.min(...filtered.map(r => r.changeinOpenInterest_PE));
    return filtered.find(
      r => r.openInterest_PE === minOI && r.changeinOpenInterest_PE === minChangeOI
    )?.strikePrice || null;
  };

  const fetchData = async (sym) => {
    try {
      const res = await fetch(`/api/option-chain?symbol=${sym}`);
      const data = await res.json();
      if (!Array.isArray(data)) return setError("API error");

      const atmStrike = data[Math.floor(data.length / 2)]?.strikePrice || null;
      setAtm(atmStrike);

      const atmIndex = data.findIndex(r => r.strikePrice === atmStrike);
      const filtered = data.slice(Math.max(0, atmIndex - 1), atmIndex + 2);
      setRows(filtered);

      const sortedCE = [...filtered].sort((a, b) => b.openInterest - a.openInterest).slice(0, 3);
      const sortedPE = [...filtered].sort((a, b) => b.openInterest_PE - a.openInterest_PE).slice(0, 3);
      const sortedCEDiff = [...filtered].sort((a, b) => b.changeinOpenInterest - a.changeinOpenInterest).slice(0, 3);
      const sortedPEDiff = [...filtered].sort((a, b) => b.changeinOpenInterest_PE - a.changeinOpenInterest_PE).slice(0, 3);

      setTopCEOi(sortedCE.map(r => r.openInterest));
      setTopPEOi(sortedPE.map(r => r.openInterest_PE));
      setTopCEDiff(sortedCEDiff.map(r => r.changeinOpenInterest));
      setTopPEDiff(sortedPEDiff.map(r => r.changeinOpenInterest_PE));

      setMinCEDiff(Math.min(...filtered.map(r => r.changeinOpenInterest)));
      setMinPEDiff(Math.min(...filtered.map(r => r.changeinOpenInterest_PE)));

      setBuySignalStrike(getBuySignalStrike(filtered));
      setSellSignalStrike(getSellSignalStrike(filtered));
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

  const highlightOI = (value, side) => {
    const list = side === "CE" ? topCEOi : topPEOi;
    if (value === list[0]) return "bg-green-200 font-bold text-green-900";
    if (value === list[1]) return "bg-green-100 font-semibold text-green-800";
    if (value === list[2]) return "bg-green-50 text-green-700";
    return "";
  };

  const highlightDiff = (value, side) => {
    const list = side === "CE" ? topCEDiff : topPEDiff;
    const min = side === "CE" ? minCEDiff : minPEDiff;

    if (value === list[0]) return "bg-blue-200 font-bold text-blue-900";
    if (value === list[1]) return "bg-blue-100 font-semibold text-blue-800";
    if (value === list[2]) return "bg-blue-50 text-blue-700";
    if (value === min) return "bg-red-200 text-red-800 font-semibold";
    return "";
  };

  return (
    <div className="p-6 md:p-8 max-w-screen-md mx-auto bg-white rounded-lg">
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
                <td className="py-3 px-3">{r.totalTradedVolume}</td>
                <td className={`py-3 px-3 ${highlightOI(r.openInterest, "CE")}`}>{r.openInterest}</td>
                <td className={`py-3 px-3 ${highlightDiff(r.changeinOpenInterest, "CE")}`}>{r.changeinOpenInterest}</td>
                <td className="py-3 px-3">{r.lastPrice}</td>
                <td
                  className={`py-3 px-3 font-medium 
                    ${r.strikePrice === atm ? "bg-yellow-200" : ""} 
                    ${r.strikePrice === buySignalStrike ? "font-bold" : ""}
                    ${r.strikePrice === sellSignalStrike ? "font-bold" : ""}
                  `}
                >
                  <>
                    {r.strikePrice}
                    {r.strikePrice === buySignalStrike && (
                      <span className="ml-1 text-green-700">✅</span>
                    )}
                    {r.strikePrice === sellSignalStrike && (
                      <span className="ml-1 text-red-700">❌</span>
                    )}
                  </>
                </td>
                <td className="py-3 px-3">{r.lastPrice_PE}</td>
                <td className={`py-3 px-3 ${highlightDiff(r.changeinOpenInterest_PE, "PE")}`}>{r.changeinOpenInterest_PE}</td>
                <td className={`py-3 px-3 ${highlightOI(r.openInterest_PE, "PE")}`}>{r.openInterest_PE}</td>
                <td className="py-3 px-3">{r.totalTradedVolume_PE}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
