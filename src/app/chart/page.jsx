"use client";

import React, { useEffect, useState } from "react";
import axios from "axios";
import { useAccessControl } from "../../hooks/useAccessControl"; // Adjust path as needed
import stocklist from "../symbol/data"; // Adjust path as needed
import TradingViewChart from "./LightWeightChartWithIndicators"; // Adjust path as needed
import { FiSearch, FiTrendingUp, FiPlus } from "react-icons/fi";

// ==========================================
// INDICATOR CATALOG
// ==========================================
const INDICATOR_CATALOG = [
  // Moving Averages 
  { type: "sma", period: 9, label: "SMA", color: '#0aa7f5' },
  { type: "ema", period: 9, label: "EMA", color: '#0aa7f5' },
  
  // Single VWAP Indicator (Anchor Session customizable in settings)
  { type: "vwap", session: "daily", label: "VWAP", color: '#8b5cf6' },
  
  // Trend
  { type: "supertrend", period: 10, multiplier: 3, label: "Supertrend", upColor: '#10b981', downColor: '#ef4444' },
  
  // Channels & Bands 
  { type: "bb", period: 20, multiplier: 2, label: "Bollinger Bands", upperColor: '#ef4444', middleColor: '#f59e0b', lowerColor: '#3b82f6' },
  { type: "donchian", period: 20, label: "Donchian Channels", upperColor: '#ef4444', middleColor: '#f59e0b', lowerColor: '#3b82f6' },
  { type: "keltner", period: 20, multiplier: 2, label: "Keltner Channels", upperColor: '#ef4444', middleColor: '#f59e0b', lowerColor: '#3b82f6' },
  { type: "envelope", period: 20, percent: 5, label: "MA Envelopes", upperColor: '#ef4444', middleColor: '#f59e0b', lowerColor: '#3b82f6' },
];

export default function ChartPage() {
  const { hasAccess, loading } = useAccessControl('/chart');
  
  const [selectedStock, setSelectedStock] = useState(
    stocklist.find((s) => s.value === "RELIANCE.NS") || stocklist[0]
  );
  const [chartData, setChartData] = useState([]);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Indicator State
  const [activeIndicators, setActiveIndicators] = useState([]);
  const [isIndicatorDropdownOpen, setIsIndicatorDropdownOpen] = useState(false);

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
    setQuery(""); 
    setShowSuggestions(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      handleSuggestionClick(suggestions[activeIndex]);
    }
  };

  const addIndicator = (config) => {
    const newIndicator = {
      ...config,
      id: `${config.type}-${Date.now()}`,
      visible: true
    };
    setActiveIndicators([...activeIndicators, newIndicator]);
    setIsIndicatorDropdownOpen(false);
  };

  // Automatically fetch maximum available historical data by default
  useEffect(() => {
    const fetchData = async () => {
      if (!selectedStock) return;
      try {
        const res = await axios.get("/api/chart-data", {
          params: {
            symbol: selectedStock.value,
            interval: "1d",
            period: "max", // Fetches all available years of data from your backend
            t: Date.now(),
          },
        });
        setChartData(res.data);
      } catch (err) {
        console.error("Error fetching chart data:", err);
      }
    };
    fetchData();
  }, [selectedStock]);

  if (loading) return <div className="p-8 text-gray-500 flex items-center justify-center h-screen overflow-hidden">Loading Workspace...</div>;
  if (!hasAccess) return <div className="p-8 text-red-500 flex items-center justify-center h-screen overflow-hidden">Access Denied</div>;

  return (
    <div className="flex flex-col w-full h-[calc(100vh-2rem)] p-4 md:p-8 bg-[#f8f9fa] font-sans box-border overflow-hidden">
      
      {/* Top Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <div className="p-3 bg-blue-600 rounded-lg shadow-md text-white">
          <FiTrendingUp size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            {selectedStock?.label || "Advanced Charting"}
          </h2>
          <p className="text-sm text-gray-500 font-medium">{selectedStock?.value}</p>
        </div>
      </div>

      {/* Control Panel */}
      <div className="relative z-50 flex flex-col md:flex-row gap-4 mb-4 w-full max-w-4xl bg-white p-4 rounded-xl shadow-sm border border-gray-100 items-center flex-shrink-0">
        
        {/* Symbol Search */}
        <div className="relative flex-1 w-full">
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              className="w-full bg-gray-50 border border-gray-200 text-gray-800 pl-10 pr-4 py-2.5 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
              placeholder="Search stock symbol..."
              value={query}
              onChange={handleInputChange}
              onClick={() => { setQuery(""); setShowSuggestions(true); }}
              onKeyDown={handleKeyDown}
            />
          </div>
          
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl w-full max-h-60 overflow-y-auto z-[60]">
              {suggestions.map((stock, index) => (
                <div
                  key={stock.value}
                  className={`px-4 py-3 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${
                    index === activeIndex ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50 text-gray-700"
                  }`}
                  onClick={() => handleSuggestionClick(stock)}
                >
                  <span className="font-semibold">{stock.value}</span>
                  <span className="ml-2 text-sm text-gray-400">{stock.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Indicator Button */}
        <div className="relative w-full md:w-auto">
          <button 
            onClick={() => setIsIndicatorDropdownOpen(!isIndicatorDropdownOpen)}
            className="flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 transition-all w-full h-full whitespace-nowrap"
          >
            <FiPlus /> Add Indicator
          </button>

          {isIndicatorDropdownOpen && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 shadow-xl rounded-xl max-h-60 overflow-y-auto z-[70]">
              {INDICATOR_CATALOG.map(item => (
                <div 
                  key={`${item.type}-${item.period || 'none'}`}
                  onClick={() => addIndicator(item)}
                  className="px-4 py-2.5 text-sm flex justify-between items-center cursor-pointer hover:bg-blue-50 hover:text-blue-600 text-gray-700 border-b border-gray-50 last:border-0"
                >
                  {item.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart Canvas Container */}
      <div className="relative z-0 w-full flex-grow flex flex-col rounded-xl overflow-hidden shadow-sm border border-gray-200 bg-white">
        {chartData && chartData.length > 0 ? (
          <TradingViewChart 
            data={chartData} 
            activeIndicators={activeIndicators} 
            setActiveIndicators={setActiveIndicators} 
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
             <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
             Loading Market Data...
          </div>
        )}
      </div>
    </div>
  );
}