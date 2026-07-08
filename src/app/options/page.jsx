"use client";

import { useEffect, useState, useCallback, useRef } from "react";

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

function ChgCell({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400">—</span>;
  }
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
  if (value === null || value === undefined) {
    return <span className="text-slate-400">—</span>;
  }
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
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (expiry) => {
    try {
      const url = expiry
        ? `/api/optionchain?expiry=${encodeURIComponent(expiry)}`
        : "/api/optionchain";

      const res = await fetch(url, { cache: "no-store" });

      if (res.status === 401) {
        setStatus("disconnected");
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(json.message || "Failed to load option chain.");
        return;
      }

      setData(json);
      setSelectedExpiry(json.expiry);
      setStatus("connected");
      setErrorMsg(null);
      setLastFetched(new Date());
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) setErrorMsg(err);
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;

    intervalRef.current = setInterval(() => load(selectedExpiry), 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, selectedExpiry, load]);

  const atmStrike =
    data && data.rows.length
      ? data.rows.reduce((best, r) =>
          Math.abs(r.strike - data.spot) < Math.abs(best.strike - data.spot) ? r : best
        ).strike
      : null;

  const callTotalOI = data?.rows?.reduce((sum, r) => sum + (Number(r.CE_oi) || 0), 0) || 0;
  const putTotalOI = data?.rows?.reduce((sum, r) => sum + (Number(r.PE_oi) || 0), 0) || 0;
  const totalVol = data?.rows?.reduce(
    (sum, r) => sum + (Number(r.CE_vol) || 0) + (Number(r.PE_vol) || 0),
    0
  ) || 0;

  const callOiChange = data?.rows?.reduce((sum, r) => sum + (Number(r.CE_oiChange) || 0), 0) || 0;
  const putOiChange = data?.rows?.reduce((sum, r) => sum + (Number(r.PE_oiChange) || 0), 0) || 0;

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <div className="w-full">
        <header className="mb-6 rounded-3xl border border-slate-200 bg-white/80 px-5 py-5 shadow-sm backdrop-blur sm:px-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">
                NSE · NFO Derivatives
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                NIFTY Option Chain
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Clean live option chain view with ITM highlighting, ATM emphasis, and fast refresh controls.
              </p>
            </div>

            {status === "connected" && data && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Spot
                  </p>
                  <p className="mt-1 font-display text-3xl font-bold text-slate-900">
                    {fmt(data.spot)}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-700">
                    Live Status
                  </p>
                  <p className="mt-1 font-mono text-xs text-emerald-700">
                    {lastFetched ? `updated ${lastFetched.toLocaleTimeString("en-IN")}` : ""}
                  </p>
                </div>
              </div>
            )}
          </div>
        </header>

        {status === "connected" && data && (
          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard
              label="Expiry"
              value={selectedExpiry || "—"}
              subtext="Selected contract expiry"
              accent="amber"
            />
            <StatCard
              label="Spot"
              value={fmt(data.spot)}
              subtext="Current underlying price"
              accent="emerald"
            />
            <StatCard
              label="Total OI"
              value={fmtInt(callTotalOI + putTotalOI)}
              subtext="Calls + Puts open interest"
              accent="slate"
            />
            <StatCard
              label="Total Vol"
              value={fmtInt(totalVol)}
              subtext="Combined traded volume"
              accent="rose"
            />
            <StatCard
              label="Call OI Δ"
              value={fmtInt(callOiChange)}
              subtext="Sum of call OI change"
              accent="emerald"
            />
            <StatCard
              label="Put OI Δ"
              value={fmtInt(putOiChange)}
              subtext="Sum of put OI change"
              accent="rose"
            />
          </div>
        )}

        {errorMsg && (
          <div
            className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 font-mono text-sm text-rose-700 shadow-sm"
            role="alert"
          >
            {errorMsg}
          </div>
        )}

        {status === "loading" && (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
            <p className="font-mono text-sm text-slate-500">Loading…</p>
          </div>
        )}

        {status === "disconnected" && (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-sm">
            <div className="max-w-2xl">
              <p className="text-sm leading-6 text-slate-600">
                Connect your Zerodha account to pull live option chain data. You’ll be redirected
                to Zerodha’s login page, and your credentials never touch this app.
              </p>
            </div>
            <a
              href="/api/login"
              className="mt-5 inline-flex items-center rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            >
              Connect to Zerodha
            </a>
          </div>
        )}

        {status === "connected" && data && (
          <>
            <div className="mb-5 rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    Expiry
                  </span>
                  <select
                    className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 cursor-pointer"
                    value={selectedExpiry || ""}
                    onChange={(e) => {
                      setSelectedExpiry(e.target.value);
                      load(e.target.value);
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
                  onClick={() => load(selectedExpiry)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-sm text-slate-700 transition hover:border-amber-500 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-amber-200 cursor-pointer"
                  aria-label="Refresh option chain"
                >
                  Refresh
                </button>

                <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-600 select-none">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="h-4 w-4 accent-amber-500"
                    aria-label="Auto-refresh"
                  />
                  Auto-refresh (5s)
                </label>
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Option Chain Table</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Calls on the left, puts on the right, ATM strike highlighted in center.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    ITM cells highlighted softly
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1220px] table-fixed border-collapse text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr className="border-b border-slate-200 bg-slate-100 font-mono text-[11px] uppercase tracking-wider text-slate-500">
                      <th colSpan={5} className="px-3 py-3 text-left text-emerald-700">
                        Calls
                      </th>
                      <th className="spine bg-white px-3 py-3 text-center text-amber-700">
                        Strike
                      </th>
                      <th colSpan={5} className="px-3 py-3 text-right text-rose-700">
                        Puts
                      </th>
                    </tr>
                    <tr className="border-b border-slate-200 bg-white font-mono text-xs text-slate-500">
                      <th className="w-[10%] px-3 py-3 text-right font-medium">OI Δ</th>
                      <th className="w-[10%] px-3 py-3 text-right font-medium">OI</th>
                      <th className="w-[10%] px-3 py-3 text-right font-medium">Vol</th>
                      <th className="w-[12%] px-3 py-3 text-right font-medium">Chg</th>
                      <th className="w-[14%] px-3 py-3 text-right font-medium">LTP</th>
                      <th className="spine w-[10%] px-3 py-3 text-center font-medium">—</th>
                      <th className="w-[14%] px-3 py-3 text-left font-medium">LTP</th>
                      <th className="w-[12%] px-3 py-3 text-left font-medium">Chg</th>
                      <th className="w-[10%] px-3 py-3 text-left font-medium">Vol</th>
                      <th className="w-[10%] px-3 py-3 text-left font-medium">OI</th>
                      <th className="w-[10%] px-3 py-3 text-left font-medium">OI Δ</th>
                    </tr>
                  </thead>

                  <tbody className="font-mono">
                    {data.rows.map((r) => {
                      const isAtm = r.strike === atmStrike;
                      const isCallItm = r.strike < data.spot;
                      const isPutItm = r.strike > data.spot;

                      const callCellBg = isAtm ? "" : isCallItm ? "bg-emerald-50" : "";
                      const putCellBg = isAtm ? "" : isPutItm ? "bg-rose-50" : "";

                      return (
                        <tr
                          key={r.strike}
                          className={`border-b border-slate-100 transition-colors ${
                            isAtm ? "bg-amber-100/90" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className={`px-3 py-2 text-right ${callCellBg}`}>
                            <OiCell value={r.CE_oiChange} />
                          </td>
                          <td className={`px-3 py-2 text-right text-slate-800 ${callCellBg}`}>
                            {fmtInt(r.CE_oi)}
                          </td>
                          <td className={`px-3 py-2 text-right text-slate-600 ${callCellBg}`}>
                            {fmtInt(r.CE_vol)}
                          </td>
                          <td className={`px-3 py-2 text-right ${callCellBg}`}>
                            <ChgCell value={r.CE_chg} />
                          </td>
                          <td className={`px-3 py-2 text-right font-medium text-slate-900 ${callCellBg}`}>
                            {fmt(r.CE_ltp)}
                          </td>

                          <td
                            className={`spine px-3 py-2 text-center font-bold tracking-wide ${
                              isAtm ? "bg-amber-300 text-slate-950" : "text-amber-700"
                            }`}
                            aria-current={isAtm ? "true" : undefined}
                          >
                            {r.strike}
                          </td>

                          <td className={`px-3 py-2 text-left font-medium text-slate-900 ${putCellBg}`}>
                            {fmt(r.PE_ltp)}
                          </td>
                          <td className={`px-3 py-2 text-left ${putCellBg}`}>
                            <ChgCell value={r.PE_chg} />
                          </td>
                          <td className={`px-3 py-2 text-left text-slate-600 ${putCellBg}`}>
                            {fmtInt(r.PE_vol)}
                          </td>
                          <td className={`px-3 py-2 text-left text-slate-800 ${putCellBg}`}>
                            {fmtInt(r.PE_oi)}
                          </td>
                          <td className={`px-3 py-2 text-left ${putCellBg}`}>
                            <OiCell value={r.PE_oiChange} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="mt-4 max-w-3xl font-mono text-xs leading-5 text-slate-500">
              Yellow row = at-the-money strike (closest to spot). Light green = in-the-money calls. Light red = in-the-money puts.
            </p>
          </>
        )}
      </div>
    </main>
  );
}