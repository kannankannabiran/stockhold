"use client";

import React, { useEffect, useState, useRef } from "react";
import { FaSitemap } from "react-icons/fa";

const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];

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
    const minOI = Math.min(...filtered.map((r) => r.CE_oi));
    const minChangeOI = Math.min(...filtered.map((r) => r.CE_oiChange));
    return (
      filtered.find((r) => r.CE_oi === minOI && r.CE_oiChange === minChangeOI)
        ?.strike || null
    );
  };

  const getSellSignalStrike = (filtered) => {
    const minOI = Math.min(...filtered.map((r) => r.PE_oi));
    const minChangeOI = Math.min(...filtered.map((r) => r.PE_oiChange));
    return (
      filtered.find((r) => r.PE_oi === minOI && r.PE_oiChange === minChangeOI)
        ?.strike || null
    );
  };

  const fetchData = async (sym) => {
    try {
      setError(null);
      const res = await fetch(`/api/optionchain?index=${sym}`);
      const data = await res.json();

      if (!data || !Array.isArray(data.rows)) {
        setError("API error");
        return;
      }

      const rowsData = data.rows;
      const atmStrike = rowsData[Math.floor(rowsData.length / 2)]?.strike || null;
      setAtm(atmStrike);

      const atmIndex = rowsData.findIndex((r) => r.strike === atmStrike);
      const filtered = rowsData.slice(Math.max(0, atmIndex - 1), atmIndex + 2);
      setRows(filtered);

      const sortedCE = [...filtered].sort((a, b) => b.CE_oi - a.CE_oi).slice(0, 3);
      const sortedPE = [...filtered].sort((a, b) => b.PE_oi - a.PE_oi).slice(0, 3);
      const sortedCEDiff = [...filtered]
        .sort((a, b) => b.CE_oiChange - a.CE_oiChange)
        .slice(0, 3);
      const sortedPEDiff = [...filtered]
        .sort((a, b) => b.PE_oiChange - a.PE_oiChange)
        .slice(0, 3);

      setTopCEOi(sortedCE.map((r) => r.CE_oi));
      setTopPEOi(sortedPE.map((r) => r.PE_oi));
      setTopCEDiff(sortedCEDiff.map((r) => r.CE_oiChange));
      setTopPEDiff(sortedPEDiff.map((r) => r.PE_oiChange));

      setMinCEDiff(Math.min(...filtered.map((r) => r.CE_oiChange)));
      setMinPEDiff(Math.min(...filtered.map((r) => r.PE_oiChange)));

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

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
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
                <td className="py-3 px-3">{r.CE_vol}</td>
                <td className={`py-3 px-3 ${highlightOI(r.CE_oi, "CE")}`}>
                  {r.CE_oi}
                </td>
                <td className={`py-3 px-3 ${highlightDiff(r.CE_oiChange, "CE")}`}>
                  {r.CE_oiChange}
                </td>
                <td className="py-3 px-3">{r.CE_ltp}</td>
                <td
                  className={`py-3 px-3 font-medium
                    ${r.strike === atm ? "bg-yellow-200" : ""}
                    ${r.strike === buySignalStrike ? "font-bold" : ""}
                    ${r.strike === sellSignalStrike ? "font-bold" : ""}
                  `}
                >
                  <>
                    {r.strike}
                    {r.strike === buySignalStrike && (
                      <span className="ml-1 text-green-700">✅</span>
                    )}
                    {r.strike === sellSignalStrike && (
                      <span className="ml-1 text-red-700">❌</span>
                    )}
                  </>
                </td>
                <td className="py-3 px-3">{r.PE_ltp}</td>
                <td className={`py-3 px-3 ${highlightDiff(r.PE_oiChange, "PE")}`}>
                  {r.PE_oiChange}
                </td>
                <td className={`py-3 px-3 ${highlightOI(r.PE_oi, "PE")}`}>
                  {r.PE_oi}
                </td>
                <td className="py-3 px-3">{r.PE_vol}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}