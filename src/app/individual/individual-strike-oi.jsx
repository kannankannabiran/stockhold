"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { FaSitemap } from "react-icons/fa";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];
const intervalOptions = [1, 3, 5, 15, 30, 60];
const POLL_MS = 60000;
const BULLISH_THRESHOLD = 20;
const BEARISH_THRESHOLD = -20;

// Market window: 9:15 AM – 3:30 PM IST
const MARKET_START_MIN = 9 * 60 + 15;
const MARKET_END_MIN = 15 * 60 + 30;

function getISTMinutesNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function isMarketOpenNow() {
  const current = getISTMinutesNow();
  return current >= MARKET_START_MIN && current <= MARKET_END_MIN;
}

function getISTTimeString(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function diffPct(ceChange, peChange) {
  if (ceChange == null && peChange == null) return null;
  const ce = ceChange ?? 0;
  const pe = peChange ?? 0;
  const denom = Math.abs(ce) + Math.abs(pe);
  if (denom === 0) return 0;
  return ((pe - ce) / denom) * 100;
}

function sentimentFromDiff(pct) {
  if (pct == null) return "N/A";
  if (pct > BULLISH_THRESHOLD) return "Bullish";
  if (pct < BEARISH_THRESHOLD) return "Bearish";
  return "Neutral";
}

// Raw-OI-based sentiment: more Put OI than Call OI suggests put writers
// defending a floor (Bullish); more Call OI than Put OI suggests call
// writers defending a ceiling (Bearish). Independent of the ΔOI sentiment.
function oiSentiment(ceOi, peOi) {
  if (ceOi == null || peOi == null) return "N/A";
  if (ceOi < peOi) return "Bullish";
  if (ceOi > peOi) return "Bearish";
  return "Neutral";
}

function sentimentClasses(sentiment) {
  switch (sentiment) {
    case "Bullish":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Bearish":
      return "bg-rose-50 text-rose-700 border-rose-200";
    case "N/A":
      return "bg-amber-50 text-amber-700 border-amber-200";
    default:
      return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

async function loadTrendHistory(sym, strike, date) {
  if (!strike) return [];
  try {
    const qs = new URLSearchParams({ symbol: sym, strike: String(strike) });
    if (date) qs.set("date", date);
    const res = await fetch(`/api/oi-trend?${qs.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[oiTrend] failed to load history", e);
    return [];
  }
}

async function loadSelectedStrikeHistory(sym, strike, date) {
  if (!strike) return [];
  try {
    const qs = new URLSearchParams({ symbol: sym, strike: String(strike), mode: "all" });
    if (date) qs.set("date", date);
    const res = await fetch(`/api/oi-trend?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[oiTrend] failed to load selected strike history", e);
    return [];
  }
}

async function loadStrikesForDate(sym, date) {
  if (!sym || !date) return [];
  try {
    const qs = new URLSearchParams({ symbol: sym, date, mode: "strikes" });
    const res = await fetch(`/api/oi-trend?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("[oiTrend] failed to load strikes for date", e);
    return [];
  }
}

function consolidateByInterval(rows, intervalMinutes) {
  if (!rows || !rows.length) return [];
  if (!intervalMinutes || intervalMinutes <= 1) return rows;

  const buckets = new Map();

  for (const row of rows) {
    const match = /^(\d{1,2}):(\d{2})/.exec(row.time || "");
    if (!match) continue;

    const totalMin = Number(match[1]) * 60 + Number(match[2]);
    const bucketStartMin = Math.floor(totalMin / intervalMinutes) * intervalMinutes;
    const bucketLabel = `${String(Math.floor(bucketStartMin / 60)).padStart(2, "0")}:${String(
      bucketStartMin % 60
    ).padStart(2, "0")}`;
    const key = `${row.date}-${bucketLabel}`;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        id: key,
        strike: row.strike,
        date: row.date,
        time: bucketLabel,
        ceOi: row.ceOi,
        peOi: row.peOi,
        ceOiChange: 0,
        peOiChange: 0,
        _lastMin: totalMin,
      };
      buckets.set(key, bucket);
    }

    bucket.ceOiChange += Number(row.ceOiChange ?? 0);
    bucket.peOiChange += Number(row.peOiChange ?? 0);

    if (totalMin >= bucket._lastMin) {
      bucket.ceOi = row.ceOi;
      bucket.peOi = row.peOi;
      bucket._lastMin = totalMin;
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(({ _lastMin, ...rest }) => rest);
}

function StatCard({ label, value, tone = "slate" }) {
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
      <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold ${textTones[tone]}`}>{value}</div>
    </div>
  );
}

export default function OptionChain() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [interval, setIntervalValue] = useState(1);
  const [selectedDate, setSelectedDate] = useState("");
  const [rows, setRows] = useState([]);
  const [spot, setSpot] = useState(null);
  const [expiry, setExpiry] = useState(null);
  const [expiries, setExpiries] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [error, setError] = useState(null);
  const [trendHistory, setTrendHistory] = useState([]);
  const [selectedStrikeHistory, setSelectedStrikeHistory] = useState([]);
  const [marketOpen, setMarketOpen] = useState(isMarketOpenNow());

  const timeoutRef = useRef(null);
  const inFlightRef = useRef(false);

  const fetchData = useCallback(
    async (sym, expiryOverride) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const qs = new URLSearchParams({ index: sym, interval: String(interval) });
        if (expiryOverride) qs.set("expiry", expiryOverride);

        const res = await fetch(`/api/optionchain?${qs.toString()}`);
        const data = await res.json();

        if (!res.ok || data?.error) {
          setError(
            data?.error === "not_connected"
              ? "Not connected to Kite — please log in."
              : data?.message || "API error"
          );
          return;
        }

        setError(null);
        setRows(data.rows || []);
        setSpot(data.spot ?? null);
        setExpiry(data.expiry ?? null);
        setExpiries(data.expiries || []);
        setUpdatedAt(data.updatedAt ?? null);

        if (data.spot != null && (data.rows || []).length) {
          let closest = data.rows[0];
          let closestDist = Math.abs(closest.strike - data.spot);
          for (const r of data.rows) {
            const d = Math.abs(r.strike - data.spot);
            if (d < closestDist) {
              closest = r;
              closestDist = d;
            }
          }
          setSelectedStrike((prev) => prev ?? closest.strike);
        }
      } catch (err) {
        setError("Network error");
      } finally {
        inFlightRef.current = false;
      }
    },
    [interval]
  );

  const fetchHistoricalDate = useCallback(async (sym, date) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const strikeRows = await loadStrikesForDate(sym, date);

      setError(null);
      const mappedRows = strikeRows.map((r) => ({
        strike: r.strike,
        CE_oi: r.ceOi,
        PE_oi: r.peOi,
        CE_oiChange: r.ceOiChange,
        PE_oiChange: r.peOiChange,
      }));

      setRows(mappedRows);
      setSpot(null);
      setExpiry(null);
      setExpiries([]);
      setUpdatedAt(mappedRows.length ? `${date}T${strikeRows[0]?.time || "00:00:00"}` : null);

      if (!mappedRows.length) {
        setError(`No saved data found for ${date}.`);
        return;
      }

      setSelectedStrike((prev) => prev ?? mappedRows[Math.floor(mappedRows.length / 2)].strike);
    } catch (err) {
      setError("Failed to load saved data for that date.");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    setSelectedStrike(null);
    setRows([]);
    setSpot(null);
    setExpiry(null);
    setExpiries([]);
    setUpdatedAt(null);
    setError(null);
  }, [symbol, selectedDate]);

  useEffect(() => {
    if (selectedDate) {
      fetchHistoricalDate(symbol, selectedDate);
    }
  }, [symbol, selectedDate, fetchHistoricalDate]);

  useEffect(() => {
    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;

      setMarketOpen(isMarketOpenNow());

      if (!selectedDate) {
        await fetchData(symbol);
        if (cancelled) return;
        timeoutRef.current = setTimeout(loop, POLL_MS);
      }
    };

    if (!selectedDate) {
      loop();
    }

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [symbol, selectedDate, fetchData]);

  useEffect(() => {
    setMarketOpen(isMarketOpenNow());
    const t = setInterval(() => setMarketOpen(isMarketOpenNow()), 30000);
    return () => clearInterval(t);
  }, []);

  const selectedRow = rows.find((r) => r.strike === Number(selectedStrike));

  useEffect(() => {
    let cancelled = false;

    if (!selectedStrike) {
      setTrendHistory([]);
      setSelectedStrikeHistory([]);
      return;
    }

    const refreshHistory = () => {
      loadTrendHistory(symbol, selectedStrike, selectedDate).then((points) => {
        if (!cancelled) setTrendHistory(points);
      });

      loadSelectedStrikeHistory(symbol, selectedStrike, selectedDate).then((points) => {
        if (!cancelled) setSelectedStrikeHistory(points);
      });
    };

    refreshHistory();

    let historyTimer = null;
    if (!selectedDate) {
      historyTimer = setInterval(refreshHistory, POLL_MS);
    }

    return () => {
      cancelled = true;
      if (historyTimer) clearInterval(historyTimer);
    };
  }, [symbol, selectedStrike, interval, selectedDate]);

  useEffect(() => {
    if (!selectedRow || (selectedRow.CE_oi == null && selectedRow.PE_oi == null)) return;

    const point = {
      time: updatedAt ? new Date(updatedAt).toLocaleTimeString() : getISTTimeString(new Date()),
      ceOi: selectedRow.CE_oi ?? null,
      peOi: selectedRow.PE_oi ?? null,
      ceOiChange: selectedRow.CE_oiChange ?? null,
      peOiChange: selectedRow.PE_oiChange ?? null,
    };

    setTrendHistory((prev) => [...prev, point].slice(-30));
  }, [
    selectedRow?.CE_oi,
    selectedRow?.PE_oi,
    selectedRow?.CE_oiChange,
    selectedRow?.PE_oiChange,
    updatedAt,
  ]);

  const selectedDiff = useMemo(
    () => diffPct(selectedRow?.CE_oiChange ?? null, selectedRow?.PE_oiChange ?? null),
    [selectedRow]
  );

  const selectedSentiment = useMemo(
    () => sentimentFromDiff(selectedDiff),
    [selectedDiff]
  );

  const selectedOiSentiment = useMemo(
    () => oiSentiment(selectedRow?.CE_oi ?? null, selectedRow?.PE_oi ?? null),
    [selectedRow]
  );

  const consolidatedStrikeHistory = useMemo(
    () => consolidateByInterval(selectedStrikeHistory, interval),
    [selectedStrikeHistory, interval]
  );

  const oiChangeLineChartData = useMemo(
    () => ({
      labels: trendHistory.length ? trendHistory.map((p) => p.time) : ["Now"],
      datasets: [
        {
          label: "Δ Call OI",
          data: trendHistory.length
            ? trendHistory.map((p) => p.ceOiChange)
            : [selectedRow?.CE_oiChange ?? null],
          borderColor: "#059669",
          backgroundColor: "rgba(5, 150, 105, 0.12)",
          pointBackgroundColor: "#059669",
          pointBorderColor: "#059669",
          pointRadius: trendHistory.length > 1 ? 2.5 : 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
        },
        {
          label: "Δ Put OI",
          data: trendHistory.length
            ? trendHistory.map((p) => p.peOiChange)
            : [selectedRow?.PE_oiChange ?? null],
          borderColor: "#e11d48",
          backgroundColor: "rgba(225, 29, 72, 0.10)",
          pointBackgroundColor: "#e11d48",
          pointBorderColor: "#e11d48",
          pointRadius: trendHistory.length > 1 ? 2.5 : 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
        },
      ],
    }),
    [trendHistory, selectedRow]
  );

  const oiLineChartData = useMemo(
    () => ({
      labels: trendHistory.length ? trendHistory.map((p) => p.time) : ["Now"],
      datasets: [
        {
          label: "Call OI",
          data: trendHistory.length
            ? trendHistory.map((p) => p.ceOi)
            : [selectedRow?.CE_oi ?? null],
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.10)",
          pointBackgroundColor: "#2563eb",
          pointBorderColor: "#2563eb",
          pointRadius: trendHistory.length > 1 ? 2.5 : 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
        },
        {
          label: "Put OI",
          data: trendHistory.length
            ? trendHistory.map((p) => p.peOi)
            : [selectedRow?.PE_oi ?? null],
          borderColor: "#d97706",
          backgroundColor: "rgba(217, 119, 6, 0.10)",
          pointBackgroundColor: "#d97706",
          pointBorderColor: "#d97706",
          pointRadius: trendHistory.length > 1 ? 2.5 : 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
        },
      ],
    }),
    [trendHistory, selectedRow]
  );

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: { usePointStyle: true, boxWidth: 10, padding: 18 },
      },
      title: { display: false },
      tooltip: { mode: "index", intersect: false },
    },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        grid: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, color: "#64748b" },
      },
      y: {
        grid: { color: "rgba(148, 163, 184, 0.18)" },
        ticks: { color: "#64748b" },
      },
    },
  };

  return (
    <main className="min-h-screen w-full bg-[#f8f9fa] px-2 py-5 text-slate-800 sm:px-4 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        
        {/* Unified Header & Controls */}
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-sm">
                  <FaSitemap className="text-lg" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                    {symbol} Chart Trend
                  </h1>
                  <p className="mt-0.5 text-sm font-medium text-slate-500">
                    {selectedDate ? `Viewing saved data for ${selectedDate}` : "Live OI trend and strike history overview"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
              >
                {indexOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                value={interval}
                onChange={(e) => setIntervalValue(Number(e.target.value))}
              >
                {intervalOptions.map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>

              <input
                type="date"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition cursor-pointer focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                onClick={(e) => {
                  if (typeof e.target.showPicker === 'function') e.target.showPicker();
                }}
              />

              {!selectedDate && expiries.length > 0 ? (
                <select
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  value={expiry || ""}
                  onChange={(e) => {
                    setSelectedStrike(null);
                    setRows([]);
                    setSpot(null);
                    setUpdatedAt(null);
                    setError(null);
                    fetchData(symbol, e.target.value);
                  }}
                >
                  {expiries.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              ) : !selectedDate ? (
                <div className="flex items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 font-medium text-slate-400">
                  Expiry loading...
                </div>
              ) : (
                <div className="flex items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2 font-medium text-slate-400">
                  Expiry N/A
                </div>
              )}

              <select
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                value={selectedStrike || ""}
                onChange={(e) => setSelectedStrike(Number(e.target.value))}
              >
                {rows.map((r) => (
                  <option key={r.strike} value={r.strike}>{r.strike}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <StatCard label="Spot" value={spot != null ? spot.toLocaleString() : "—"} tone="blue" />
            <StatCard label="Expiry" value={expiry || "—"} tone="slate" />
            <StatCard label="Updated" value={updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"} tone="slate" />
            <StatCard label="Call OI" value={selectedRow?.CE_oi != null ? Number(selectedRow.CE_oi).toLocaleString() : "—"} tone="blue" />
            <StatCard label="Put OI" value={selectedRow?.PE_oi != null ? Number(selectedRow.PE_oi).toLocaleString() : "—"} tone="amber" />
            <StatCard label="Snapshots" value={trendHistory.length} tone="slate" />
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-500/10 to-white px-5 py-4 shadow-sm flex flex-col justify-center">
              <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">ΔOI Sentiment</div>
              <div className={`mt-1 font-display text-xl font-bold ${selectedSentiment === "Bullish" ? "text-emerald-700" : selectedSentiment === "Bearish" ? "text-rose-700" : "text-amber-700"}`}>
                {selectedSentiment}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-500/10 to-white px-5 py-4 shadow-sm flex flex-col justify-center">
              <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">OI Sentiment</div>
              <div className={`mt-1 font-display text-xl font-bold ${selectedOiSentiment === "Bullish" ? "text-emerald-700" : selectedOiSentiment === "Bearish" ? "text-rose-700" : "text-amber-700"}`}>
                {selectedOiSentiment}
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm">
            {error}
          </div>
        )}

        {/* Charts Section */}
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Raw Call OI / Put OI</h3>
                <p className="text-sm text-slate-500">Open interest totals for the selected strike over time.</p>
              </div>
              {selectedRow && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    Strike: {selectedRow.strike}
                  </span>
                </div>
              )}
            </div>
            <div className="h-[420px] rounded-xl border border-slate-100 bg-slate-50/50 p-2 md:p-4">
              <Line key={`${symbol}-${selectedStrike}-${interval}-${selectedDate}-oi`} data={oiLineChartData} options={chartOptions} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
            <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-800">ΔOI Trend</h3>
                <p className="text-sm text-slate-500">Call and put OI change over time.</p>
              </div>
              {selectedRow && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    Strike: {selectedRow.strike}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-sm ${sentimentClasses(selectedSentiment)}`}>
                    {selectedSentiment}
                  </span>
                </div>
              )}
            </div>
            <div className="h-[420px] rounded-xl border border-slate-100 bg-slate-50/50 p-2 md:p-4">
              <Line key={`${symbol}-${selectedStrike}-${interval}-${selectedDate}-diff`} data={oiChangeLineChartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Selected Strike History Table */}
        {consolidatedStrikeHistory.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold text-slate-800">Selected Strike History - {selectedStrike}</h3>
                <div className="text-sm font-medium text-slate-500">
                  {consolidatedStrikeHistory.length} records · {interval} min interval
                </div>
              </div>
            </div>

            <div className="max-h-[500px] overflow-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-600">
                    <th className="border-b border-slate-200 px-4 py-3 text-left">Strike</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left">Date</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-left">Time</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-right">Call OI</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-right">Put OI</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-right">Call Chg OI</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-right">Put Chg OI</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-center">ΔOI Sentiment</th>
                    <th className="border-b border-slate-200 px-4 py-3 text-center">OI Sentiment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {consolidatedStrikeHistory.map((row, idx) => {
                    const callChg = Number(row.ceOiChange ?? 0);
                    const putChg = Number(row.peOiChange ?? 0);
                    const diff = putChg - callChg;
                    const sentiment = diff > 0 ? "Bullish" : diff < 0 ? "Bearish" : "Neutral";
                    const rowOiSentiment = oiSentiment(row.ceOi ?? null, row.peOi ?? null);

                    return (
                      <tr
                        key={row.id || `${row.strike}-${row.date}-${row.time}-${idx}`}
                        className={`transition-colors hover:bg-slate-50 ${
                          sentiment === "Bullish" ? "bg-emerald-50/20" : sentiment === "Bearish" ? "bg-rose-50/20" : "bg-white"
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-800">{row.strike}</td>
                        <td className="px-4 py-3 font-medium text-slate-600">{row.date}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{row.time}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{row.ceOi == null ? "N/A" : Number(row.ceOi).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{row.peOi == null ? "N/A" : Number(row.peOi).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{row.ceOiChange == null ? "N/A" : Number(row.ceOiChange).toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{row.peOiChange == null ? "N/A" : Number(row.peOiChange).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block rounded px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide border shadow-sm ${sentimentClasses(sentiment)}`}>
                            {sentiment}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block rounded px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide border shadow-sm ${sentimentClasses(rowOiSentiment)}`}>
                            {rowOiSentiment}
                          </span>
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
    </main>
  );
}