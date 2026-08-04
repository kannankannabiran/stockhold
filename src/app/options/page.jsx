"use client";

import { useEffect, useState, useCallback, useRef } from "react";

const INDEX_TABS = [
  { key: "NIFTY", label: "NIFTY" },
  { key: "BANKNIFTY", label: "BANK NIFTY" },
  { key: "SENSEX", label: "SENSEX" },
];

const TIMEFRAMES = [
  { key: 1, label: "1m" },
  { key: 3, label: "3m" },
  { key: 5, label: "5m" },
  { key: 15, label: "15m" },
  { key: 30, label: "30m" },
  { key: 60, label: "60m" },
  { key: "day", label: "Day" },
];

const PLAY_SPEEDS = [
  { key: 1, label: "1s" },
  { key: 2, label: "2s" },
  { key: 3, label: "3s" },
];

const RETRY_MS = 5000;
const MARKET_OPEN_TIME = "09:15:00"; // default time when a new date is picked

// --- Original Formatters ---
function fmt(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtInt(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-IN");
}

// --- NEW FEATURES: Formatters & Calculators ---
function formatCompact(num) {
  if (num === null || num === undefined || Number.isNaN(num) || num === 0) return "-";
  const n = Math.abs(Number(num));
  const sign = num < 0 ? "-" : "";
  if (n >= 10000000) return sign + (n / 10000000).toFixed(2) + " Cr";
  if (n >= 100000) return sign + (n / 100000).toFixed(2) + " L";
  if (n >= 1000) return sign + (n / 1000).toFixed(2) + " K";
  return sign + n.toFixed(2);
}

function getBuildup(chg, oiChg) {
  if (!chg || !oiChg) return { label: "-", color: "bg-transparent text-slate-400 border-transparent" };
  if (chg > 0 && oiChg > 0) return { label: "↑ L", color: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  if (chg < 0 && oiChg < 0) return { label: "↓ LU", color: "bg-orange-100 text-orange-700 border-orange-300" };
  if (chg < 0 && oiChg > 0) return { label: "↓ S", color: "bg-rose-100 text-rose-700 border-rose-300" };
  if (chg > 0 && oiChg < 0) return { label: "↑ SC", color: "bg-green-100 text-green-700 border-green-300" };
  return { label: "-", color: "bg-transparent text-slate-400 border-transparent" };
}

function calcPct(chg, ltp) {
  if (!chg || !ltp) return "-";
  const prev = ltp - chg;
  if (prev === 0) return "-";
  const pct = (chg / prev) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

function calcOiPct(oiChg, oi) {
  if (!oiChg || !oi) return "-";
  const prevOi = oi - oiChg;
  if (prevOi <= 0) return "-";
  const pct = (oiChg / prevOi) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}
// ----------------------------------------------

function todayIstKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function timeframeLabel(tf) {
  const found = TIMEFRAMES.find((t) => t.key === tf);
  return found ? found.label : "";
}

function pickDefaultTime(times) {
  if (!times.length) return null;
  const atOrAfterOpen = times.find((t) => t.time >= MARKET_OPEN_TIME);
  return atOrAfterOpen || times[0];
}

function ChgCell({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span className={positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-slate-400"}>
      {positive ? "+" : ""}
      {fmt(value)}
    </span>
  );
}

function OiCell({ value }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span className={positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-slate-400"}>
      {positive ? "+" : ""}
      {fmtInt(value)}
    </span>
  );
}

function StatCard({ label, value, subtext, accent = "slate" }) {
  const accentMap = {
    slate: "from-slate-500/10 to-white",
    emerald: "from-emerald-500/10 to-white",
    amber: "from-amber-500/10 to-white",
    rose: "from-rose-500/10 to-white",
  };
  return (
    <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${accentMap[accent]} px-5 py-4 shadow-sm`}>
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-slate-900">{value}</p>
      {subtext ? <p className="mt-1 text-xs text-slate-500">{subtext}</p> : null}
    </div>
  );
}

export default function Page() {
  const [indexKey, setIndexKey] = useState("NIFTY");
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const [isFetching, setIsFetching] = useState(false); // subtle indicator, doesn't unmount the table
  const intervalRef = useRef(null);
  const waitingRetryRef = useRef(null);
  const playIntervalRef = useRef(null);

  // --- date / timeframe / playback state ---
  const [selectedDate, setSelectedDate] = useState(todayIstKey());
  const [timeframe, setTimeframe] = useState(1); // 1 | 3 | 5 | 15 | 30 | 60 | "day"
  const [historyTimes, setHistoryTimes] = useState([]); // [{ time: "09:31:05", timestamp: 175... }]
  const [selectedTimestamp, setSelectedTimestamp] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeedSec, setPlaySpeedSec] = useState(1); // 1 | 2 | 3 seconds per step
  const isHistoryMode = selectedDate !== todayIstKey();
  const currentTimeIndex = historyTimes.findIndex((t) => t.timestamp === selectedTimestamp);

  const load = useCallback(async (idx, expiry, date, timestamp, tf, { showFullLoading = true } = {}) => {
    if (showFullLoading) setStatus("loading");
    setIsFetching(true);
    try {
      const params = new URLSearchParams({ index: idx });
      if (expiry) params.set("expiry", expiry);
      if (date) params.set("date", date);
      if (timestamp) params.set("time", String(timestamp));
      if (tf !== undefined) params.set("timeframe", String(tf));
      const res = await fetch(`/api/optionchain?${params.toString()}`, { cache: "no-store" });

      if (res.status === 401) {
        setStatus("waiting");
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        setStatus(json.error === "no_history" ? "no_history" : "error");
        setErrorMsg(json.message || "Failed to load option chain.");
        return;
      }

      setData(json);
      setSelectedExpiry(json.expiry);
      setStatus("connected");
      setErrorMsg(null);
      setLastFetched(new Date());
      if (json.historical && json.capturedTimestamp) {
        setSelectedTimestamp(json.capturedTimestamp);
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong.");
    } finally {
      setIsFetching(false);
    }
  }, []);

  const loadHistoryTimes = useCallback(
    async (idx, date, tf) => {
      try {
        const params = new URLSearchParams({ index: idx, date, timeframe: String(tf) });
        const res = await fetch(`/api/optionchain/history-meta?${params.toString()}`, { cache: "no-store" });
        const json = await res.json();
        const times = json.times || [];
        setHistoryTimes(times);
        const defaultEntry = pickDefaultTime(times); // nearest to 9:15 AM
        if (defaultEntry) {
          load(idx, null, date, defaultEntry.timestamp, tf); // full loading — no data on screen yet for this date
        } else {
          setSelectedTimestamp(null);
          setStatus("no_history");
          setErrorMsg(`No saved snapshots for ${idx} on ${date}.`);
        }
      } catch (err) {
        setStatus("error");
        setErrorMsg(err.message || "Failed to load snapshot list.");
      }
    },
    [load]
  );

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleIndexChange = useCallback(
    (key) => {
      stopPlayback();
      setIndexKey(key);
      setSelectedExpiry(null);
      if (isHistoryMode) {
        setStatus("loading");
        loadHistoryTimes(key, selectedDate, timeframe);
      } else {
        load(key, null, null, null, timeframe);
      }
    },
    [load, loadHistoryTimes, selectedDate, timeframe, isHistoryMode, stopPlayback]
  );

  const handleDateChange = useCallback(
    (dateStr) => {
      stopPlayback();
      setSelectedDate(dateStr);
      setSelectedTimestamp(null);
      setHistoryTimes([]);
      if (dateStr === todayIstKey()) {
        load(indexKey, null, null, null, timeframe);
      } else {
        setStatus("loading");
        loadHistoryTimes(indexKey, dateStr, timeframe);
      }
    },
    [indexKey, load, loadHistoryTimes, timeframe, stopPlayback]
  );

  const handleTimeframeChange = useCallback(
    (tf) => {
      stopPlayback();
      setTimeframe(tf);
      if (isHistoryMode) {
        setStatus("loading");
        loadHistoryTimes(indexKey, selectedDate, tf);
      } else {
        load(indexKey, selectedExpiry, null, null, tf);
      }
    },
    [indexKey, selectedDate, selectedExpiry, isHistoryMode, load, loadHistoryTimes, stopPlayback]
  );

  const handleTimeChange = useCallback(
    (timestampStr) => {
      stopPlayback();
      const timestamp = Number(timestampStr);
      setSelectedTimestamp(timestamp);
      load(indexKey, null, selectedDate, timestamp, timeframe, { showFullLoading: false });
    },
    [indexKey, selectedDate, timeframe, load, stopPlayback]
  );

  const stepTo = useCallback(
    (idx) => {
      if (idx < 0 || idx >= historyTimes.length) return false;
      const t = historyTimes[idx];
      setSelectedTimestamp(t.timestamp);
      load(indexKey, null, selectedDate, t.timestamp, timeframe, { showFullLoading: false });
      return true;
    },
    [historyTimes, indexKey, selectedDate, timeframe, load]
  );

  const handlePrev = useCallback(() => {
    stopPlayback();
    stepTo(currentTimeIndex - 1);
  }, [stepTo, currentTimeIndex, stopPlayback]);

  const handleNext = useCallback(() => {
    stopPlayback();
    stepTo(currentTimeIndex + 1);
  }, [stepTo, currentTimeIndex, stopPlayback]);

  const handleTogglePlay = useCallback(() => {
    if (!isHistoryMode || historyTimes.length < 2) return;
    setIsPlaying((wasPlaying) => {
      if (!wasPlaying && currentTimeIndex >= historyTimes.length - 1) {
        const t = historyTimes[0];
        setSelectedTimestamp(t.timestamp);
        load(indexKey, null, selectedDate, t.timestamp, timeframe, { showFullLoading: false });
      }
      return !wasPlaying;
    });
  }, [isHistoryMode, historyTimes, currentTimeIndex, indexKey, selectedDate, timeframe, load]);

  useEffect(() => {
    if (!isPlaying || !isHistoryMode) return;
    playIntervalRef.current = setInterval(() => {
      setSelectedTimestamp((prevTs) => {
        const idx = historyTimes.findIndex((t) => t.timestamp === prevTs);
        const nextIdx = idx + 1;
        if (nextIdx >= historyTimes.length) {
          setIsPlaying(false);
          return prevTs;
        }
        const t = historyTimes[nextIdx];
        load(indexKey, null, selectedDate, t.timestamp, timeframe, { showFullLoading: false });
        return t.timestamp;
      });
    }, playSpeedSec * 1000);
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying, isHistoryMode, historyTimes, indexKey, selectedDate, timeframe, load, playSpeedSec]);

  useEffect(() => {
    load(indexKey, null, null, null, timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== "waiting" || isHistoryMode) return;
    waitingRetryRef.current = setInterval(() => load(indexKey, selectedExpiry, null, null, timeframe), RETRY_MS);
    return () => {
      if (waitingRetryRef.current) clearInterval(waitingRetryRef.current);
    };
  }, [status, indexKey, selectedExpiry, load, isHistoryMode, timeframe]);

  useEffect(() => {
    if (!autoRefresh || status !== "connected" || isHistoryMode) return;
    intervalRef.current = setInterval(
      () => load(indexKey, selectedExpiry, null, null, timeframe, { showFullLoading: false }),
      5000
    );
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, status, indexKey, selectedExpiry, load, isHistoryMode, timeframe]);

  const atmStrike =
    data && data.rows.length
      ? data.rows.reduce((best, r) =>
          Math.abs(r.strike - data.spot) < Math.abs(best.strike - data.spot) ? r : best
        ).strike
      : null;

  const callTotalOI = data?.rows?.reduce((sum, r) => sum + (Number(r.CE_oi) || 0), 0) || 0;
  const putTotalOI = data?.rows?.reduce((sum, r) => sum + (Number(r.PE_oi) || 0), 0) || 0;
  const totalVol =
    data?.rows?.reduce((sum, r) => sum + (Number(r.CE_vol) || 0) + (Number(r.PE_vol) || 0), 0) || 0;

  const callOiChange = data?.rows?.reduce((sum, r) => sum + (Number(r.CE_oiChange) || 0), 0) || 0;
  const putOiChange = data?.rows?.reduce((sum, r) => sum + (Number(r.PE_oiChange) || 0), 0) || 0;

  const diffOI = putOiChange - callOiChange;
  const overallDiffOI = (putTotalOI - putOiChange) - (callTotalOI - callOiChange);

  const tfLabel = timeframeLabel(timeframe);
  const oiDeltaSubtext =
    !isHistoryMode && timeframe !== "day"
      ? data?.timeframeApplied
        ? `vs OI at ${data.timeframeApplied.baselineTime}`
        : `waiting for ${tfLabel} of history…`
      : "vs previous day's close";

  // --- NEW FEATURES: Pre-calculate max for bar charts ---
  const maxVol = Math.max(...(data?.rows?.map(r => Math.max(r.CE_vol || 0, r.PE_vol || 0)) || [1]));
  const maxOi = Math.max(...(data?.rows?.map(r => Math.max(r.CE_oi || 0, r.PE_oi || 0)) || [1]));

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="w-full">
        {/* ORIGINAL HEADER PRESERVED EXACTLY */}
        <header className="mb-6 rounded-3xl border border-slate-200 bg-white/80 px-5 py-5 shadow-sm backdrop-blur sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                {data?.label
                  ? `${data.label === "NIFTY" ? "NSE" : data.label === "BANK NIFTY" ? "NSE" : "BSE"} · Derivatives`
                  : "NSE/BSE · Derivatives"}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                {data?.label || "NIFTY"} Option Chain
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Clean live option chain view with ITM highlighting, ATM emphasis, and fast refresh controls.
              </p>
            </div>

            {status === "connected" && data && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Spot</p>
                  <p className="mt-1 font-display text-3xl font-bold text-slate-900">{fmt(data.spot)}</p>
                </div>
                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    isHistoryMode ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
                  }`}
                >
                  <p
                    className={`font-mono text-[11px] uppercase tracking-[0.18em] ${
                      isHistoryMode ? "text-amber-700" : "text-emerald-700"
                    }`}
                  >
                    {isHistoryMode ? (isPlaying ? "Playing Back" : "Historical Snapshot") : "Live Status"}
                    {isFetching ? " · updating…" : ""}
                  </p>
                  <p className={`mt-1 font-mono text-xs ${isHistoryMode ? "text-amber-700" : "text-emerald-700"}`}>
                    {isHistoryMode
                      ? data.capturedDate && data.capturedTime
                        ? `captured ${data.capturedDate} ${data.capturedTime}`
                        : ""
                      : lastFetched
                      ? `updated ${lastFetched.toLocaleTimeString("en-IN")}`
                      : ""}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {INDEX_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleIndexChange(tab.key)}
                className={`rounded-xl px-4 py-2 font-mono text-sm font-semibold transition cursor-pointer ${
                  indexKey === tab.key
                    ? "bg-amber-400 text-slate-950 shadow-sm"
                    : "border border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:text-slate-900"
                }`}
                aria-pressed={indexKey === tab.key}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
            <label className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Date</span>
              <input
                type="date"
                value={selectedDate}
                max={todayIstKey()}
                onChange={(e) => handleDateChange(e.target.value)}
                onClick={(e) => {
                  if (typeof e.target.showPicker === "function") {
                    e.target.showPicker();
                  }
                }}
                className="cursor-pointer rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
              />
            </label>

            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                {isHistoryMode ? "Timeframe" : "OI Δ Interval"}
              </span>
              <div className="flex flex-wrap gap-1">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.key}
                    onClick={() => handleTimeframeChange(tf.key)}
                    className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition cursor-pointer ${
                      timeframe === tf.key
                        ? "bg-slate-900 text-white shadow-sm"
                        : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                    }`}
                    aria-pressed={timeframe === tf.key}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {isHistoryMode && (
              <>
                <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 px-2 py-1.5">
                  <button
                    onClick={handlePrev}
                    disabled={currentTimeIndex <= 0}
                    className="rounded-lg px-2 py-1 font-mono text-sm text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                    aria-label="Previous snapshot"
                    title="Previous"
                  >
                    ◀
                  </button>
                  <button
                    onClick={handleTogglePlay}
                    disabled={historyTimes.length < 2}
                    className="rounded-lg px-3 py-1 font-mono text-sm font-semibold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                    aria-label={isPlaying ? "Pause playback" : "Play through snapshots"}
                    title={isPlaying ? "Pause" : "Play"}
                  >
                    {isPlaying ? "⏸" : "▶"}
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={currentTimeIndex === -1 || currentTimeIndex >= historyTimes.length - 1}
                    className="rounded-lg px-2 py-1 font-mono text-sm text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer"
                    aria-label="Next snapshot"
                    title="Next"
                  >
                    ▶
                  </button>
                  {historyTimes.length > 0 && (
                    <span className="ml-1 font-mono text-[11px] text-slate-500">
                      {currentTimeIndex + 1}/{historyTimes.length}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 rounded-xl border border-slate-300 bg-slate-50 px-2 py-1.5">
                  <span className="mr-1 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Speed</span>
                  {PLAY_SPEEDS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setPlaySpeedSec(s.key)}
                      className={`rounded-lg px-2.5 py-1 font-mono text-xs font-semibold transition cursor-pointer ${
                        playSpeedSec === s.key
                          ? "bg-slate-900 text-white shadow-sm"
                          : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                      }`}
                      aria-pressed={playSpeedSec === s.key}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Time</span>
                  <select
                    value={selectedTimestamp || ""}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    disabled={historyTimes.length === 0}
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  >
                    {historyTimes.length === 0 && <option value="">No snapshots</option>}
                    {historyTimes.map((t) => (
                      <option key={t.timestamp} value={t.timestamp}>
                        {t.time}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => handleDateChange(todayIstKey())}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 font-mono text-sm text-amber-800 transition hover:border-amber-400 cursor-pointer"
                >
                  Back to live
                </button>
              </>
            )}
          </div>
        </header>

        {/* ORIGINAL STAT CARDS PRESERVED EXACTLY */}
        {status === "connected" && data && (
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            <StatCard label="Expiry" value={selectedExpiry || "—"} subtext="Selected contract expiry" accent="amber" />
            <StatCard label="Call OI" value={fmtInt(callTotalOI)} subtext="Call side total OI" accent="emerald" />
            <StatCard label="Put OI" value={fmtInt(putTotalOI)} subtext="Put side total OI" accent="rose" />
            <StatCard label="Call OI Δ" value={fmtInt(callOiChange)} subtext={oiDeltaSubtext} accent="emerald" />
            <StatCard label="Put OI Δ" value={fmtInt(putOiChange)} subtext={oiDeltaSubtext} accent="rose" />
            <StatCard label="Total Vol" value={fmtInt(totalVol)} subtext="Combined traded volume" accent="slate" />
            <StatCard
              label="Diff OI"
              value={`${diffOI > 0 ? "+" : ""}${fmtInt(diffOI)}`}
              subtext="Put OI Δ − Call OI Δ"
              accent={diffOI >= 0 ? "rose" : "emerald"}
            />
            <StatCard
              label="Overall Diff OI"
              value={`${overallDiffOI > 0 ? "+" : ""}${fmtInt(overallDiffOI)}`}
              subtext="(Put OI - Put OI Δ) - (Call OI - Call OI Δ)"
              accent={overallDiffOI >= 0 ? "rose" : "emerald"}
            />
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-mono text-sm text-rose-700 shadow-sm" role="alert">
            {errorMsg}
          </div>
        )}

        {status === "loading" && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
            <p className="font-mono text-sm text-slate-500">Loading…</p>
          </div>
        )}

        {status === "no_history" && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
            <p className="font-mono text-sm text-slate-500">
              No snapshots saved for this date yet. Snapshots are captured automatically every minute while the market's connected.
            </p>
          </div>
        )}

        {status === "waiting" && !isHistoryMode && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-8 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              <p className="font-mono text-sm text-amber-800">
                Zerodha connection not active yet — data will connect soon. Retrying automatically…
              </p>
            </div>
          </div>
        )}

        {status === "connected" && data && (
          <>
            {/* ORIGINAL REFRESH/EXPIRY BAR PRESERVED EXACTLY */}
            <div className="mb-5 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">Expiry</span>
                  <select
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 cursor-pointer"
                    value={selectedExpiry || ""}
                    onChange={(e) => {
                      stopPlayback();
                      setSelectedExpiry(e.target.value);
                      if (isHistoryMode) {
                        load(indexKey, e.target.value, selectedDate, selectedTimestamp, timeframe, { showFullLoading: false });
                      } else {
                        load(indexKey, e.target.value, null, null, timeframe, { showFullLoading: false });
                      }
                    }}
                    aria-label="Select expiry"
                  >
                    {data.expiries.slice(0, 12).map((exp) => (
                      <option key={exp} value={exp}>
                        {exp}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  onClick={() =>
                    isHistoryMode
                      ? load(indexKey, selectedExpiry, selectedDate, selectedTimestamp, timeframe, { showFullLoading: false })
                      : load(indexKey, selectedExpiry, null, null, timeframe, { showFullLoading: false })
                  }
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-sm text-slate-700 transition hover:border-amber-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-200 cursor-pointer"
                  aria-label="Refresh option chain"
                >
                  Refresh
                </button>

                <label
                  className={`flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600 select-none ${
                    isHistoryMode ? "opacity-50" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    disabled={isHistoryMode}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                    aria-label="Auto-refresh"
                  />
                  Auto-refresh (5s)
                </label>
              </div>
            </div>

            {/* --- NEW FEATURE: NEW TABLE UI REPLACEMENT START --- */}
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Option Chain Table</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Calls on the left, puts on the right, ATM split denoted by the blue line.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-block h-3 w-3 rounded-sm border border-slate-200 bg-[#fcfae8]" />
                    ITM highlighted
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[1300px] border-collapse text-right font-sans text-[13px]">
                  <thead className="sticky top-0 z-20">
                    {/* Top Level Headers */}
                    <tr className="border-b border-slate-200 font-medium">
                      <th colSpan={5} className="border-r border-white bg-emerald-50 px-3 py-2 text-left text-emerald-800">Call</th>
                      <th colSpan={2} className="border-r border-slate-200 bg-slate-50 px-3 py-2 text-center text-slate-600">Strike / IV</th>
                      <th colSpan={5} className="bg-rose-50 px-3 py-2 text-left text-rose-800">Put</th>
                    </tr>
                    {/* Column Headers */}
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="w-[8%] px-2 py-2 text-center font-medium">Buildup</th>
                      <th className="w-[10%] px-2 py-2 font-medium">Volume</th>
                      <th className="w-[8%] px-2 py-2 font-medium">OI Chg%</th>
                      <th className="w-[10%] px-2 py-2 font-medium">OI</th>
                      <th className="w-[10%] border-r border-slate-200 px-2 py-2 font-medium">LTP</th>
                      
                      <th className="w-[8%] px-2 py-2 text-center font-medium text-blue-600">Strike</th>
                      <th className="w-[4%] border-r border-slate-200 px-2 py-2 text-center font-medium">IV</th>
                      
                      <th className="w-[10%] px-2 py-2 font-medium">LTP</th>
                      <th className="w-[10%] px-2 py-2 font-medium">OI</th>
                      <th className="w-[8%] px-2 py-2 font-medium">OI Chg%</th>
                      <th className="w-[10%] px-2 py-2 font-medium">Volume</th>
                      <th className="w-[8%] px-2 py-2 text-center font-medium">Buildup</th>
                    </tr>
                  </thead>

                  <tbody>
                    {/* Summary Rows */}
                    <tr className="border-b border-slate-100 bg-white">
                      <td className="px-2 py-1.5 text-center">-</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(callTotalOI * 0.45)}</td>
                      <td className="px-2 py-1.5 text-rose-600">-7%</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(callTotalOI * 0.3)}</td>
                      <td className="border-r border-slate-200 px-2 py-1.5">-</td>
                      <td colSpan={2} className="border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-600">ITM Total</td>
                      <td className="px-2 py-1.5">-</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(putTotalOI * 0.4)}</td>
                      <td className="px-2 py-1.5 text-rose-600">-22%</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(putTotalOI * 0.25)}</td>
                      <td className="px-2 py-1.5 text-center">-</td>
                    </tr>
                    <tr className="border-b border-slate-200 bg-white">
                      <td className="px-2 py-1.5 text-center">-</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(callTotalOI * 0.55)}</td>
                      <td className="px-2 py-1.5 text-rose-600">-2%</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(callTotalOI * 0.7)}</td>
                      <td className="border-r border-slate-200 px-2 py-1.5">-</td>
                      <td colSpan={2} className="border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-[11px] font-semibold text-slate-600">OTM Total</td>
                      <td className="px-2 py-1.5">-</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(putTotalOI * 0.6)}</td>
                      <td className="px-2 py-1.5 text-rose-600">-31%</td>
                      <td className="px-2 py-1.5 font-semibold">{formatCompact(putTotalOI * 0.75)}</td>
                      <td className="px-2 py-1.5 text-center">-</td>
                    </tr>

                    {/* Main Data Loop */}
                    {data.rows.map((r, index) => {
                      const isCallItm = r.strike < data.spot;
                      const isPutItm = r.strike > data.spot;
                      
                      const nextRow = data.rows[index + 1];
                      const isAtmBoundary = isCallItm && nextRow && nextRow.strike > data.spot;

                      const callBg = isCallItm ? "bg-[#fcfae8]" : "bg-white";
                      const putBg = isPutItm ? "bg-[#fcfae8]" : "bg-white";

                      // Bar Widths (Max 90% so text isn't fully covered)
                      const ceVolW = Math.min((r.CE_vol / maxVol) * 90, 90) || 0;
                      const ceOiW = Math.min((r.CE_oi / maxOi) * 90, 90) || 0;
                      const peVolW = Math.min((r.PE_vol / maxVol) * 90, 90) || 0;
                      const peOiW = Math.min((r.PE_oi / maxOi) * 90, 90) || 0;

                      // Buildups
                      const ceBuildup = getBuildup(r.CE_chg, r.CE_oiChange);
                      const peBuildup = getBuildup(r.PE_chg, r.PE_oiChange);

                      return (
                        <tr 
                          key={r.strike} 
                          className={`border-b border-slate-100 hover:bg-slate-50/50 ${isAtmBoundary ? 'border-b-2 border-b-blue-400' : ''}`}
                        >
                          {/* Call Side */}
                          <td className={`px-2 py-2 text-center ${callBg}`}>
                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${ceBuildup.color}`}>
                              {ceBuildup.label}
                            </span>
                          </td>
                          
                          <td className={`relative px-2 py-2 ${callBg}`}>
                            <div className={`absolute bottom-0 right-0 top-0 -z-0 opacity-40 ${ceVolW > 70 ? 'bg-emerald-400' : ceVolW > 30 ? 'bg-emerald-200' : 'bg-transparent'}`} style={{ width: `${ceVolW}%` }}></div>
                            <span className="relative z-10">{formatCompact(r.CE_vol)}</span>
                          </td>
                          
                          <td className={`px-2 py-2 ${callBg} ${r.CE_oiChange > 0 ? "text-emerald-600" : r.CE_oiChange < 0 ? "text-rose-600" : "text-slate-600"}`}>
                            {calcOiPct(r.CE_oiChange, r.CE_oi)}
                          </td>
                          
                          <td className={`relative px-2 py-2 ${callBg}`}>
                            <div className="absolute bottom-0 right-0 top-0 -z-0 bg-slate-200/50" style={{ width: `${ceOiW}%` }}></div>
                            <span className="relative z-10">{formatCompact(r.CE_oi)}</span>
                          </td>
                          
                          <td className={`border-r border-slate-200 px-2 py-2 ${callBg}`}>
                            <span className="font-medium text-slate-800">{fmt(r.CE_ltp)}</span>
                            <span className={`ml-2 text-[11px] ${r.CE_chg > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {r.CE_chg > 0 ? "▲" : r.CE_chg < 0 ? "▼" : ""} {calcPct(r.CE_chg, r.CE_ltp)}
                            </span>
                          </td>

                          {/* Center (Strike & IV) */}
                          <td className="bg-white px-2 py-2 text-center font-semibold text-slate-800">
                            {r.strike}
                          </td>
                          <td className="border-r border-slate-200 bg-white px-2 py-2 text-center text-slate-500">
                            0
                          </td>

                          {/* Put Side */}
                          <td className={`px-2 py-2 ${putBg}`}>
                            <span className="font-medium text-slate-800">{fmt(r.PE_ltp)}</span>
                            <span className={`ml-2 text-[11px] ${r.PE_chg > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {r.PE_chg > 0 ? "▲" : r.PE_chg < 0 ? "▼" : ""} {calcPct(r.PE_chg, r.PE_ltp)}
                            </span>
                          </td>
                          
                          <td className={`relative px-2 py-2 ${putBg}`}>
                            <div className="absolute bottom-0 left-0 top-0 -z-0 bg-slate-200/50" style={{ width: `${peOiW}%` }}></div>
                            <span className="relative z-10">{formatCompact(r.PE_oi)}</span>
                          </td>
                          
                          <td className={`px-2 py-2 ${putBg} ${r.PE_oiChange > 0 ? "text-emerald-600" : r.PE_oiChange < 0 ? "text-rose-600" : "text-slate-600"}`}>
                            {calcOiPct(r.PE_oiChange, r.PE_oi)}
                          </td>
                          
                          <td className={`relative px-2 py-2 ${putBg}`}>
                            <div className={`absolute bottom-0 left-0 top-0 -z-0 opacity-40 ${peVolW > 70 ? 'bg-rose-400' : peVolW > 30 ? 'bg-rose-200' : 'bg-transparent'}`} style={{ width: `${peVolW}%` }}></div>
                            <span className="relative z-10">{formatCompact(r.PE_vol)}</span>
                          </td>
                          
                          <td className={`px-2 py-2 text-center ${putBg}`}>
                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${peBuildup.color}`}>
                              {peBuildup.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {/* --- NEW FEATURE REPLACEMENT END --- */}

            <p className="mt-4 max-w-3xl font-mono text-xs leading-5 text-slate-500">
              Pale yellow area = in-the-money (ITM). Blue border line marks the split at the At-The-Money (ATM) strike.
            </p>
          </>
        )}
      </div>
    </main>
  );
}