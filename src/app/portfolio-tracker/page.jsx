"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAccessControl } from "../../hooks/useAccessControl";
import stocklist from "@/app/symbol/data";

export default function StockList() {
  const { hasAccess, loading } = useAccessControl("/stocklist");

  const [stocks, setStocks] = useState([]);
  const [ltps, setLtps] = useState({});
  const [loadingLtp, setLoadingLtp] = useState(false);

  // Manual stock add states
  const [showAddForm, setShowAddForm] = useState(false);
  const [symbolInput, setSymbolInput] = useState("");
  const [addPriceInput, setAddPriceInput] = useState("");
  const [investmentInput, setInvestmentInput] = useState("");
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const suggestionRef = useRef(null);

  // Helper to remove .NS for clean display
  const cleanSymbol = (sym) => {
    if (!sym) return "";
    return sym.replace(/\.NS$/i, "").trim().toUpperCase();
  };

  // Helper to ensure symbol has .NS for backend API calls
  const formatBackendSymbol = (sym) => {
    if (!sym) return "";
    let formatted = sym.trim().toUpperCase();
    if (!formatted.endsWith(".NS")) {
      formatted += ".NS";
    }
    return formatted;
  };

  function generateUUID() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  useEffect(() => {
    let browserId = localStorage.getItem("browserId");

    if (!browserId) {
      browserId = generateUUID();
      localStorage.setItem("browserId", browserId);
    }
  }, []);

  // Handle clicking outside suggestions dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getBrowserId = () => localStorage.getItem("browserId");

  const syncStockListToServer = useCallback(async (list) => {
    try {
      await fetch("/api/save-scan-data-stock-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          browserId: getBrowserId(),
          stockList: list,
        }),
      });
    } catch (error) {
      console.error("Failed to sync stock list:", error);
    }
  }, []);

  const normalizeStocks = (list) =>
    Array.isArray(list)
      ? list.map((stock) => ({
          ...stock,
          symbol: formatBackendSymbol(stock.symbol), // Ensure stored symbol has .NS for backend lookup
          enabled: stock.enabled !== false,
        }))
      : [];

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("stockList") || "[]");
    const normalized = normalizeStocks(saved);

    setStocks(normalized);
    localStorage.setItem("stockList", JSON.stringify(normalized));
    syncStockListToServer(normalized);

    const cachedLtps = JSON.parse(localStorage.getItem("ltpCache") || "{}");
    const normalizedCache = {};
    Object.keys(cachedLtps).forEach((k) => {
      normalizedCache[k] = cachedLtps[k];
      normalizedCache[cleanSymbol(k)] = cachedLtps[k];
    });
    setLtps(normalizedCache);
  }, [syncStockListToServer]);

  useEffect(() => {
    if (stocks.length === 0) {
      fetch(`/api/load-scan-data-stock-list?browserId=${getBrowserId()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.stockList?.length) {
            const normalized = normalizeStocks(data.stockList);
            localStorage.setItem("stockList", JSON.stringify(normalized));
            setStocks(normalized);
            syncStockListToServer(normalized);
          }
        })
        .catch(console.error);
    }
  }, [stocks, syncStockListToServer]);

  const fetchLTPs = useCallback(async () => {
    if (stocks.length === 0) return;

    const enabledStocks = stocks.filter((stock) => stock.enabled !== false);
    if (enabledStocks.length === 0) return;

    setLoadingLtp(true);

    try {
      // Send symbols with .NS to backend API
      const symbolsToSend = enabledStocks.map((stock) => formatBackendSymbol(stock.symbol));

      const res = await fetch("/api/get-ltps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbols: symbolsToSend }),
      });

      const updatedLtps = await res.json();

      // Store LTPs mapped by both full symbol and clean symbol for bulletproof lookup
      const mappedLtps = {};
      if (updatedLtps && typeof updatedLtps === "object") {
        Object.keys(updatedLtps).forEach((k) => {
          mappedLtps[k] = updatedLtps[k];
          mappedLtps[cleanSymbol(k)] = updatedLtps[k];
          mappedLtps[formatBackendSymbol(k)] = updatedLtps[k];
        });
      }

      setLtps((prev) => {
        const merged = { ...prev, ...mappedLtps };
        localStorage.setItem("ltpCache", JSON.stringify(merged));
        return merged;
      });
    } catch (error) {
      console.error("Error fetching LTPs:", error);
    }

    setLoadingLtp(false);
  }, [stocks]);

  useEffect(() => {
    if (stocks.length > 0) {
      fetchLTPs();
    }
  }, [stocks, fetchLTPs]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLTPs();
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchLTPs]);

  const handleSymbolChange = (e) => {
    const value = e.target.value.toUpperCase();
    setSymbolInput(value);

    if (value.trim().length > 0) {
      const filtered = stocklist.filter((item) =>
        item.value.toUpperCase().includes(value.trim()) ||
        item.label.toUpperCase().includes(value.trim())
      );
      setFilteredSuggestions(filtered);
      setShowSuggestions(true);
    } else {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (item) => {
    setSymbolInput(cleanSymbol(item.value));
    setShowSuggestions(false);
  };

  const handleAddStock = (e) => {
    e.preventDefault();
    if (!symbolInput.trim()) return;

    const currentDate = new Date().toISOString().split("T")[0];

    const newStock = {
      date: currentDate,
      symbol: formatBackendSymbol(symbolInput), // Ensures .NS is automatically added for backend API/LTP fetching
      addPrice: Number(addPriceInput) || 0,
      investment: Number(investmentInput) || 0,
      enabled: true,
    };

    const updated = [newStock, ...stocks];
    setStocks(updated);
    localStorage.setItem("stockList", JSON.stringify(updated));
    syncStockListToServer(updated);

    // Reset Form Fields
    setSymbolInput("");
    setAddPriceInput("");
    setInvestmentInput("");
    setShowAddForm(false);
    setShowSuggestions(false);
  };

  const updateInvestment = (index, value) => {
    const updated = [...stocks];

    updated[index] = {
      ...updated[index],
      investment: Number(value) || 0,
      enabled: updated[index].enabled !== false,
    };

    setStocks(updated);
    localStorage.setItem("stockList", JSON.stringify(updated));
    syncStockListToServer(updated);
  };

  const deleteStock = (index) => {
    const updated = [...stocks];
    updated.splice(index, 1);

    setStocks(updated);
    localStorage.setItem("stockList", JSON.stringify(updated));
    syncStockListToServer(updated);
  };

  const toggleEnabled = (index, checked) => {
    const updated = [...stocks];

    updated[index] = {
      ...updated[index],
      enabled: checked,
    };

    setStocks(updated);
    localStorage.setItem("stockList", JSON.stringify(updated));
    syncStockListToServer(updated);
  };

  const portfolioSummary = stocks.reduce(
    (acc, stock) => {
      if (stock.enabled === false) return acc;

      const ltp = ltps[stock.symbol] !== undefined ? ltps[stock.symbol] : ltps[cleanSymbol(stock.symbol)];
      const validLtp = typeof ltp === "number" && !isNaN(ltp);

      const addPrice = Number(stock.addPrice) || 0;
      const investment = Number(stock.investment) || 0;

      const qty = addPrice > 0 ? investment / addPrice : 0;
      const currentValue = validLtp ? qty * ltp : 0;
      const profitLoss = currentValue - investment;

      acc.totalInvestment += investment;
      acc.totalCurrentValue += currentValue;
      acc.totalProfitLoss += profitLoss;

      return acc;
    },
    {
      totalInvestment: 0,
      totalCurrentValue: 0,
      totalProfitLoss: 0,
    }
  );

  const totalReturnPercent =
    portfolioSummary.totalInvestment > 0
      ? (
          (portfolioSummary.totalProfitLoss /
            portfolioSummary.totalInvestment) *
          100
        ).toFixed(2)
      : "0.00";

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gray-50 w-full">
      <div className="text-lg font-medium text-gray-500 animate-pulse">Loading Dashboard...</div>
    </div>
  );
  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 font-sans w-full">
      <div className="w-full space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              Portfolio Tracker
            </h2>
            <p className="text-sm text-gray-500 mt-1">Manage and track your stock investments</p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {showAddForm ? "Cancel" : "Add Stock Manually"}
            </button>

            <button
              onClick={fetchLTPs}
              disabled={loadingLtp}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-5 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <svg className={`w-4 h-4 ${loadingLtp ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {loadingLtp ? 'Refreshing...' : 'Refresh Prices'}
            </button>
          </div>
        </div>

        {/* Manual Add Form Drawer with Autocomplete */}
        {showAddForm && (
          <form onSubmit={handleAddStock} className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end animate-fadeIn w-full">
            <div className="relative" ref={suggestionRef}>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Symbol</label>
              <input
                type="text"
                required
                placeholder="e.g. RELIANCE"
                value={symbolInput}
                onChange={handleSymbolChange}
                onFocus={() => {
                  if (symbolInput.trim().length > 0) setShowSuggestions(true);
                }}
                className="w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-emerald-600 text-sm uppercase"
                autoComplete="off"
              />
              {showSuggestions && filteredSuggestions.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg text-sm">
                  {filteredSuggestions.map((item, idx) => (
                    <li
                      key={idx}
                      onClick={() => handleSelectSuggestion(item)}
                      className="px-3 py-2 cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 font-medium text-gray-700 transition-colors border-b border-gray-50 last:border-none flex justify-between items-center"
                    >
                      <span>{cleanSymbol(item.value)}</span>
                      <span className="text-xs text-gray-400">{item.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Add Price (₹)</label>
              <input
                type="number"
                step="any"
                min="0"
                required
                placeholder="0.00"
                value={addPriceInput}
                onChange={(e) => setAddPriceInput(e.target.value)}
                className="w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-emerald-600 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Investment (₹)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={investmentInput}
                onChange={(e) => setInvestmentInput(e.target.value)}
                className="w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-emerald-600 text-sm"
              />
            </div>
            <div>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm py-2 px-4 rounded-md shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                Save Stock
              </button>
            </div>
          </form>
        )}

        {/* Summary Cards */}
        {stocks.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center">
              <div className="text-sm font-medium text-gray-500 mb-1">Total Investment</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{portfolioSummary.totalInvestment.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center">
              <div className="text-sm font-medium text-gray-500 mb-1">Current Value</div>
              <div className="text-2xl font-bold text-gray-900">
                ₹{portfolioSummary.totalCurrentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center">
              <div className="text-sm font-medium text-gray-500 mb-1">Total Profit/Loss</div>
              <div className={`text-2xl font-bold ${portfolioSummary.totalProfitLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {portfolioSummary.totalProfitLoss >= 0 ? "+" : "-"}₹{Math.abs(portfolioSummary.totalProfitLoss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center">
              <div className="text-sm font-medium text-gray-500 mb-1">Total Return</div>
              <div className="flex items-center gap-1">
                <div className={`text-2xl font-bold ${Number(totalReturnPercent) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {Number(totalReturnPercent) > 0 ? "+" : ""}{totalReturnPercent}%
                </div>
                {Number(totalReturnPercent) !== 0 && (
                  <svg className={`w-5 h-5 ${Number(totalReturnPercent) >= 0 ? "text-emerald-500" : "text-rose-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={Number(totalReturnPercent) >= 0 ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                  </svg>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Table Section */}
        {stocks.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center w-full">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No stocks found</h3>
            <p className="mt-1 text-sm text-gray-500">You haven't added any stocks to your list yet. Use the "Add Stock Manually" button above.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden w-full">
            <div className="overflow-x-auto w-full">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {["Date", "Symbol", "Status", "LTP (₹)", "Avg Price", "Change", "Investment", "Current Value", "P&L", ""].map((header, i) => (
                      <th key={i} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {stocks.map((stock, index) => {
                    const ltp = ltps[stock.symbol] !== undefined ? ltps[stock.symbol] : ltps[cleanSymbol(stock.symbol)];
                    const validLtp = typeof ltp === "number" && !isNaN(ltp);

                    const addPrice = Number(stock.addPrice) || 0;
                    const investment = Number(stock.investment) || 0;

                    const percent = validLtp && addPrice > 0
                      ? (((ltp - addPrice) / addPrice) * 100).toFixed(2)
                      : "0.00";

                    const qty = addPrice > 0 ? investment / addPrice : 0;
                    const currentValue = validLtp ? qty * ltp : 0;
                    const profitLoss = currentValue - investment;
                    const isEnabled = stock.enabled !== false;

                    return (
                      <tr 
                        key={index} 
                        className={`transition-colors hover:bg-gray-50 ${!isEnabled ? 'opacity-60 bg-gray-50/50' : ''}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                          {stock.date}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-bold text-gray-900">{cleanSymbol(stock.symbol)}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleEnabled(index, !isEnabled)}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${isEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                            role="switch"
                            aria-checked={isEnabled}
                          >
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isEnabled ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                          {validLtp ? `₹${ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                          ₹{addPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap font-medium ${Number(percent) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {Number(percent) > 0 ? "+" : ""}{percent}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="relative rounded-md shadow-sm max-w-[140px]">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                              <span className="text-gray-500 sm:text-sm">₹</span>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={stock.investment || ""}
                              onChange={(e) => updateInvestment(index, e.target.value)}
                              className="block w-full rounded-md border-0 py-1.5 pl-7 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 transition-shadow"
                              placeholder="0.00"
                              disabled={!isEnabled}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                          ₹{currentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap font-bold ${profitLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {profitLoss >= 0 ? "+" : "-"}₹{Math.abs(profitLoss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => deleteStock(index)}
                            className="text-gray-400 hover:text-rose-600 transition-colors focus:outline-none rounded p-1 hover:bg-rose-50"
                            title="Delete Stock"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}