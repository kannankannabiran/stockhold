"use client";

import React, { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { FaBolt, FaPalette, FaChartLine, FaArrowUp, FaArrowDown } from "react-icons/fa";
import { useAccessControl } from "../../hooks/useAccessControl";
import up from "../../../public/up.svg";
import down from "../../../public/down.svg";

const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];
const REFRESH_MS = 5000;
const TIMEFRAME_OPTIONS = [1, 3, 5, 15, 30, 60];
const DIVISORS = { NIFTY: 65, BANKNIFTY: 30, SENSEX: 20 };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtInt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.round(Number(n)).toLocaleString("en-IN");
}

function getSentiment(diffOi) {
  if (diffOi === null || diffOi === undefined || diffOi === 0) return "Neutral";
  return diffOi > 0 ? "Bullish" : "Bearish";
}

function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function MetricCard({ title, value, subtitle, tone = "slate" }) {
  const tones = {
    slate: "from-slate-500/10 to-white border-slate-200",
    green: "from-emerald-500/10 to-white border-emerald-200",
    red: "from-rose-500/10 to-white border-rose-200",
    blue: "from-blue-500/10 to-white border-blue-200",
    amber: "from-amber-500/10 to-white border-amber-200",
  };

  const textTones = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    red: "text-rose-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br px-5 py-4 shadow-sm ${tones[tone]}`}>
      <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">{title}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${textTones[tone]}`}>{value}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  );
}

export default function TrendingOiPage() {
  const { hasAccess, loading: accessLoading } = useAccessControl("/trendingoi");

  const [symbol, setSymbol] = useState("NIFTY");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [timeframe, setTimeframe] = useState(1);
  const [history, setHistory] = useState([]);
  const [colorsEnabled, setColorsEnabled] = useState(false);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/trending-oi/history?symbol=${symbol}&date=${selectedDate}`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch trending OI history", err);
    }
  };

  useEffect(() => {
    fetchHistory();
    if (selectedDate !== todayStr()) return;
    const interval = setInterval(fetchHistory, REFRESH_MS);
    return () => clearInterval(interval);
  }, [symbol, selectedDate]);

  const rawCumulativeRows = useMemo(() => {
    const divisor = DIVISORS[symbol] || 1;
    const chronological = [...history].reverse();
    let callPlus = 0;
    let callMinus = 0;
    let putPlus = 0;
    let putMinus = 0;
    let dayHigh = -Infinity;
    let dayLow = Infinity;
    const out = [];

    for (const row of chronological) {
      const c = row.callOiChange !== null && row.callOiChange !== undefined ? row.callOiChange / divisor : row.callOiChange;
      const p = row.putOiChange !== null && row.putOiChange !== undefined ? row.putOiChange / divisor : row.putOiChange;

      if (c !== null && c !== undefined) {
        if (c > 0) callPlus += c;
        else if (c < 0) callMinus += c;
      }
      if (p !== null && p !== undefined) {
        if (p > 0) putPlus += p;
        else if (p < 0) putMinus += p;
      }

      const callChg = callPlus + callMinus;
      const putChg = putPlus + putMinus;

      const diffOi = putChg - callChg;
      const maxOi = Math.max(Math.abs(callChg), Math.abs(putChg));
      const diffPct = maxOi === 0 ? 0 : (diffOi / maxOi) * 100;

      let dayBreak = "-";
      if (row.spot !== null && row.spot !== undefined) {
        if (dayHigh !== -Infinity && row.spot > dayHigh) dayBreak = "Day High Break";
        else if (dayLow !== Infinity && row.spot < dayLow) dayBreak = "Day Low Break";
        dayHigh = Math.max(dayHigh, row.spot);
        dayLow = Math.min(dayLow, row.spot);
      }

      out.push({
        id: row.id,
        date: row.date,
        time: row.time,
        spot: row.spot,
        dayBreak,
        callPlus,
        callMinus,
        callChg,
        putPlus,
        putMinus,
        putChg,
        diffOi,
        diffPct,
      });
    }

    return out;
  }, [history, symbol]);

  const summaryRows = useMemo(() => {
    let buckets = [];

    if (timeframe <= 1) {
      buckets = rawCumulativeRows;
    } else {
      let currentBucketKey = null;
      for (const row of rawCumulativeRows) {
        const mins = timeToMinutes(row.time);
        const bucketKey = mins === null ? null : Math.floor(mins / timeframe) * timeframe;
        if (bucketKey !== currentBucketKey || buckets.length === 0) {
          buckets.push(row);
          currentBucketKey = bucketKey;
        } else {
          buckets[buckets.length - 1] = row;
        }
      }
    }

    let prevDiffOi = null;
    const out = buckets.map((row) => {
      let direction = "-";
      if (prevDiffOi !== null) {
        if (row.diffOi > prevDiffOi) direction = "up";
        else if (row.diffOi < prevDiffOi) direction = "down";
      }
      prevDiffOi = row.diffOi;
      return { ...row, direction, sentiment: getSentiment(row.diffOi) };
    });

    return out.reverse();
  }, [rawCumulativeRows, timeframe]);

  if (accessLoading) return <div className="p-6 font-mono text-sm text-slate-500">Loading terminal...</div>;
  if (!hasAccess) return null;

  const currentSpot = history[0]?.spot ?? null;
  const prevSpotRow = history[1]?.spot ?? null;
  const spotDirection =
    currentSpot != null && prevSpotRow != null
      ? currentSpot > prevSpotRow
        ? "up"
        : currentSpot < prevSpotRow
        ? "down"
        : "-"
      : "-";

  const latest = summaryRows[0] || null;
  
  const signClass = (val, { zeroClass = "text-slate-700" } = {}) => {
    if (!colorsEnabled) return "text-slate-700";
    if (val > 0) return "text-emerald-600";
    if (val < 0) return "text-rose-600";
    return zeroClass;
  };

  return (
    <main className="min-h-screen w-full bg-[#f8f9fa] px-2 py-5 text-slate-800 sm:px-4 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        
        {/* Header Controls */}
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <FaChartLine className="text-lg" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                    Trending OI
                  </h1>
                  <p className="mt-0.5 text-sm font-medium text-slate-500">
                    Live cumulative open interest analysis
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard
                title={`${symbol} Spot`}
                value={
                  currentSpot != null
                    ? currentSpot.toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : "—"
                }
                subtitle={
                  spotDirection === "up"
                    ? "Spot is rising"
                    : spotDirection === "down"
                    ? "Spot is falling"
                    : "No recent change"
                }
                tone={spotDirection === "up" ? "green" : spotDirection === "down" ? "red" : "slate"}
              />
              <MetricCard
                title="Diff OI"
                value={latest ? `${latest.diffOi > 0 ? "+" : ""}${fmtInt(latest.diffOi)}` : "—"}
                subtitle="Current cumulative OI difference"
                tone={latest?.diffOi > 0 ? "green" : latest?.diffOi < 0 ? "red" : "slate"}
              />
              <MetricCard
                title="Sentiment"
                value={latest?.sentiment ?? "—"}
                subtitle={
                  latest
                    ? `${Math.abs(latest.diffPct).toFixed(1)}% market strength`
                    : "Waiting for data"
                }
                tone={latest?.sentiment === "Bullish" ? "green" : latest?.sentiment === "Bearish" ? "red" : "slate"}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Symbol:</span>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {indexOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Date:</span>
              <input
                type="date"
                value={selectedDate}
                max={todayStr()}
                onChange={(e) => setSelectedDate(e.target.value)}
                onClick={(e) => {
                  if (typeof e.target.showPicker === "function") {
                    e.target.showPicker();
                  }
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-500">Interval:</span>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <option key={tf} value={tf}>{tf} min</option>
                ))}
              </select>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs font-medium text-slate-600 border border-slate-200">
                Total Rows: {summaryRows.length}
              </span>
              <button
                onClick={() => setColorsEnabled((v) => !v)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 font-medium transition cursor-pointer ${
                  colorsEnabled
                    ? "border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <FaPalette className={colorsEnabled ? "text-blue-600" : "text-slate-400"} />
                {colorsEnabled ? "Colors On" : "Colors Off"}
              </button>
            </div>
          </div>
        </header>

        {/* Data Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[1200px] border-collapse text-right font-sans text-[13px]">
              <thead className="sticky top-0 z-20">
                {/* Grouped Headers */}
                <tr className="border-b border-slate-200 font-medium">
                  <th colSpan={4} className="border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-slate-700">Market Info</th>
                  <th colSpan={3} className="border-r border-white bg-emerald-50/70 px-3 py-2 text-center text-emerald-800">Call Build Up</th>
                  <th colSpan={3} className="border-r border-slate-200 bg-rose-50/70 px-3 py-2 text-center text-rose-800">Put Build Up</th>
                  <th colSpan={4} className="bg-blue-50/50 px-3 py-2 text-center text-blue-800">Overall Trend</th>
                </tr>
                
                {/* Column Sub-Headers */}
                <tr className="border-b border-slate-200 bg-white text-slate-500 text-xs tracking-wide">
                  <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Time</th>
                  <th className="px-3 py-2.5 font-semibold text-slate-800">Spot</th>
                  <th className="border-r border-slate-200 px-3 py-2.5 text-center font-semibold">Signal</th>
                  
                  <th className="bg-emerald-50/30 px-3 py-2.5 font-semibold">Call +</th>
                  <th className="bg-emerald-50/30 px-3 py-2.5 font-semibold">Call −</th>
                  <th className="border-r border-white bg-emerald-50/30 px-3 py-2.5 font-semibold text-emerald-700">Call Chg</th>
                  
                  <th className="bg-rose-50/30 px-3 py-2.5 font-semibold">Put +</th>
                  <th className="bg-rose-50/30 px-3 py-2.5 font-semibold">Put −</th>
                  <th className="border-r border-slate-200 bg-rose-50/30 px-3 py-2.5 font-semibold text-rose-700">Put Chg</th>
                  
                  <th className="px-3 py-2.5 font-semibold text-slate-800">Diff OI</th>
                  <th className="px-3 py-2.5 font-semibold">Diff %</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Dir</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Sentiment</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 tabular-nums">
                {summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-6 py-16 text-center text-sm text-slate-500">
                      No data available for the selected date.
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row, index) => (
                    <tr
                      key={row.id || `${row.date}-${row.time}-${index}`}
                      className="transition-colors hover:bg-slate-50"
                    >
                      {/* Market Info */}
                      <td className="px-3 py-2 text-left font-medium text-slate-600">{row.date}</td>
                      <td className="px-3 py-2 text-left font-semibold text-slate-900">{row.time}</td>
                      <td className="px-3 py-2 font-bold text-slate-800">
                        {row.spot != null
                          ? Number(row.spot).toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : "-"}
                      </td>
                      <td className="border-r border-slate-200 px-3 py-2 text-center">
                        {row.dayBreak === "Day High Break" ? (
                          <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 border border-emerald-200">
                            Day High
                          </span>
                        ) : row.dayBreak === "Day Low Break" ? (
                          <span className="inline-block rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 border border-rose-200">
                            Day Low
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Call Side */}
                      <td className={`bg-emerald-50/10 px-3 py-2 ${row.callPlus > 0 ? (colorsEnabled ? "font-semibold text-emerald-600" : "font-medium text-slate-700") : "text-slate-300"}`}>
                        {row.callPlus > 0 ? fmtInt(row.callPlus) : "-"}
                      </td>
                      <td className={`bg-emerald-50/10 px-3 py-2 ${row.callMinus < 0 ? (colorsEnabled ? "font-semibold text-rose-600" : "font-medium text-slate-700") : "text-slate-300"}`}>
                        {row.callMinus < 0 ? fmtInt(Math.abs(row.callMinus)) : "-"}
                      </td>
                      <td className={`border-r border-slate-50 bg-emerald-50/10 px-3 py-2 font-bold ${signClass(row.callChg)}`}>
                        {row.callChg > 0 ? "+" : ""}{fmtInt(row.callChg)}
                      </td>

                      {/* Put Side */}
                      <td className={`bg-rose-50/10 px-3 py-2 ${row.putPlus > 0 ? (colorsEnabled ? "font-semibold text-emerald-600" : "font-medium text-slate-700") : "text-slate-300"}`}>
                        {row.putPlus > 0 ? fmtInt(row.putPlus) : "-"}
                      </td>
                      <td className={`bg-rose-50/10 px-3 py-2 ${row.putMinus < 0 ? (colorsEnabled ? "font-semibold text-rose-600" : "font-medium text-slate-700") : "text-slate-300"}`}>
                        {row.putMinus < 0 ? fmtInt(Math.abs(row.putMinus)) : "-"}
                      </td>
                      <td className={`border-r border-slate-200 bg-rose-50/10 px-3 py-2 font-bold ${signClass(row.putChg)}`}>
                        {row.putChg > 0 ? "+" : ""}{fmtInt(row.putChg)}
                      </td>

                      {/* Overall Trend */}
                      <td className={`px-3 py-2 font-bold ${row.diffOi > 0 ? "text-emerald-600" : row.diffOi < 0 ? "text-rose-600" : "text-slate-700"}`}>
                        {row.diffOi > 0 ? "+" : ""}{fmtInt(row.diffOi)}
                      </td>
                      <td className={`px-3 py-2 font-semibold ${row.diffPct > 40 ? "text-emerald-600" : row.diffPct < -40 ? "text-rose-600" : "text-slate-600"}`}>
                        {row.diffPct > 0 ? "+" : ""}{row.diffPct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.direction === "up" ? (
                          <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full">
                             <Image src={up} alt="Up" width={32} height={32} />
                          </div>
                        ) : row.direction === "down" ? (
                          <div className="mx-auto flex h-6 w-6 items-center justify-center rounded-full">
                             <Image src={down} alt="Down" width={32} height={32} />
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block rounded px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide border ${
                            row.sentiment === "Bullish"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : row.sentiment === "Bearish"
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                          }`}
                        >
                          {row.sentiment}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}