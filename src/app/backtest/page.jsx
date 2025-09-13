"use client";

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { AiOutlineHistory } from "react-icons/ai";
import { useAccessControl } from "../../hooks/useAccessControl";

const cleanSymbol = (symbol) => symbol.replace(/\.(NS|BO)$/i, "").trim();

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function BacktestPage() {
  const { hasAccess, loading: accessLoading } = useAccessControl("/backtest");

  const [data, setData] = useState([]);
  const [lastRun, setLastRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showData, setShowData] = useState(false); // 🚀 control visibility

  const debouncedSearch = useDebounce(search, 300);

  const loadResults = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/load-backtest");
      const result = await response.json();
      setData(result.results || []);
      setLastRun(result.lastRun || null);
      setShowData(true); // 🚀 show data only after button click
    } catch (err) {
      console.warn("No saved backtest data found.");
    }
    setLoading(false);
  };

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
    .slice(0, 50);

  if (accessLoading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="container mx-auto px-4 py-6">
      <h2 className="text-2xl font-bold flex items-center gap-2 justify-center text-blue-700 mb-6">
        <AiOutlineHistory className="text-3xl" />
        Long Term Stocks Backtest
      </h2>

      {showData && lastRun && (
        <p className="text-center text-gray-500 mb-4">
          Last updated: {new Date(lastRun).toLocaleString()}
        </p>
      )}

      <div className="text-center mb-6 space-x-4">
        {!showData && (
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded font-semibold shadow cursor-pointer"
            onClick={loadResults}
          >
            Show Backtest Report
          </button>
        )}

        {showData && filteredData.length > 0 && (
          <>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by stock name"
              className="border border-gray-300 px-4 py-2 rounded shadow w-72 focus:outline-none focus:ring focus:border-blue-400 mr-4"
            />
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-semibold shadow cursor-pointer"
              onClick={exportToExcel}
            >
              Download Excel
            </button>
          </>
        )}
      </div>

      {loading && (
        <p className="text-center text-lg text-gray-600 mb-4">
          Loading saved report...
        </p>
      )}

      {showData && filteredData.length === 0 && !loading && (
        <p className="text-center text-gray-500 text-lg">No results found.</p>
      )}

      {showData &&
        filteredData.map((item) => (
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
