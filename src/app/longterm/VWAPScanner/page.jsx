"use client";

import React, { useState } from "react";
import { useVwapScanContext } from "../hooks/page"; // Ensure this path is correct for your project
import { FaChartLine, FaExternalLinkAlt, FaFileExcel, FaFileCsv } from "react-icons/fa";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function SwingScanner() {
  const { results, loading, scanning, handleScan, cancelScan } = useVwapScanContext();
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
    <main className="min-h-screen w-full bg-[#f8f9fa] px-2 py-5 text-slate-800 sm:px-4 lg:px-6">
      
      {/* Loading Overlay */}
      {loading && !results?.isScanning && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex flex-col items-center justify-center z-50">
          <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center space-y-5 w-80 border border-slate-100">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
            </div>
            <div className="text-center">
              <p className="text-slate-800 font-bold text-lg">Fetching Data</p>
              <p className="text-slate-500 font-medium text-sm mt-1">Please wait while we load the scanner...</p>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full space-y-5">
        
        {/* Unified Header & Controls */}
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm">
                <FaChartLine className="text-lg" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                  Long Term Scanner
                </h1>
                <p className="mt-0.5 text-sm font-medium text-slate-500">
                  VWAP trend tracking and cross-over analysis
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors shadow-sm select-none">
                <input
                  type="checkbox"
                  checked={includeOld}
                  onChange={() => setIncludeOld((prev) => !prev)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                Include Previous Data
              </label>

              <button
                onClick={exportToExcel}
                disabled={filteredResults.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaFileExcel className="text-emerald-600" /> Excel
              </button>

              <button
                onClick={exportToCSV}
                disabled={filteredResults.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FaFileCsv className="text-amber-500" /> CSV
              </button>

              <button
                onClick={handleScan}
                disabled={loading}
                className={`inline-flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-bold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  scanning
                    ? "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
                    : "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
                }`}
              >
                {loading ? "Loading..." : scanning ? "Refresh Data" : "Scan Markets"}
              </button>
            </div>
          </div>
        </header>

        {/* Active Scanning Progress Banner */}
        {scanning && (
          <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-4 border-blue-200"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                </div>
                <div>
                  <h3 className="font-bold text-blue-900 text-base">Background Scan in Progress</h3>
                  <p className="text-blue-700 text-sm font-medium mt-0.5">Showing last completed scan results. You can continue browsing.</p>
                </div>
              </div>
              <button
                onClick={cancelScan}
                className="w-full sm:w-auto px-5 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-bold rounded-lg transition-colors shadow-sm flex-shrink-0"
              >
                Stop Polling
              </button>
            </div>

            {results?.scanProgress?.total > 0 && (
              <div className="mt-5 w-full max-w-2xl">
                <div className="flex justify-between text-xs font-bold text-blue-800 mb-2 uppercase tracking-wide">
                  <span>{results.scanProgress.current} / {results.scanProgress.total} Stocks Scanned</span>
                  <span>{Math.round((results.scanProgress.current / results.scanProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-blue-200/60 rounded-full h-2.5 overflow-hidden shadow-inner">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out relative"
                    style={{ width: `${Math.round((results.scanProgress.current / results.scanProgress.total) * 100)}%` }}
                  >
                    <div className="absolute top-0 right-0 bottom-0 left-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[progress_1s_linear_infinite]"></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty States */}
        {scanning && filteredResults.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-16 text-center w-full flex flex-col items-center justify-center">
             <div className="relative flex h-12 w-12 items-center justify-center mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
            </div>
            <p className="text-blue-600 font-bold text-lg animate-pulse">Scanning the markets...</p>
            <p className="text-slate-500 font-medium mt-1 text-sm">Results will appear here automatically once stocks are found.</p>
          </div>
        )}

        {!loading && !scanning && filteredResults.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-16 text-center w-full flex flex-col items-center justify-center">
            <svg className="h-12 w-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-lg font-bold text-slate-900">No VWAP trends found</h3>
            <p className="text-slate-500 font-medium mt-1 text-sm">Try running a new scan or including previous data to see results.</p>
          </div>
        )}

        {/* Data Tables Grouped by Month */}
        {Object.entries(groupedResults).length > 0 && (
          <div className="space-y-6">
            {Object.entries(groupedResults).map(([month, stocks]) => (
              <div key={month} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm w-full">
                
                {/* Group Header */}
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800">{month}</h2>
                  <span className="rounded-lg bg-white border border-slate-200 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-500 shadow-sm">
                    {stocks.length} {stocks.length === 1 ? 'Result' : 'Results'}
                  </span>
                </div>

                {/* Table */}
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[800px] border-collapse text-left font-sans text-[13px]">
                    <thead className="bg-white border-b border-slate-200">
                      <tr>
                        <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[5%]">#</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[25%]">Symbol</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[20%] text-right">VWAP Signal (₹)</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[20%] text-center">Signal Date</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[15%] text-center">Trend</th>
                        <th className="px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap w-[15%] text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {stocks.map((stock, index) => {
                        const cleanSymbol = stock.symbol.replace(".NS", "");
                        const isRise = stock.trend === "rise";
                        
                        return (
                          <tr key={`${month}-${index}`} className="transition-colors hover:bg-slate-50">
                            <td className="px-5 py-3.5 font-semibold text-slate-400">{index + 1}</td>
                            <td className="px-5 py-3.5 font-bold text-slate-900 text-sm">{cleanSymbol}</td>
                            <td className="px-5 py-3.5 font-bold text-slate-800 text-right">
                              ₹{Number(stock.current_year_vwap).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-5 py-3.5 font-medium text-slate-600 text-center">{stock.condition_date}</td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide border shadow-sm ${
                                isRise 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {isRise ? '↑ Rising' : '↓ Declining'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <button
                                onClick={() => handleOpenInTradingView(stock.symbol)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-600 shadow-sm transition-colors hover:bg-blue-50 hover:border-blue-200 focus:outline-none mx-auto"
                              >
                                <FaExternalLinkAlt /> View Chart
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}