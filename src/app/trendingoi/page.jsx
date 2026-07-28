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
    slate: "bg-slate-50 border-slate-200",
    green: "bg-emerald-50 border-emerald-200",
    red: "bg-rose-50 border-rose-200",
    blue: "bg-blue-50 border-blue-200",
    amber: "bg-amber-50 border-amber-200",
  };

  const textTones = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    red: "text-rose-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{title}</div>
      <div className={`mt-2 text-2xl font-bold ${textTones[tone]}`}>{value}</div>
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
      const res = await fetch(
        `/api/trending-oi/history?symbol=${symbol}&date=${selectedDate}`
      );
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
      const c =
        row.callOiChange !== null && row.callOiChange !== undefined
          ? row.callOiChange / divisor
          : row.callOiChange;
      const p =
        row.putOiChange !== null && row.putOiChange !== undefined
          ? row.putOiChange / divisor
          : row.putOiChange;

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
      const diffOi = Math.abs(putChg) - Math.abs(callChg);
      const denom = Math.abs(callChg) + Math.abs(putChg);
      const diffPct = denom === 0 ? 0 : (diffOi / denom) * 100;

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

  if (accessLoading) return <div className="p-6">Loading...</div>;
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
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-8xl p-4 md:p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-yellow-100 text-yellow-600">
                  <FaBolt className="text-lg" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                    Trending OI - {symbol}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Snapshot stored every 1 minute. View bucketed summary, direction, and sentiment.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard
                title="Spot"
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
                value={latest ? fmtInt(Math.abs(latest.diffOi)) : "—"}
                subtitle="Current cumulative OI difference"
                tone={latest?.diffOi > 0 ? "green" : latest?.diffOi < 0 ? "red" : "slate"}
              />
              <MetricCard
                title="Sentiment"
                value={latest?.sentiment ?? "—"}
                subtitle={
                  latest
                    ? `${Math.abs(latest.diffPct).toFixed(1)}% strength`
                    : "Waiting for data"
                }
                tone={latest?.sentiment === "Bullish" ? "green" : latest?.sentiment === "Bearish" ? "red" : "slate"}
              />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                {indexOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={selectedDate}
                max={todayStr()}
                onChange={(e) => setSelectedDate(e.target.value)}
                onClick={(e) => {
                  // Open the native calendar on click anywhere in the box,
                  // not just when the small calendar icon is clicked.
                  if (typeof e.target.showPicker === "function") {
                    e.target.showPicker();
                  }
                }}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer"
              />

              <select
                value={timeframe}
                onChange={(e) => setTimeframe(Number(e.target.value))}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                title="Consolidate rows into this many minutes"
              >
                {TIMEFRAME_OPTIONS.map((tf) => (
                  <option key={tf} value={tf}>
                    {tf} min
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setColorsEnabled((v) => !v)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
                  colorsEnabled
                    ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title="Toggle Call/Put column colors"
              >
                <FaPalette />
                {colorsEnabled ? "Colors On" : "Colors Off"}
              </button>

              <div className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-600">
                <span className="font-medium">Rows:</span> {summaryRows.length}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h3 className="text-lg font-semibold text-slate-900">OI Summary Table</h3>
              <p className="text-sm text-slate-500">
                Bucketed by {timeframe} minute{timeframe > 1 ? "s" : ""}, newest records shown first.
              </p>
            </div>
          </div>

          <div className="overflow-auto max-h-[70vh]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-20 bg-slate-100 text-xs uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Time</th>
                  <th className="px-4 py-3 text-right font-semibold">Spot</th>
                  <th className="px-4 py-3 text-center font-semibold">Day High/Low</th>
                  <th className="px-4 py-3 text-right font-semibold">Call +</th>
                  <th className="px-4 py-3 text-right font-semibold">Call −</th>
                  <th className="px-4 py-3 text-right font-semibold">Call Chg</th>
                  <th className="px-4 py-3 text-right font-semibold">Put +</th>
                  <th className="px-4 py-3 text-right font-semibold">Put −</th>
                  <th className="px-4 py-3 text-right font-semibold">Put Chg</th>
                  <th className="px-4 py-3 text-right font-semibold">Diff OI</th>
                  <th className="px-4 py-3 text-right font-semibold">Diff %</th>
                  <th className="px-4 py-3 text-center font-semibold">Dir</th>
                  <th className="px-4 py-3 text-center font-semibold">Sentiment</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {summaryRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-6 py-14 text-center text-slate-500">
                      No data available for the selected date.
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row, index) => (
                    <tr
                      key={row.id || `${row.date}-${row.time}-${index}`}
                      className="transition hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">{row.date}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">{row.time}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-slate-800">
                        {row.spot != null
                          ? Number(row.spot).toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.dayBreak === "Day High Break" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                            Day High Break
                          </span>
                        ) : row.dayBreak === "Day Low Break" ? (
                          <span className="inline-flex items-center rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white">
                            Day Low Break
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {row.callPlus > 0 ? (
                          <span className={colorsEnabled ? "text-emerald-600 font-medium" : "text-slate-700"}>
                            {fmtInt(row.callPlus)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {row.callMinus < 0 ? (
                          <span className={colorsEnabled ? "text-rose-600 font-medium" : "text-slate-700"}>
                            {fmtInt(Math.abs(row.callMinus))}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`font-semibold ${signClass(row.callChg)}`}>
                          {fmtInt(Math.abs(row.callChg))}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {row.putPlus > 0 ? (
                          <span className={colorsEnabled ? "text-emerald-600 font-medium" : "text-slate-700"}>
                            {fmtInt(row.putPlus)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {row.putMinus < 0 ? (
                          <span className={colorsEnabled ? "text-rose-600 font-medium" : "text-slate-700"}>
                            {fmtInt(Math.abs(row.putMinus))}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={`font-semibold ${signClass(row.putChg)}`}>
                          {fmtInt(Math.abs(row.putChg))}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            row.diffOi > 0
                              ? "text-emerald-600"
                              : row.diffOi < 0
                              ? "text-rose-600"
                              : "text-slate-700"
                          }`}
                        >
                          {fmtInt(Math.abs(row.diffOi))}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            row.diffPct > 40
                              ? "text-emerald-600"
                              : row.diffPct < -40
                              ? "text-rose-600"
                              : "text-slate-700"
                          }`}
                        >
                          {Math.abs(row.diffPct).toFixed(1)}%
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        {row.direction === "up" ? (
                          <Image src={up} alt="Up" width={34} height={34} className="mx-auto" />
                        ) : row.direction === "down" ? (
                          <Image src={down} alt="Down" width={34} height={34} className="mx-auto" />
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                            row.sentiment === "Bullish"
                              ? "bg-emerald-600 text-white"
                              : row.sentiment === "Bearish"
                              ? "bg-rose-600 text-white"
                              : "bg-slate-100 text-slate-700"
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
    </div>
  );
}