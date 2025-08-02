"use client";

import React, { useEffect, useState } from "react";
import Select from "react-select";
import axios from "axios";
import { useAccessControl } from "../../hooks/useAccessControl";
import stocklist from "../symbol/data";
import TradingViewChart from "./LightWeightChartWithIndicators";

const periodOptions = [
  { label: "1 Month", value: "1mo" },
  { label: "3 Months", value: "3mo" },
  { label: "6 Months", value: "6mo" },
  { label: "1 Year", value: "1y" },
  { label: "5 Years", value: "5y" },
  { label: "10 Years", value: "10y" },
  { label: "15 Years", value: "15y" },
  { label: "20 Years", value: "20y" },
];

export default function ChartPage() {
  const { hasAccess, loading } = useAccessControl('/chart');
  
  const [selectedStock, setSelectedStock] = useState(
    stocklist.find((s) => s.value === "RELIANCE.NS")
  );
  const [selectedPeriod, setSelectedPeriod] = useState(
    periodOptions.find((p) => p.value === "1y")
  );
  const [chartData, setChartData] = useState([]);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setShowSuggestions(true);
    setActiveIndex(-1);

    const filtered = stocklist.filter((stock) =>
      stock.label.toLowerCase().includes(val.toLowerCase())
    );
    setSuggestions(filtered.slice(0, 10));
  };

  const handleSuggestionClick = (stock) => {
    setSelectedStock(stock);
    setQuery(""); // ✅ clear input
    setShowSuggestions(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      setActiveIndex((prev) =>
        Math.min(prev + 1, suggestions.length - 1)
      );
    } else if (e.key === "ArrowUp") {
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      handleSuggestionClick(suggestions[activeIndex]);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedStock) return;
      try {
        const res = await axios.get("/api/chart-data", {
          params: {
            symbol: selectedStock.value,
            interval: "1d",
            period: selectedPeriod.value,
            t: Date.now(),
          },
        });
        setChartData(res.data);
      } catch (err) {
        console.error("Error fetching chart data:", err);
      }
    };
    fetchData();
  }, [selectedStock, selectedPeriod]);

  if (loading) return <div>Loading...</div>;
  if (!hasAccess) return null;

  return (
    <div className="p-5">
      <h4 className="text-xl font-semibold mb-4">Chart</h4>

      <div className="flex flex-row flex-wrap items-center gap-4 mb-6 w-full max-w-3xl">
        {/* Symbol Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            className="border border-gray-300 px-4 py-2 rounded w-full"
            placeholder="Search Symbol"
            value={query}
            onChange={handleInputChange}
            onClick={() => {
              setQuery("");
              setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 bg-white border border-gray-300 rounded shadow-md z-50 w-full max-h-60 overflow-y-auto">
              {suggestions.map((stock, index) => (
                <div
                  key={stock.value}
                  className={`px-4 py-2 cursor-pointer ${
                    index === activeIndex
                      ? "bg-blue-100"
                      : "hover:bg-gray-100"
                  }`}
                  onClick={() => handleSuggestionClick(stock)}
                >
                  {stock.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Period Dropdown */}
        <div className="flex-1 min-w-[200px] z-3">
          <Select
            options={periodOptions}
            value={selectedPeriod}
            onChange={(option) => setSelectedPeriod(option)}
            placeholder="Select Period"
          />
        </div>
      </div>

      {/* Chart */}
      <div>
        <TradingViewChart data={chartData} />
      </div>
    </div>
  );
}
