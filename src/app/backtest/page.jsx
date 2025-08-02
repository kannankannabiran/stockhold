"use client";

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { AiOutlineHistory } from "react-icons/ai";
import { useAccessControl } from "../../hooks/useAccessControl";

// Helper to clean symbol
const cleanSymbol = (symbol) => symbol.replace(/\.(NS|BO)$/i, "").trim();

// Debounce hook
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default function BacktestPage() {
  const { hasAccess, loading: accessLoading } = useAccessControl('/backtest');
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [search, setSearch] = useState("");

  const debouncedSearch = useDebounce(search, 300);

  const handleRunBacktest = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/backtest", { cache: "no-store" });
      const result = await response.json();
      setData(result.results || []);
      setLoadedFromServer(true);
    } catch (err) {
      console.error("Backtest failed:", err);
    }
    setLoading(false);
  };

  const loadPreviousResults = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/load-backtest");
      const result = await response.json();
      setData(result.results || []);
      setLoadedFromServer(true);
    } catch (err) {
      console.warn("No saved backtest data found.");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPreviousResults();
  }, []);

  const exportToExcel = () => {
    const rows = [];
    data.forEach((item) => {
      item.details.forEach((d) => {
        rows.push({
          Symbol: cleanSymbol(item.symbol),
          Year: d.year,
          "Start Date": d.start_date,
          "Start Price": d.start_price,
          "End Date": d.end_date,
          "End Price": d.end_price,
          "% Change": d.percent_change,
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Backtest");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, "VWAP_Backtest.xlsx");
  };

  const filteredData = data
    .filter((item) =>
      cleanSymbol(item.symbol).toLowerCase().includes(debouncedSearch.toLowerCase())
    )
    .slice(0, 50); // Speed: Limit to 50 results max

  if (accessLoading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="container mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold flex items-center gap-2 justify-center text-blue-700 mb-6">
        <AiOutlineHistory className="text-3xl" />
        Long Term Stocks Backtest
      </h2>

      {/* Search Bar */}
      <div className="mb-6 text-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by stock name"
          className="border border-gray-300 px-4 py-2 rounded shadow w-72 focus:outline-none focus:ring focus:border-blue-400"
        />
      </div>

      <div className="text-center mb-6 space-x-4">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold shadow cursor-pointer"
          onClick={handleRunBacktest}
        >
          Run Backtest
        </button>

        <button
          className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded font-semibold shadow cursor-pointer"
          onClick={loadPreviousResults}
        >
          Load Previous Results
        </button>

        {filteredData.length > 0 && (
          <button
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-semibold shadow cursor-pointer"
            onClick={exportToExcel}
          >
            Download Excel
          </button>
        )}
      </div>

      {loading && (
        <p className="text-center text-lg text-gray-600 mb-4">
          {loadedFromServer ? "Loading..." : "Running backtest..."}
        </p>
      )}

      {filteredData.length === 0 && !loading && (
        <p className="text-center text-gray-500 text-lg">No results found.</p>
      )}

      {filteredData.map((item) => (
        <div key={item.symbol} className="mb-10">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            {cleanSymbol(item.symbol)}{" "}
            <span className="text-sm text-gray-500">
              ({item.occurrences} matches)
            </span>
          </h3>

          <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
            <table className="min-w-full bg-white text-sm text-left">
              <thead className="bg-blue-100 text-gray-800 font-semibold uppercase">
                <tr>
                  <th className="px-5 py-3">Year</th>
                  <th className="px-5 py-3">Start Date</th>
                  <th className="px-5 py-3">Start Price</th>
                  <th className="px-5 py-3">End Date</th>
                  <th className="px-5 py-3">End Price</th>
                  <th className="px-5 py-3">% Change</th>
                </tr>
              </thead>
              <tbody>
                {item.details.map((d, i) => (
                  <tr
                    key={i}
                    className={
                      i % 2 === 0
                        ? "bg-green-50 hover:bg-gray-100 border-b border-gray-200"
                        : "bg-white hover:bg-gray-100 border-b border-gray-200"
                    }
                  >
                    <td className="px-5 py-3">{d.year}</td>
                    <td className="px-5 py-3">{d.start_date}</td>
                    <td className="px-5 py-3">₹{d.start_price}</td>
                    <td className="px-5 py-3">{d.end_date}</td>
                    <td className="px-5 py-3">₹{d.end_price}</td>
                    <td
                      className={`px-4 py-2 font-semibold ${
                        d.percent_change >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {d.percent_change}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
