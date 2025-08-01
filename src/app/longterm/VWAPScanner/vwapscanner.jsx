"use client";

import React, { useContext, useState, useEffect } from "react";
import { ScanContext } from "../../context/SwingContext";
import { FaChartLine, FaExternalLinkAlt, FaFileExcel, FaFileCsv } from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function SwingScanner() {
  const { results, loading, scanning, handleScan, cancelScan } = useContext(ScanContext);
  const [addedSymbols, setAddedSymbols] = useState(new Set());
  const [includeOld, setIncludeOld] = useState(false);

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

  useEffect(() => {
    if (results?.rise?.length) {
      fetch("/api/save-scan-data-long-term", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(results),
      });
    }
  }, [results]);

  useEffect(() => {
    if (!results?.rise?.length) {
      fetch("/api/load-scan-data-long-term")
        .then((res) => res.json())
        .then((data) => {
          if (data?.rise?.length) {
            console.log("Loaded saved scan data from server:", data);
            // Optional: update context or local state here
          }
        });
    }
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
    saveAs(new Blob([excelBuffer], { type: "application/octet-stream" }), "VWAP_Scanner.xlsx");
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
    saveAs(blob, "VWAP_Scanner.csv");
  };

  return (
    <div className="p-6">
      {(loading || scanning) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
          <button className="bg-red-600 text-white px-4 py-2 rounded cursor-pointer" onClick={cancelScan}>
            Cancel Scan
          </button>
        </div>
      )}

      <h1 className="text-2xl font-bold flex items-center gap-2 justify-center text-blue-700 mb-6">
        <FaChartLine className="mr-2" />
        Swing VWAP Scanner
      </h1>

      <div className="flex flex-wrap justify-center gap-4 mb-6">
        <button
          onClick={handleScan}
          disabled={loading || scanning}
          className="bg-green-600 text-white px-6 py-2 rounded font-semibold hover:bg-green-700 cursor-pointer"
        >
          {loading || scanning ? "Scanning..." : "Scan"}
        </button>

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
        !loading && <p className="text-center text-gray-500 mt-6">No VWAP trend found.</p>
      )}
    </div>
  );
}
