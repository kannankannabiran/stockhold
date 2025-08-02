"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccessControl } from "../../hooks/useAccessControl";

export default function StockList() {
  const { hasAccess, loading } = useAccessControl('/stocklist');
  
  const [stocks, setStocks] = useState([]);
  const [ltps, setLtps] = useState({});
  const [loadingLtp, setLoadingLtp] = useState(false);

  // 🔑 Generate or get unique browser ID
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
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

  const getBrowserId = () => localStorage.getItem("browserId");

  // ⬆️ Save to server
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

  // ⬇️ Load from localStorage and sync to server
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("stockList") || "[]");
    setStocks(saved);
    syncStockListToServer(saved);

    const cachedLtps = JSON.parse(localStorage.getItem("ltpCache") || "{}");
    setLtps(cachedLtps);
  }, [syncStockListToServer]);

  // 🧠 Load from server if local empty
  useEffect(() => {
    if (stocks.length === 0) {
      fetch(`/api/load-scan-data-stock-list?browserId=${getBrowserId()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.stockList?.length) {
            localStorage.setItem("stockList", JSON.stringify(data.stockList));
            setStocks(data.stockList);
          }
        });
    }
  }, [stocks]);

  // 🔁 Fetch LTP
  const fetchLTPs = useCallback(async () => {
    if (stocks.length === 0) return;

    setLoadingLtp(true);
    const symbols = stocks.map((stock) => stock.symbol);

    try {
      const res = await fetch("/api/get-ltps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols }),
      });

      const updatedLtps = await res.json();
      setLtps(updatedLtps);
      localStorage.setItem("ltpCache", JSON.stringify(updatedLtps));
    } catch (error) {
      console.error("Error fetching LTPs:", error);
    }

    setLoadingLtp(false);
  }, [stocks]);

  useEffect(() => {
    if (stocks.length > 0) fetchLTPs();
  }, [stocks.length, fetchLTPs]);

  // 🔄 Auto-refresh every 1 min
  useEffect(() => {
    const interval = setInterval(() => {
      fetchLTPs();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchLTPs]);

  // ❌ Delete
  const deleteStock = (index) => {
    const updated = [...stocks];
    updated.splice(index, 1);
    localStorage.setItem("stockList", JSON.stringify(updated));
    setStocks(updated);
    syncStockListToServer(updated);
  };

  if (loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="max-w-screen-xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-center mb-6 text-blue-600">📋 Stock List</h2>

      <div className="flex justify-center mb-4">
        <button
          onClick={fetchLTPs}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded shadow cursor-pointer"
        >
          🔄 Refresh Prices
        </button>
      </div>

      {loadingLtp && (
        <p className="text-center text-sm text-gray-500 mb-4">Fetching latest prices...</p>
      )}

      {stocks.length === 0 ? (
        <p className="text-center text-gray-500 mt-8 text-lg">No stocks added.</p>
      ) : (
        <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
          <table className="min-w-full text-sm text-center table-auto">
            <thead className="bg-blue-100 text-gray-700 uppercase text-xs">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">LTP (₹)</th>
                <th className="px-5 py-3">Add Price (₹)</th>
                <th className="px-5 py-3">Change %</th>
                <th className="px-5 py-3">Delete</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {stocks.map((stock, index) => {
                const ltp = ltps[stock.symbol];
                const validLtp = typeof ltp === "number" && !isNaN(ltp);
                const percent = validLtp && stock.addPrice
                  ? (((ltp - stock.addPrice) / stock.addPrice) * 100).toFixed(2)
                  : "Loading...";
                const percentColor =
                  !isNaN(percent) && parseFloat(percent) > 0
                    ? "text-green-600"
                    : "text-red-600";

                return (
                  <tr key={index} className="bg-green-50 hover:bg-gray-100 border-b border-gray-200">
                    <td className="px-5 py-3">{stock.date}</td>
                    <td className="px-5 py-3 font-medium">{stock.symbol}</td>
                    <td className="px-5 py-3">₹{validLtp ? ltp.toFixed(2) : "..."}</td>
                    <td className="px-5 py-3">₹{stock.addPrice}</td>
                    <td className={`px-5 py-3 font-semibold ${percentColor}`}>{percent}%</td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => deleteStock(index)}
                        className="text-red-500 hover:text-red-700 cursor-pointer"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
