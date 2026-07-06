"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccessControl } from "../../hooks/useAccessControl";

export default function StockList() {
  const { hasAccess, loading } = useAccessControl("/stocklist");

  const [stocks, setStocks] = useState([]);
  const [ltps, setLtps] = useState({});
  const [loadingLtp, setLoadingLtp] = useState(false);

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
    setLtps(cachedLtps);
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
      const symbols = enabledStocks.map((stock) => stock.symbol);

      const res = await fetch("/api/get-ltps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbols }),
      });

      const updatedLtps = await res.json();

      setLtps((prev) => {
        const merged = { ...prev, ...updatedLtps };
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

      const ltp = ltps[stock.symbol];
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

  if (loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="max-w-screen-xl mx-auto p-6 bg-white">
      <h2 className="text-3xl font-bold text-center mb-6 text-blue-600">
        📋 Stock List
      </h2>

      <div className="flex justify-center mb-4">
        <button
          onClick={fetchLTPs}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded shadow cursor-pointer"
        >
          🔄 Refresh Prices
        </button>
      </div>

      {stocks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 border rounded-lg p-4">
            <div className="text-sm text-gray-500">Total Investment</div>
            <div className="text-2xl font-bold text-blue-600">
              ₹
              {portfolioSummary.totalInvestment.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>

          <div className="bg-green-50 border rounded-lg p-4">
            <div className="text-sm text-gray-500">Current Value</div>
            <div className="text-2xl font-bold text-green-600">
              ₹
              {portfolioSummary.totalCurrentValue.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>

          <div className="bg-yellow-50 border rounded-lg p-4">
            <div className="text-sm text-gray-500">Total Profit/Loss</div>
            <div
              className={`text-2xl font-bold ${
                portfolioSummary.totalProfitLoss >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              ₹
              {portfolioSummary.totalProfitLoss.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>

          <div className="bg-purple-50 border rounded-lg p-4">
            <div className="text-sm text-gray-500">Return %</div>
            <div
              className={`text-2xl font-bold ${
                Number(totalReturnPercent) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {totalReturnPercent}%
            </div>
          </div>
        </div>
      )}

      {loadingLtp && (
        <p className="text-center text-sm text-gray-500 mb-4">
          Fetching latest prices...
        </p>
      )}

      {stocks.length === 0 ? (
        <p className="text-center text-gray-500 mt-8 text-lg">
          No stocks added.
        </p>
      ) : (
        <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
          <table className="min-w-full text-sm text-center table-auto">
            <thead className="bg-blue-100 text-gray-700 uppercase text-xs">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Symbol</th>
                <th className="px-5 py-3">Enabled</th>
                <th className="px-5 py-3">LTP (₹)</th>
                <th className="px-5 py-3">Add Price (₹)</th>
                <th className="px-5 py-3">Change %</th>
                <th className="px-5 py-3">Investment (₹)</th>
                <th className="px-5 py-3">Current Value (₹)</th>
                <th className="px-5 py-3">Profit/Loss (₹)</th>
                <th className="px-5 py-3">Delete</th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-100">
              {stocks.map((stock, index) => {
                const ltp = ltps[stock.symbol];
                const validLtp = typeof ltp === "number" && !isNaN(ltp);

                const addPrice = Number(stock.addPrice) || 0;
                const investment = Number(stock.investment) || 0;

                const percent =
                  validLtp && addPrice > 0
                    ? (((ltp - addPrice) / addPrice) * 100).toFixed(2)
                    : "0.00";

                const qty = addPrice > 0 ? investment / addPrice : 0;
                const currentValue = validLtp ? qty * ltp : 0;
                const profitLoss = currentValue - investment;

                return (
                  <tr
                    key={index}
                    className={`border-b border-gray-200 ${
                      stock.enabled === false ? "bg-gray-100" : "bg-green-50"
                    } hover:bg-gray-100`}
                  >
                    <td className="px-5 py-3">{stock.date}</td>

                    <td className="px-5 py-3 font-medium">{stock.symbol}</td>

                    <td className="px-5 py-3">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={stock.enabled !== false}
                          onChange={(e) =>
                            toggleEnabled(index, e.target.checked)
                          }
                          className="h-5 w-5 accent-blue-600 cursor-pointer"
                        />
                        <span className="ml-2 text-xs font-semibold">
                          {stock.enabled === false ? "Disabled" : "Enabled"}
                        </span>
                      </label>
                    </td>

                    <td className="px-5 py-3">
                      ₹{validLtp ? ltp.toFixed(2) : "..."}
                    </td>

                    <td className="px-5 py-3">₹{addPrice}</td>

                    <td
                      className={`px-5 py-3 font-semibold ${
                        Number(percent) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {percent}%
                    </td>

                    <td className="px-5 py-3">
                      <input
                        type="number"
                        min="0"
                        value={stock.investment || ""}
                        onChange={(e) => updateInvestment(index, e.target.value)}
                        placeholder="Amount"
                        className="border rounded px-2 py-1 w-28 text-center"
                      />
                    </td>

                    <td className="px-5 py-3 font-semibold">
                      ₹
                      {currentValue.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </td>

                    <td
                      className={`px-5 py-3 font-semibold ${
                        profitLoss >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      ₹
                      {profitLoss.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </td>

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