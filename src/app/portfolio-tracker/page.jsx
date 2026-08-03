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
  const [qtyInput, setQtyInput] = useState(""); 
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // LTP Preview states
  const [previewLtp, setPreviewLtp] = useState(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);

  const suggestionRef = useRef(null);

  // Helper for clean display
  const cleanSymbol = (sym) => {
    if (!sym) return "";
    return sym.replace(/\.NS$/i, "").trim().toUpperCase();
  };

  // For Kite backend communication
  const formatBackendSymbol = (sym) => {
    if (!sym) return "";
    return sym.replace(/\.NS$/i, "").trim().toUpperCase();
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browserId: getBrowserId(), stockList: list }),
      });
    } catch (error) {
      console.error("Failed to sync stock list:", error);
    }
  }, []);

  const normalizeStocks = (list) =>
    Array.isArray(list)
      ? list.map((stock) => {
          let qty = stock.qty;
          if (qty === undefined && stock.investment !== undefined && stock.addPrice > 0) {
            qty = stock.investment / stock.addPrice;
          }
          return {
            ...stock,
            qty: Number(qty) || 0,
            symbol: formatBackendSymbol(stock.symbol),
            enabled: stock.enabled !== false,
          };
        })
      : [];

  const fetchLTPs = useCallback(async (listToFetch = stocks) => {
    if (listToFetch.length === 0) return;

    const enabledStocks = listToFetch.filter((stock) => stock.enabled !== false);
    if (enabledStocks.length === 0) return;

    setLoadingLtp(true);

    try {
      // Deduplicate symbols to save network payload
      const uniqueSymbols = [...new Set(enabledStocks.map((stock) => formatBackendSymbol(stock.symbol)))];

      const res = await fetch("/api/get-ltps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: uniqueSymbols }),
      });

      const updatedLtps = await res.json();
      const mappedLtps = {};
      
      if (updatedLtps && typeof updatedLtps === "object") {
        Object.keys(updatedLtps).forEach((k) => {
          const num = Number(updatedLtps[k]);
          if (!isNaN(num)) {
            mappedLtps[k] = num;
            mappedLtps[cleanSymbol(k)] = num;
          }
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

  const fetchPreviewLtp = async (sym) => {
    setFetchingPreview(true);
    try {
      const formatted = formatBackendSymbol(sym);
      const res = await fetch("/api/get-ltps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols: [formatted] }),
      });

      const data = await res.json();
      const ltp = data[formatted] || data[cleanSymbol(formatted)];
      
      if (ltp && !isNaN(Number(ltp))) {
        setPreviewLtp(Number(ltp));
        setAddPriceInput(Number(ltp)); 
      } else {
        setPreviewLtp(null);
      }
    } catch (e) {
      console.error("Error fetching preview LTP:", e);
      setPreviewLtp(null);
    }
    setFetchingPreview(false);
  };

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("stockList") || "[]");
    const normalized = normalizeStocks(saved);

    const cachedLtps = JSON.parse(localStorage.getItem("ltpCache") || "{}");
    const normalizedCache = {};
    Object.keys(cachedLtps).forEach((k) => {
      normalizedCache[k] = cachedLtps[k];
      normalizedCache[cleanSymbol(k)] = cachedLtps[k];
    });
    setLtps(normalizedCache);

    if (normalized.length > 0) {
      setStocks(normalized);
      syncStockListToServer(normalized);
      fetchLTPs(normalized);
    } else {
      fetch(`/api/load-scan-data-stock-list?browserId=${getBrowserId()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.stockList?.length) {
            const normalizedServer = normalizeStocks(data.stockList);
            localStorage.setItem("stockList", JSON.stringify(normalizedServer));
            setStocks(normalizedServer);
            syncStockListToServer(normalizedServer);
            fetchLTPs(normalizedServer);
          }
        })
        .catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLTPs(stocks);
    }, 60000);
    return () => clearInterval(interval);
  }, [stocks, fetchLTPs]);

  const handleSymbolChange = (e) => {
    const value = e.target.value.toUpperCase();
    setSymbolInput(value);
    setPreviewLtp(null);

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
    const sym = cleanSymbol(item.value);
    setSymbolInput(sym);
    setShowSuggestions(false);
    fetchPreviewLtp(sym); 
  };

  const handleAddStock = (e) => {
    e.preventDefault();
    if (!symbolInput.trim()) return;

    const currentDate = new Date().toISOString().split("T")[0];

    const newStock = {
      date: currentDate,
      symbol: formatBackendSymbol(symbolInput), 
      addPrice: Number(addPriceInput) || 0,
      qty: Number(qtyInput) || 0,
      enabled: true,
    };

    const updated = [newStock, ...stocks];
    setStocks(updated);
    localStorage.setItem("stockList", JSON.stringify(updated));
    syncStockListToServer(updated);

    fetchLTPs(updated);

    setSymbolInput("");
    setAddPriceInput("");
    setQtyInput("");
    setPreviewLtp(null);
    setShowAddForm(false);
    setShowSuggestions(false);
  };

  const updateQty = (index, value) => {
    const updated = [...stocks];
    updated[index] = {
      ...updated[index],
      qty: Number(value) || 0,
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

  const toggleGroupEnabled = (symbolToToggle, checked) => {
    const updated = stocks.map(stock => {
      if (cleanSymbol(stock.symbol) === symbolToToggle) {
        return { ...stock, enabled: checked };
      }
      return stock;
    });
    setStocks(updated);
    localStorage.setItem("stockList", JSON.stringify(updated));
    syncStockListToServer(updated);
  };

  const deleteGroup = (symbolToDelete) => {
    if (!confirm(`Are you sure you want to delete all lots for ${symbolToDelete}?`)) return;
    const updated = stocks.filter(stock => cleanSymbol(stock.symbol) !== symbolToDelete);
    setStocks(updated);
    localStorage.setItem("stockList", JSON.stringify(updated));
    syncStockListToServer(updated);
  };

  // --- Core Grouping Logic for the Table ---
  const groupedStocks = {};
  stocks.forEach((stock, index) => {
    const sym = cleanSymbol(stock.symbol);
    if (!groupedStocks[sym]) {
      groupedStocks[sym] = {
        symbol: stock.symbol,
        cleanSym: sym,
        lots: [],
        totalQty: 0,
        totalInvestment: 0,
      };
    }
    
    const isEnabled = stock.enabled !== false;
    const qty = Number(stock.qty) || 0;
    const addPrice = Number(stock.addPrice) || 0;

    groupedStocks[sym].lots.push({ ...stock, originalIndex: index, isEnabled });
    
    if (isEnabled) {
      groupedStocks[sym].totalQty += qty;
      groupedStocks[sym].totalInvestment += (qty * addPrice);
    }
  });

  Object.values(groupedStocks).forEach(group => {
    group.avgPrice = group.totalQty > 0 ? group.totalInvestment / group.totalQty : 0;
    group.isGroupEnabled = group.lots.some(lot => lot.isEnabled);
  });
  // -----------------------------------------

  const portfolioSummary = stocks.reduce(
    (acc, stock) => {
      if (stock.enabled === false) return acc;

      const ltp = ltps[stock.symbol] !== undefined ? ltps[stock.symbol] : ltps[cleanSymbol(stock.symbol)];
      const validLtp = typeof ltp === "number" && !isNaN(ltp);

      const addPrice = Number(stock.addPrice) || 0;
      const qty = Number(stock.qty) || 0;
      
      const investment = qty * addPrice;
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
      ? ((portfolioSummary.totalProfitLoss / portfolioSummary.totalInvestment) * 100).toFixed(2)
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
              onClick={() => fetchLTPs(stocks)}
              disabled={loadingLtp}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 px-5 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <svg className={`w-4 h-4 ${loadingLtp ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {loadingLtp ? 'Refreshing...' : 'Refresh Prices'}
            </button>
          </div>
        </div>

        {/* Manual Add Form Drawer */}
        {showAddForm && (
          <form onSubmit={handleAddStock} className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end animate-fadeIn w-full">
            <div className="relative" ref={suggestionRef}>
              <div className="flex justify-between items-end mb-1">
                <label className="block text-xs font-semibold text-gray-700 uppercase">Symbol</label>
                {fetchingPreview && <span className="text-xs font-semibold text-blue-500 animate-pulse">Fetching LTP...</span>}
                {!fetchingPreview && previewLtp !== null && (
                  <span className="text-xs font-bold text-emerald-600">LTP: ₹{previewLtp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                )}
              </div>
              <input
                type="text"
                required
                placeholder="e.g. RELIANCE"
                value={symbolInput}
                onChange={handleSymbolChange}
                onBlur={() => {
                  setTimeout(() => {
                    if (symbolInput.trim() && !showSuggestions && !previewLtp) {
                      fetchPreviewLtp(symbolInput);
                    }
                  }, 200);
                }}
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
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Buy Price (₹)</label>
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
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Quantity</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
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
                    {["Date", "Symbol", "Status", "LTP (₹)", "Buy / Avg Price", "Change", "Qty", "Current Value", "P&L", ""].map((header, i) => (
                      <th key={i} className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {Object.values(groupedStocks).map((group) => {
                    const ltp = ltps[group.symbol] !== undefined ? ltps[group.symbol] : ltps[group.cleanSym];
                    const validLtp = typeof ltp === "number" && !isNaN(ltp);

                    // If it's just a single lot, render normal row
                    if (group.lots.length === 1) {
                      const lot = group.lots[0];
                      const addPrice = Number(lot.addPrice) || 0;
                      const qty = Number(lot.qty) || 0;
                      const investment = qty * addPrice;

                      const percent = validLtp && addPrice > 0 ? (((ltp - addPrice) / addPrice) * 100).toFixed(2) : "0.00";
                      const currentValue = validLtp ? qty * ltp : 0;
                      const profitLoss = currentValue - investment;

                      return (
                        <tr key={lot.originalIndex} className={`transition-colors hover:bg-gray-50 ${!lot.isEnabled ? 'opacity-60 bg-gray-50/50' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500">{lot.date}</td>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="font-bold text-gray-900">{group.cleanSym}</div></td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleEnabled(lot.originalIndex, !lot.isEnabled)}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${lot.isEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                            >
                              <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${lot.isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{validLtp ? `₹${ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-600">₹{addPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className={`px-6 py-4 whitespace-nowrap font-medium ${Number(percent) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{Number(percent) > 0 ? "+" : ""}{percent}%</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="relative rounded-md shadow-sm max-w-[100px]">
                              <input
                                type="number" min="0" step="any"
                                value={lot.qty !== undefined ? lot.qty : ""}
                                onChange={(e) => updateQty(lot.originalIndex, e.target.value)}
                                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6 transition-shadow"
                                placeholder="0" disabled={!lot.isEnabled}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">₹{currentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className={`px-6 py-4 whitespace-nowrap font-bold ${profitLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{profitLoss >= 0 ? "+" : "-"}₹{Math.abs(profitLoss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button onClick={() => deleteStock(lot.originalIndex)} className="text-gray-400 hover:text-rose-600 transition-colors rounded p-1 hover:bg-rose-50"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </td>
                        </tr>
                      );
                    }

                    // --- If Multiple Lots, render Summary Row + Sub Rows ---
                    const avgPrice = group.avgPrice;
                    const groupPercent = validLtp && avgPrice > 0 ? (((ltp - avgPrice) / avgPrice) * 100).toFixed(2) : "0.00";
                    const groupCurrentValue = validLtp ? group.totalQty * ltp : 0;
                    const groupProfitLoss = groupCurrentValue - group.totalInvestment;

                    return (
                      <React.Fragment key={`group-${group.cleanSym}`}>
                        {/* Summary Row */}
                        <tr className={`bg-gray-100/50 border-t-2 border-gray-200 transition-colors ${!group.isGroupEnabled ? 'opacity-60 bg-gray-50/50' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500 font-medium">Multiple Buys</td>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="font-bold text-gray-900 text-base">{group.cleanSym}</div></td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleGroupEnabled(group.cleanSym, !group.isGroupEnabled)}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${group.isGroupEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                            >
                              <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${group.isGroupEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{validLtp ? `₹${ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : "—"}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-800 font-bold">Avg: ₹{avgPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className={`px-6 py-4 whitespace-nowrap font-bold ${Number(groupPercent) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{Number(groupPercent) > 0 ? "+" : ""}{groupPercent}%</td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">{group.totalQty}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-900">₹{groupCurrentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className={`px-6 py-4 whitespace-nowrap font-bold ${groupProfitLoss >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{groupProfitLoss >= 0 ? "+" : "-"}₹{Math.abs(groupProfitLoss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button onClick={() => deleteGroup(group.cleanSym)} className="text-gray-400 hover:text-rose-600 transition-colors rounded p-1 hover:bg-rose-50" title="Delete All"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </td>
                        </tr>
                        
                        {/* Individual Lot Rows */}
                        {group.lots.map((lot, idx) => {
                          const lotAddPrice = Number(lot.addPrice) || 0;
                          const lotQty = Number(lot.qty) || 0;
                          const lotInvestment = lotQty * lotAddPrice;
                          const lotPercent = validLtp && lotAddPrice > 0 ? (((ltp - lotAddPrice) / lotAddPrice) * 100).toFixed(2) : "0.00";
                          const lotCurrentValue = validLtp ? lotQty * ltp : 0;
                          const lotProfitLoss = lotCurrentValue - lotInvestment;

                          return (
                            <tr key={lot.originalIndex} className={`bg-white transition-colors hover:bg-gray-50 ${!lot.isEnabled ? 'opacity-50 bg-gray-50' : ''}`}>
                              <td className="px-6 py-3 whitespace-nowrap text-gray-400 pl-10 text-xs">↳ {lot.date}</td>
                              <td className="px-6 py-3 whitespace-nowrap text-gray-400 text-xs font-medium">Lot {idx + 1}</td>
                              <td className="px-6 py-3 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => toggleEnabled(lot.originalIndex, !lot.isEnabled)}
                                  className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${lot.isEnabled ? 'bg-blue-400' : 'bg-gray-200'}`}
                                >
                                  <span aria-hidden="true" className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${lot.isEnabled ? 'translate-x-3' : 'translate-x-0'}`} />
                                </button>
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap text-gray-300">—</td>
                              <td className="px-6 py-3 whitespace-nowrap text-gray-500 text-sm">₹{lotAddPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                              <td className={`px-6 py-3 whitespace-nowrap text-sm font-medium ${Number(lotPercent) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{Number(lotPercent) > 0 ? "+" : ""}{lotPercent}%</td>
                              <td className="px-6 py-3 whitespace-nowrap">
                                <div className="relative rounded-md shadow-sm max-w-[90px]">
                                  <input
                                    type="number" min="0" step="any"
                                    value={lot.qty !== undefined ? lot.qty : ""}
                                    onChange={(e) => updateQty(lot.originalIndex, e.target.value)}
                                    className="block w-full rounded-md border-0 py-1 px-2 text-gray-700 ring-1 ring-inset ring-gray-200 focus:ring-2 focus:ring-inset focus:ring-blue-500 text-sm transition-shadow"
                                    placeholder="0" disabled={!lot.isEnabled}
                                  />
                                </div>
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap text-gray-500 text-sm">₹{lotCurrentValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                              <td className={`px-6 py-3 whitespace-nowrap text-sm font-medium ${lotProfitLoss >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{lotProfitLoss >= 0 ? "+" : "-"}₹{Math.abs(lotProfitLoss).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                              <td className="px-6 py-3 whitespace-nowrap text-right">
                                <button onClick={() => deleteStock(lot.originalIndex)} className="text-gray-300 hover:text-rose-500 transition-colors rounded p-1 hover:bg-rose-50"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
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