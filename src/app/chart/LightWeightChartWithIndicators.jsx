"use client";
import React, { useEffect, useRef, useState } from "react";
import { createChart, LineSeries, CandlestickSeries } from "lightweight-charts";
import { FiEye, FiEyeOff, FiX, FiSettings } from "react-icons/fi";

// ==========================================
// 1. INDICATOR MATHEMATICS
// ==========================================
const calculateSMA = (data, period) => {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push({ time: data[i].time, value: null }); continue; }
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, bar) => acc + bar.close, 0);
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
};

const calculateEMA = (data, period) => {
  const result = [];
  const k = 2 / (period + 1);
  let prevEMA = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push({ time: data[i].time, value: null }); continue; }
    if (prevEMA === null) {
      const sum = data.slice(i - period + 1, i + 1).reduce((acc, bar) => acc + bar.close, 0);
      prevEMA = sum / period;
    } else {
      prevEMA = (data[i].close - prevEMA) * k + prevEMA;
    }
    result.push({ time: data[i].time, value: prevEMA });
  }
  return result;
};

const getWeekNumber = (d) => {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
};

// Session VWAP Engine with dedicated default session colors
const SESSION_COLORS = {
  daily: '#8b5cf6',    // Purple
  weekly: '#ec4899',   // Pink
  monthly: '#3b82f6',  // Blue
  quarterly: '#f59e0b',// Amber
  yearly: '#10b981'    // Emerald
};

const calculateSessionVWAP = (data, session = 'daily') => {
  const result = [];
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  let currentKey = null;

  for (let i = 0; i < data.length; i++) {
    const bar = data[i];
    
    let date;
    if (typeof bar.time === 'number') {
      date = new Date(bar.time > 10000000000 ? bar.time : bar.time * 1000);
    } else {
      date = new Date(bar.time);
    }

    let key;
    if (isNaN(date.getTime())) {
      key = Math.floor(i / 10); 
    } else {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      
      switch (session) {
        case 'daily':
          key = `${year}-${month}-${day}`;
          break;
        case 'weekly':
          key = `${year}-W${getWeekNumber(date)}`;
          break;
        case 'monthly':
          key = `${year}-${month}`;
          break;
        case 'quarterly':
          key = `${year}-Q${Math.floor(month / 3) + 1}`;
          break;
        case 'yearly':
          key = `${year}`;
          break;
        default:
          key = `${year}-${month}-${day}`;
      }
    }

    if (currentKey !== key) {
      currentKey = key;
      cumulativeTPV = 0;
      cumulativeVolume = 0;
    }

    const high = bar.high ?? bar.close;
    const low = bar.low ?? bar.close;
    const close = bar.close;
    const volume = bar.volume !== undefined && bar.volume !== null && bar.volume > 0 ? bar.volume : 1;

    const typicalPrice = (high + low + close) / 3;
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;

    const vwap = cumulativeVolume === 0 ? close : cumulativeTPV / cumulativeVolume;
    result.push({ time: bar.time, value: vwap });
  }
  return result;
};

const calculateATR = (data, period) => {
  const tr = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { tr.push(data[i].high - data[i].low); continue; }
    const high = data[i].high ?? data[i].close;
    const low = data[i].low ?? data[i].close;
    const prevClose = data[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  
  const atr = [];
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) { atr.push(null); sum += tr[i]; continue; }
    if (i === period - 1) {
      sum += tr[i];
      atr.push(sum / period);
    } else {
      atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
    }
  }
  return atr;
};

const calculateSupertrend = (data, period = 10, multiplier = 3, upColor = '#10b981', downColor = '#ef4444') => {
  const atr = calculateATR(data, period);
  const result = [];
  let finalUpperband = 0, finalLowerband = 0, prevSupertrend = 0, trend = 1;

  for (let i = 0; i < data.length; i++) {
    if (i < period) { result.push({ time: data[i].time, value: null }); continue; }
    
    const high = data[i].high ?? data[i].close;
    const low = data[i].low ?? data[i].close;
    const close = data[i].close;
    const prevClose = data[i - 1].close;
    const hl2 = (high + low) / 2;
    
    const basicUpper = hl2 + multiplier * atr[i];
    const basicLower = hl2 - multiplier * atr[i];

    finalUpperband = (basicUpper < finalUpperband || prevClose > finalUpperband) ? basicUpper : finalUpperband;
    finalLowerband = (basicLower > finalLowerband || prevClose < finalLowerband) ? basicLower : finalLowerband;

    if (prevSupertrend === finalUpperband && close <= finalUpperband) trend = -1;
    else if (prevSupertrend === finalUpperband && close >= finalUpperband) trend = 1;
    else if (prevSupertrend === finalLowerband && close >= finalLowerband) trend = 1;
    else if (prevSupertrend === finalLowerband && close <= finalLowerband) trend = -1;

    const st = trend === 1 ? finalLowerband : finalUpperband;
    prevSupertrend = st;
    result.push({ 
      time: data[i].time, 
      value: st,
      color: trend === 1 ? upColor : downColor 
    });
  }
  return result;
};

const calculateBB = (data, period, multiplier = 2) => {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push({ time: data[i].time, upper: null, middle: null, lower: null }); continue; }
    const window = data.slice(i - period + 1, i + 1).map(b => b.close);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdev = Math.sqrt(variance);
    result.push({ time: data[i].time, upper: mean + multiplier * stdev, middle: mean, lower: mean - multiplier * stdev });
  }
  return result;
};

const calculateDonchian = (data, period) => {
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push({ time: data[i].time, upper: null, middle: null, lower: null }); continue; }
    const window = data.slice(i - period + 1, i + 1);
    const high = Math.max(...window.map(b => b.high ?? b.close));
    const low = Math.min(...window.map(b => b.low ?? b.close));
    result.push({ time: data[i].time, upper: high, middle: (high + low) / 2, lower: low });
  }
  return result;
};

const calculateKeltner = (data, period = 20, multiplier = 2) => {
  const ema = calculateEMA(data, period);
  const atr = calculateATR(data, period);
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (ema[i].value === null || atr[i] === null) {
      result.push({ time: data[i].time, upper: null, middle: null, lower: null });
    } else {
      const mid = ema[i].value;
      const range = multiplier * atr[i];
      result.push({ time: data[i].time, upper: mid + range, middle: mid, lower: mid - range });
    }
  }
  return result;
};

const calculateEnvelopes = (data, period = 20, percent = 5) => {
  const sma = calculateSMA(data, period);
  const result = [];
  for (let i = 0; i < data.length; i++) {
    if (sma[i].value === null) {
      result.push({ time: data[i].time, upper: null, middle: null, lower: null });
    } else {
      const mid = sma[i].value;
      const shift = mid * (percent / 100);
      result.push({ time: data[i].time, upper: mid + shift, middle: mid, lower: mid - shift });
    }
  }
  return result;
};

// ==========================================
// 2. MAIN COMPONENT
// ==========================================
const TradingViewChart = ({ data, activeIndicators, setActiveIndicators }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const seriesRegistry = useRef({}); 

  const [editingIndicator, setEditingIndicator] = useState(null); 

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const width = chartContainerRef.current.clientWidth;
    const height = chartContainerRef.current.clientHeight || 600;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: "solid", color: "#ffffff" }, textColor: "#4b5563" },
      grid: { vertLines: { color: "#f3f4f6" }, horzLines: { color: "#f3f4f6" } },
      width: width,
      height: height,
      crosshair: { mode: 1 },
      timeScale: { borderColor: "#e5e7eb", timeVisible: true },
      rightPriceScale: { borderColor: "#e5e7eb" },
    });
    
    chartRef.current = chart;
    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981", downColor: "#ef4444", borderVisible: false, wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });

    const resizeObserver = new ResizeObserver(() => {
      if (!chartContainerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({ 
        width: chartContainerRef.current.clientWidth, 
        height: chartContainerRef.current.clientHeight 
      });
    });
    
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!data || !chartRef.current) return;
    
    const sortedData = [...data].sort((a, b) => (new Date(a.time) > new Date(b.time) ? 1 : -1));
    candleSeriesRef.current.setData(sortedData);

    const currentActiveIds = new Set(activeIndicators.map(ind => ind.id));

    activeIndicators.forEach((ind) => {
      const id = ind.id;

      // 1. Single Line Indicators
      if (["sma", "ema", "vwap", "supertrend"].includes(ind.type)) {
        const color = ind.color || "#000";
        if (!seriesRegistry.current[id]) {
          seriesRegistry.current[id] = chartRef.current.addSeries(LineSeries, {
            color: color, 
            lineWidth: ind.type === 'supertrend' ? 3 : 2, 
            priceLineVisible: false, crosshairMarkerVisible: false,
          });
        }
        
        let calcData = [];
        if (ind.type === "sma") calcData = calculateSMA(sortedData, ind.period);
        if (ind.type === "ema") calcData = calculateEMA(sortedData, ind.period);
        if (ind.type === "vwap") calcData = calculateSessionVWAP(sortedData, ind.session || 'daily');
        if (ind.type === "supertrend") calcData = calculateSupertrend(sortedData, ind.period, ind.multiplier, ind.upColor, ind.downColor);

        seriesRegistry.current[id].setData(calcData.filter(d => d.value !== null));
        seriesRegistry.current[id].applyOptions({ 
          visible: ind.visible,
          color: ind.type !== 'supertrend' ? color : undefined 
        });
      }
      
      // 2. Three-Line Bands / Channels
      if (["bb", "donchian", "keltner", "envelope"].includes(ind.type)) {
        const upC = ind.upperColor || "#000";
        const midC = ind.middleColor || "#000";
        const lowC = ind.lowerColor || "#000";
        
        if (!seriesRegistry.current[id]) {
          seriesRegistry.current[id] = {
            upper: chartRef.current.addSeries(LineSeries, { color: upC, lineWidth: 1, priceLineVisible: false }),
            middle: chartRef.current.addSeries(LineSeries, { color: midC, lineWidth: 1, lineStyle: 2, priceLineVisible: false }),
            lower: chartRef.current.addSeries(LineSeries, { color: lowC, lineWidth: 1, priceLineVisible: false }),
          };
        }
        
        let calcData = [];
        if (ind.type === "bb") calcData = calculateBB(sortedData, ind.period, ind.multiplier);
        if (ind.type === "donchian") calcData = calculateDonchian(sortedData, ind.period);
        if (ind.type === "keltner") calcData = calculateKeltner(sortedData, ind.period, ind.multiplier);
        if (ind.type === "envelope") calcData = calculateEnvelopes(sortedData, ind.period, ind.percent);

        seriesRegistry.current[id].upper.setData(calcData.filter(d => d.upper !== null).map(d => ({ time: d.time, value: d.upper })));
        seriesRegistry.current[id].middle.setData(calcData.filter(d => d.middle !== null).map(d => ({ time: d.time, value: d.middle })));
        seriesRegistry.current[id].lower.setData(calcData.filter(d => d.lower !== null).map(d => ({ time: d.time, value: d.lower })));

        seriesRegistry.current[id].upper.applyOptions({ visible: ind.visible, color: upC });
        seriesRegistry.current[id].middle.applyOptions({ visible: ind.visible, color: midC });
        seriesRegistry.current[id].lower.applyOptions({ visible: ind.visible, color: lowC });
      }
    });

    Object.keys(seriesRegistry.current).forEach(existingId => {
      if (!currentActiveIds.has(existingId)) {
        const seriesObj = seriesRegistry.current[existingId];
        if (seriesObj.upper) { 
          chartRef.current.removeSeries(seriesObj.upper);
          chartRef.current.removeSeries(seriesObj.middle);
          chartRef.current.removeSeries(seriesObj.lower);
        } else { 
          chartRef.current.removeSeries(seriesObj);
        }
        delete seriesRegistry.current[existingId];
      }
    });

    chartRef.current.timeScale().fitContent();
  }, [data, activeIndicators]);

  const toggleVisibility = (id) => {
    setActiveIndicators(prev => prev.map(ind => ind.id === id ? { ...ind, visible: !ind.visible } : ind));
  };

  const removeIndicator = (id) => {
    setActiveIndicators(prev => prev.filter(ind => ind.id !== id));
  };

  const applySettings = () => {
    setActiveIndicators(prev => prev.map(ind => ind.id === editingIndicator.id ? editingIndicator : ind));
    setEditingIndicator(null);
  };

  return (
    <div className="relative w-full flex-1 min-h-[600px] h-full overflow-hidden rounded-xl bg-white">
      
      {/* Floating Active Indicator List */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-auto">
        {activeIndicators.map((ind) => {
          const paramsDisplay = [ind.period, ind.multiplier, ind.percent, ind.session]
            .filter(p => p !== undefined)
            .join(", ");
            
          const badgeColor = ind.color || ind.upColor || ind.middleColor || '#0aa7f5';

          return (
            <div key={ind.id} className="group flex items-center gap-2 text-sm font-medium transition-all">
              <span style={{ color: badgeColor, opacity: ind.visible ? 1 : 0.4 }} className="drop-shadow-sm font-bold bg-white/60 px-1.5 py-0.5 rounded backdrop-blur-sm cursor-default">
                {ind.label} {paramsDisplay ? `(${paramsDisplay})` : ''}
              </span>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 border border-gray-200 shadow-sm rounded px-1 backdrop-blur-md">
                <button onClick={() => toggleVisibility(ind.id)} className="p-1 text-gray-500 hover:text-blue-600 transition-colors" title={ind.visible ? "Hide" : "Show"}>
                  {ind.visible ? <FiEye size={14} /> : <FiEyeOff size={14} />}
                </button>
                <button onClick={() => setEditingIndicator(ind)} className="p-1 text-gray-500 hover:text-gray-900 transition-colors" title="Settings">
                  <FiSettings size={14} />
                </button>
                <button onClick={() => removeIndicator(ind.id)} className="p-1 text-gray-500 hover:text-red-500 transition-colors" title="Remove">
                  <FiX size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Settings Modal Pop-Up */}
      {editingIndicator && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-6 w-[340px] transform transition-all pointer-events-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 border-b border-gray-100 pb-2">
              <span style={{ color: editingIndicator.color || editingIndicator.upColor || editingIndicator.middleColor }}>
                {editingIndicator.label}
              </span> Settings
            </h3>
            
            <div className="space-y-4">
              {/* VWAP Session Dropdown (Auto-updates color to match selected session if default) */}
              {editingIndicator.session !== undefined && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Anchor Session</label>
                  <select
                    value={editingIndicator.session}
                    onChange={(e) => {
                      const newSession = e.target.value;
                      setEditingIndicator({
                        ...editingIndicator, 
                        session: newSession,
                        color: SESSION_COLORS[newSession] || editingIndicator.color
                      });
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              )}

              {editingIndicator.period !== undefined && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Period (Length)</label>
                  <input 
                    type="number" 
                    min="1" 
                    value={editingIndicator.period} 
                    onChange={(e) => setEditingIndicator({...editingIndicator, period: Number(e.target.value)})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {editingIndicator.multiplier !== undefined && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Multiplier</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0.1"
                    value={editingIndicator.multiplier} 
                    onChange={(e) => setEditingIndicator({...editingIndicator, multiplier: Number(e.target.value)})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {editingIndicator.percent !== undefined && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Percent (%)</label>
                  <input 
                    type="number" 
                    step="0.1" 
                    min="0.1"
                    value={editingIndicator.percent} 
                    onChange={(e) => setEditingIndicator({...editingIndicator, percent: Number(e.target.value)})}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              
              {editingIndicator.color !== undefined && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Line Color</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="color" 
                      value={editingIndicator.color} 
                      onChange={(e) => setEditingIndicator({...editingIndicator, color: e.target.value})}
                      className="w-10 h-10 p-0.5 border border-gray-300 rounded cursor-pointer"
                    />
                    <span className="text-sm text-gray-600 font-mono uppercase bg-gray-50 px-2 py-1 rounded border border-gray-200">
                      {editingIndicator.color}
                    </span>
                  </div>
                </div>
              )}

              {editingIndicator.upColor !== undefined && editingIndicator.downColor !== undefined && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Trend Colors</label>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <span className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Up Trend</span>
                      <input 
                        type="color" 
                        value={editingIndicator.upColor} 
                        onChange={(e) => setEditingIndicator({...editingIndicator, upColor: e.target.value})}
                        className="w-full h-8 p-0.5 border border-gray-300 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex-1">
                      <span className="block text-[10px] text-gray-400 font-bold uppercase mb-1">Down Trend</span>
                      <input 
                        type="color" 
                        value={editingIndicator.downColor} 
                        onChange={(e) => setEditingIndicator({...editingIndicator, downColor: e.target.value})}
                        className="w-full h-8 p-0.5 border border-gray-300 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingIndicator.upperColor !== undefined && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Band Colors</label>
                  <div className="flex gap-4">
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Upper</span>
                      <input 
                        type="color" 
                        value={editingIndicator.upperColor} 
                        onChange={(e) => setEditingIndicator({...editingIndicator, upperColor: e.target.value})}
                        className="w-full h-8 p-0.5 border border-gray-300 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Middle</span>
                      <input 
                        type="color" 
                        value={editingIndicator.middleColor} 
                        onChange={(e) => setEditingIndicator({...editingIndicator, middleColor: e.target.value})}
                        className="w-full h-8 p-0.5 border border-gray-300 rounded cursor-pointer"
                      />
                    </div>
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Lower</span>
                      <input 
                        type="color" 
                        value={editingIndicator.lowerColor} 
                        onChange={(e) => setEditingIndicator({...editingIndicator, lowerColor: e.target.value})}
                        className="w-full h-8 p-0.5 border border-gray-300 rounded cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <button 
                onClick={() => setEditingIndicator(null)} 
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={applySettings} 
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-sm"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HTML Chart Container */}
      <div 
        ref={chartContainerRef} 
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
};

export default TradingViewChart;