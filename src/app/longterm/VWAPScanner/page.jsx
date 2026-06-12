"use client";

import React, { useState, useEffect } from "react";
import { useVwapScanContext } from "../hooks/page";
import { FaChartLine, FaExternalLinkAlt, FaFileExcel, FaFileCsv } from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function SwingScanner() {
  const { results, loading, scanning, handleScan, cancelScan } = useVwapScanContext();
  const [addedSymbols, setAddedSymbols] = useState(new Set());
  const [includeOld, setIncludeOld] = useState(false);
  const [timeUntilReset, setTimeUntilReset] = useState("");

  // Countdown to next 09:15 AM reset using server-provided nextScanTime
  useEffect(() => {
    if (!results?.nextScanTime) return;

    const updateCountdown = () => {
      const now = new Date();
      const next = new Date(results.nextScanTime);
      const diff = next - now;
      if (diff <= 0) {
        setTimeUntilReset("00h 00m 00s");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeUntilReset(
        `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
      );
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [results?.nextScanTime]);

  // Format nextScanTime as "09:15 AM"
  const nextScanTimeLabel = results?.nextScanTime
    ? new Date(results.nextScanTime).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : results?.scanResetTime || "09:15 AM";

  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setMonth(today.getMonth() - 1);

  const allResults = Array.isArray(results?.rise) ? [...results.rise] : [];

  const filteredResults = allResults
    .filter((item) => {
      const date = new Date(item.condition_date);
      return includeOld || date >= oneMonthAgo;
    })
    .sort((a, b) => new Date(b.condition_date) - new Date(a.condition_date));

  useEffect(() => {
    const savedList = JSON.parse(localStorage.getItem("stockList") || "[]");
    const symbols = new Set(savedList.map((item) => item.symbol));
    setAddedSymbols(symbols);
  }, []);

  const groupByMonth = (data) => {
    const groups = {};
    data.forEach((item) => {
      const date = new Date(item.condition_date);
      const monthKey = `${date.toLocaleString("default", { month: "long" })} ${date.getFullYear()}`;
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(item);
    });
    return groups;
  };

  const groupedResults = groupByMonth(filteredResults);

  const handleAddStock = async (stock) => {
    const cleanSymbol = stock.symbol.replace(".NS", "");
    try {
      const res = await fetch("/api/get-ltps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [cleanSymbol] }),
      });
      const ltpData = await res.json();
      const ltp = ltpData[cleanSymbol];
      if (!ltp || isNaN(ltp)) return alert(`Failed to fetch LTP for ${cleanSymbol}`);

      const item = { symbol: cleanSymbol, date: today.toISOString().slice(0, 10), addPrice: ltp };
      const existing = JSON.parse(localStorage.getItem("stockList") || "[]");
      if (existing.some((e) => e.symbol === cleanSymbol)) return alert(`${cleanSymbol} already added.`);

      const updated = [...existing, item];
      localStorage.setItem("stockList", JSON.stringify(updated));
      setAddedSymbols(new Set([...addedSymbols, cleanSymbol]));
    } catch (error) {
      alert("Error fetching LTP.");
    }
  };

  const handleOpenInTradingView = (symbol) => {
    const tvSymbol = symbol.replace(".NS", "");
    window.open(`https://www.tradingview.com/chart/?symbol=${tvSymbol}`, "_blank");
  };

  const exportToExcel = () => {
    const data = filteredResults.map((s, i) => ({
      SNo: i + 1,
      Symbol: s.symbol.replace(".NS", ""),
      VWAP: s.current_year_vwap,
      "Signal Date": s.condition_date,
      Trend: s.trend,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "VWAP Scan");
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([excelBuffer], { type: "application/octet-stream" }), "Long_stocks.xlsx");
  };

  const exportToCSV = () => {
    const data = filteredResults.map((s, i) => ({
      SNo: i + 1,
      Symbol: s.symbol.replace(".NS", ""),
      VWAP: s.current_year_vwap,
      Signal_Date: s.condition_date,
      Trend: s.trend,
    }));
    const csv = [Object.keys(data[0]).join(","), ...data.map((row) => Object.values(row).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "Long_stocks.csv");
  };

  return (
    <div className="p-6 bg-white">
      {loading && !results?.isScanning && (
        <div className="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
          {/* Card container */}
          <div className="bg-gray-900 p-6 rounded-2xl shadow-lg flex flex-col items-center space-y-4 w-72">
            {/* Spinner */}
            <div className="relative">
              <div className="h-14 w-14 rounded-full border-4 border-gray-700 border-t-blue-500 animate-spin"></div>
            </div>

            {/* Loading text */}
            <p className="text-gray-200 font-medium">Loading scanner data...</p>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold flex items-center gap-2 justify-center text-blue-700 mb-6">
        <FaChartLine className="mr-2" />
        Long Term Scanner
      </h1>

      {scanning && (
        <div className="max-w-4xl mx-auto mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3 flex-1">
              <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin flex-shrink-0"></div>
              <div className="flex-1">
                <p className="text-blue-900 font-semibold text-sm">Background scan in progress...</p>
                <p className="text-blue-700 text-xs mt-0.5">Showing last completed scan results. You can browse the data normally.</p>
              </div>
            </div>
            <button
              onClick={cancelScan}
              className="w-full sm:w-auto px-4 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg transition-colors duration-150 flex-shrink-0"
            >
              Stop Polling
            </button>
          </div>

          {/* Progress bar */}
          {results?.scanProgress?.total > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-blue-700 mb-1 font-medium">
                <span>
                  {results.scanProgress.current} / {results.scanProgress.total} stocks scanned
                </span>
                <span>
                  {Math.round((results.scanProgress.current / results.scanProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.round((results.scanProgress.current / results.scanProgress.total) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-4 mb-4">
        <button
          onClick={handleScan}
          disabled={loading || results?.dailyLimitReached}
          className={`px-6 py-2 rounded font-semibold cursor-pointer transition-colors ${
            results?.dailyLimitReached
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : scanning
              ? "bg-blue-500 hover:bg-blue-600 text-white"
              : "bg-green-600 hover:bg-green-700 text-white"
          }`}
        >
          {loading ? "Loading..." : scanning ? "Refresh Data" : "Scan"}
        </button>

        {/* Daily run counter badge */}
        {results?.dayRunLimit > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-600">
            <span className={`h-2 w-2 rounded-full ${
              results.dailyLimitReached ? "bg-red-400" : "bg-green-400"
            }`} />
            {results.scanCount} / {results.dayRunLimit} scans today
          </div>
        )}

        <button
          onClick={exportToExcel}
          disabled={filteredResults.length === 0}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center cursor-pointer"
        >
          <FaFileExcel className="mr-2" /> Excel
        </button>

        <button
          onClick={exportToCSV}
          disabled={filteredResults.length === 0}
          className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 flex items-center cursor-pointer"
        >
          <FaFileCsv className="mr-2" /> CSV
        </button>

        <label className="flex items-center space-x-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={includeOld}
            onChange={() => setIncludeOld((prev) => !prev)}
          />
          <span>Include Previous Data</span>
        </label>
      </div>

      {/* Daily limit reached notice */}
      {results?.dailyLimitReached && (
        <div className="max-w-xl mx-auto mb-6 p-4 bg-amber-50 border border-amber-300 rounded-xl text-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <p className="font-semibold text-amber-800">
                Daily scan limit reached ({results.scanCount}/{results.dayRunLimit} run{results.dayRunLimit > 1 ? "s" : ""} today)
              </p>
              <p className="text-amber-700 text-xs mt-0.5">
                Next scan available at{" "}
                <span className="font-semibold">{nextScanTimeLabel}</span>
                {" "}&mdash; resets in{" "}
                <span className="font-mono font-bold">{timeUntilReset}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {Object.entries(groupedResults).length > 0 ? (
        Object.entries(groupedResults).map(([month, stocks]) => (
          <div key={month} className="mb-10">
            <h2 className="text-xl font-bold text-blue-700 mb-3 border-b pb-1">{month}</h2>
            <div className="overflow-x-auto shadow rounded border-gray-200">
              <table className="min-w-full text-sm text-left text-gray-700">
                <thead className="bg-blue-100">
                  <tr>
                    <th className="px-4 py-2">S.No</th>
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-4 py-2">Signal (₹)</th>
                    <th className="px-4 py-2">Signal Date</th>
                    <th className="px-4 py-2">Trend</th>
                    <th className="px-4 py-2">Add</th>
                    <th className="px-4 py-2">Chart</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock, index) => {
                    const cleanSymbol = stock.symbol.replace(".NS", "");
                    const alreadyAdded = addedSymbols.has(cleanSymbol);
                    const isRise = stock.trend === "rise";
                    return (
                      <tr key={`${month}-${index}`} className={isRise ? "bg-green-50" : "bg-red-50"}>
                        <td className="px-4 py-2">{index + 1}</td>
                        <td className="px-4 py-2 font-medium">{cleanSymbol}</td>
                        <td className="px-4 py-2">₹{stock.current_year_vwap}</td>
                        <td className="px-4 py-2">{stock.condition_date}</td>
                        <td className="px-4 py-2 font-semibold">
                          {isRise ? (
                            <span className="text-green-700">↑ Rising</span>
                          ) : (
                            <span className="text-red-700">↓ Declining</span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleAddStock(stock)}
                            disabled={alreadyAdded}
                            className={`px-3 py-1 rounded text-white ${
                              alreadyAdded
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-blue-600 hover:bg-blue-700 cursor-pointer"
                            }`}
                          >
                            {alreadyAdded ? "✅ Added" : "➕ Add"}
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleOpenInTradingView(stock.symbol)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded flex items-center cursor-pointer"
                          >
                            <FaExternalLinkAlt className="mr-1" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        !loading && !scanning && <p className="text-center text-gray-500 mt-6">No VWAP trend found.</p>
      )}

      {scanning && filteredResults.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mb-4"></div>
          <p className="text-blue-600 font-medium animate-pulse">Scanning for stocks... Results will appear here once found.</p>
        </div>
      )}
    </div>
  );
}