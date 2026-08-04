"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

const INDEXES = [
  { key: "NIFTY", label: "NIFTY" },
  { key: "BANKNIFTY", label: "BANK NIFTY" },
  { key: "SENSEX", label: "SENSEX" },
];

const REFRESH_MS = 5000;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isWeekend(dateStr) {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function fmt(v) {
  return v === null || v === undefined ? "—" : v;
}

function fmtTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtPts(strike, spot) {
  if (spot == null) return null;
  const diff = Math.round(strike - spot);
  if (diff === 0) return "ATM";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// --- UI Sub-Components ---

function MetricCard({ title, value, subtitle, tone = "slate" }) {
  const tones = {
    slate: "from-slate-500/10 to-white border-slate-200",
    green: "from-emerald-500/10 to-white border-emerald-200",
    blue: "from-blue-500/10 to-white border-blue-200",
    amber: "from-amber-500/10 to-white border-amber-200",
  };

  const textTones = {
    slate: "text-slate-900",
    green: "text-emerald-700",
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

function StatusBadge({ status, broke }) {
  if (status === "OPEN_HIGH") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-700 shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Hit
      </span>
    );
  }
  if (status === "RETEST") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-blue-700 shadow-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span> Retest
      </span>
    );
  }
  if (broke) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> Pending
      </span>
    );
  }
  return <span className="font-semibold text-slate-300">—</span>;
}

function TimeChip({ iso }) {
  const time = fmtTime(iso);
  if (!time) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-slate-600 shadow-sm">
      <svg width="10" height="10" viewBox="0 0 10 10" className="text-slate-400">
        <circle cx="5" cy="5" r="4.25" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M5 2.6V5l1.7 1" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
      {time}
    </span>
  );
}

function StrikeCell({ strike, spot, isAtm }) {
  const pts = fmtPts(strike, spot);
  return (
    <td className={`border-l border-r border-slate-200 px-2 py-2 text-center ${isAtm ? "bg-amber-50/50" : "bg-slate-50/30"}`}>
      <div className="mx-auto flex min-w-[70px] flex-col items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
        <span className="text-sm font-bold text-slate-900">{strike}</span>
        {isAtm ? (
          <span className="mt-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-2 py-[1px] text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
            ATM
          </span>
        ) : pts ? (
          <span className={`mt-0.5 text-[10px] font-bold tracking-wide ${pts.startsWith("+") ? "text-emerald-600" : "text-rose-600"}`}>
            {pts}
          </span>
        ) : null}
      </div>
    </td>
  );
}

export default function OpenHighPage() {
  const [index, setIndex] = useState("NIFTY");
  const [expiry, setExpiry] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateWarning, setDateWarning] = useState(null);

  const isToday = date === todayStr();
  const weekendSelected = isWeekend(date);

  const load = useCallback(async () => {
    if (weekendSelected) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({ index, date });
      if (expiry) params.set("expiry", expiry);

      const res = await fetch(`/api/open-high?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.message || json.error || "Failed to load");
        setData(null);
        return;
      }

      setError(null);
      setData(json);
      if (!expiry) setExpiry(json.expiry || null);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [index, expiry, date, weekendSelected]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    load();

    if (!isToday || weekendSelected) return;
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [index, date, load, isToday, weekendSelected]);

  useEffect(() => {
    if (expiry) load();
  }, [expiry, load]);

  const handleDateChange = (e) => {
    const picked = e.target.value;
    if (isWeekend(picked)) {
      setDateWarning("Markets are closed on weekends — pick a weekday.");
      return;
    }
    setDateWarning(null);
    setDate(picked);
    setExpiry(null);
  };

  const matchedRows = useMemo(() => {
    if (!data?.rows?.length) return [];
    return data.rows.filter((r) => r.CE_status === "OPEN_HIGH" || r.PE_status === "OPEN_HIGH");
  }, [data]);

  const atmStrike = useMemo(() => {
    if (!data?.spot || !matchedRows.length) return null;
    return matchedRows.reduce(
      (closest, r) => (Math.abs(r.strike - data.spot) < Math.abs(closest - data.spot) ? r.strike : closest),
      matchedRows[0].strike
    );
  }, [data, matchedRows]);

  const hitCount = matchedRows.length;
  const isLikelyHoliday = !loading && !weekendSelected && data && data.rows.length === 0;

  return (
    <main className="min-h-screen w-full bg-[#f8f9fa] px-2 py-5 text-slate-800 sm:px-4 lg:px-6">
      <div className="mx-auto w-full space-y-4">
        
        {/* Header Controls */}
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-6 md:py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                    Open <span className="text-emerald-600">= High</span>
                  </h1>
                  <p className="mt-0.5 text-sm font-medium text-slate-500">
                    Live options scanner. First hit time stays saved.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={index}
                onChange={(e) => {
                  setIndex(e.target.value);
                  setExpiry(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                {INDEXES.map((i) => (
                  <option key={i.key} value={i.key}>{i.label}</option>
                ))}
              </select>

              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={handleDateChange}
                onClick={(e) => { if (typeof e.target.showPicker === "function") e.target.showPicker(); }}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              />

              {data?.expiries?.length > 0 && (
                <select 
                  value={expiry || ""} 
                  onChange={(e) => setExpiry(e.target.value)} 
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {data.expiries.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Metric Cards inside Header */}
          {!weekendSelected && (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                title="Spot Price"
                value={data?.spot != null ? data.spot : "—"}
                tone="slate"
              />
              <MetricCard
                title="Matched Strikes"
                value={hitCount}
                subtitle="Total Open=High matches"
                tone="green"
              />
              <MetricCard
                title="Selected Expiry"
                value={data?.expiry || "—"}
                tone="amber"
              />
              <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-500/10 to-white px-5 py-4 shadow-sm flex flex-col justify-center">
                <div className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">Status</div>
                <div className="mt-1 flex items-center gap-2 font-display text-lg font-bold text-blue-700">
                  {isToday && data?.updatedAt ? (
                    <>
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
                      </span>
                      Live • {new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </>
                  ) : !isToday ? (
                    "Historical Data"
                  ) : (
                    "Waiting for connection..."
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Banners */}
        {dateWarning && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm">
            {dateWarning}
          </div>
        )}
        {!isToday && !weekendSelected && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm">
            Viewing history for {date} — read-only mode, no live polling.
          </div>
        )}
        {weekendSelected && (
          <div className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">
            {date} is a weekend — markets are closed, no data to show.
          </div>
        )}
        {isLikelyHoliday && (
          <div className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600 shadow-sm">
            No data recorded for {date} — likely a market holiday.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 shadow-sm">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && !data && !weekendSelected && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <span className="font-mono text-sm font-medium text-slate-500">Loading scanner data...</span>
          </div>
        )}

        {/* Data Table */}
        {data && !weekendSelected && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto w-full">
              <table className="w-full min-w-[1000px] border-collapse text-right font-sans text-[13px]">
                <thead className="sticky top-0 z-20">
                  {/* Grouped Headers */}
                  <tr className="border-b border-slate-200">
                    <th colSpan={6} className="bg-emerald-50/70 px-3 py-2.5 text-center text-[12px] font-bold uppercase tracking-wider text-emerald-800">
                      Call Side
                    </th>
                    <th className="bg-slate-100 px-3 py-2.5 border-l border-r border-slate-200 text-center text-[12px] font-bold uppercase tracking-wider text-slate-700">
                      Strike
                    </th>
                    <th colSpan={6} className="bg-rose-50/70 px-3 py-2.5 text-center text-[12px] font-bold uppercase tracking-wider text-rose-800">
                      Put Side
                    </th>
                  </tr>
                  
                  {/* Column Sub-Headers */}
                  <tr className="border-b border-slate-200 bg-white text-xs font-semibold tracking-wide text-slate-500">
                    <th className="px-3 py-2">Open</th>
                    <th className="px-3 py-2">High</th>
                    <th className="px-3 py-2">Low</th>
                    <th className="px-3 py-2 text-slate-800">LTP</th>
                    <th className="px-3 py-2 text-center">Hit Status</th>
                    <th className="px-3 py-2 text-center">Hit Time</th>
                    
                    <th className="border-l border-r border-slate-200 bg-slate-50/50 px-3 py-2"></th>
                    
                    <th className="px-3 py-2 text-center">Hit Time</th>
                    <th className="px-3 py-2 text-center">Hit Status</th>
                    <th className="px-3 py-2 text-slate-800">LTP</th>
                    <th className="px-3 py-2">Low</th>
                    <th className="px-3 py-2">High</th>
                    <th className="px-3 py-2">Open</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {matchedRows.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="px-6 py-16 text-center text-sm font-medium text-slate-500">
                        No Open = High matches recorded for this date.
                      </td>
                    </tr>
                  ) : (
                    matchedRows.map((r) => {
                      const isAtm = r.strike === atmStrike;
                      
                      // Highlight matching cells
                      const getCellClass = (status) => {
                        if (status === "OPEN_HIGH") return "bg-emerald-50/50 text-emerald-700 font-bold";
                        if (status === "RETEST") return "bg-blue-50/50 text-blue-700 font-bold";
                        return "text-slate-600 font-medium";
                      };

                      const ceClass = getCellClass(r.CE_status);
                      const peClass = getCellClass(r.PE_status);

                      return (
                        <tr key={r.strike} className="transition-colors hover:bg-slate-50">
                          {/* Call Side */}
                          <td className={`px-3 py-2.5 ${ceClass}`}>{fmt(r.CE_open)}</td>
                          <td className={`px-3 py-2.5 ${ceClass}`}>{fmt(r.CE_high)}</td>
                          <td className={`px-3 py-2.5 ${ceClass}`}>{fmt(r.CE_low)}</td>
                          <td className={`px-3 py-2.5 font-bold text-slate-900 ${ceClass.includes("bg") ? ceClass : ""}`}>{fmt(r.CE_ltp)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <StatusBadge status={r.CE_status} broke={r.CE_broke} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <TimeChip iso={r.CE_hitAt} />
                          </td>

                          {/* Strike */}
                          <StrikeCell strike={r.strike} spot={data.spot} isAtm={isAtm} />

                          {/* Put Side */}
                          <td className="px-3 py-2.5 text-center">
                            <TimeChip iso={r.PE_hitAt} />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <StatusBadge status={r.PE_status} broke={r.PE_broke} />
                          </td>
                          <td className={`px-3 py-2.5 font-bold text-slate-900 ${peClass.includes("bg") ? peClass : ""}`}>{fmt(r.PE_ltp)}</td>
                          <td className={`px-3 py-2.5 ${peClass}`}>{fmt(r.PE_low)}</td>
                          <td className={`px-3 py-2.5 ${peClass}`}>{fmt(r.PE_high)}</td>
                          <td className={`px-3 py-2.5 ${peClass}`}>{fmt(r.PE_open)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}