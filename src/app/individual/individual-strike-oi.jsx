"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { FaSitemap } from "react-icons/fa";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Matches INDEX_CONFIG keys in /api/option-chain/route.js
const indexOptions = ["NIFTY", "BANKNIFTY", "SENSEX"];

const POLL_MS = 10000;

// ΔOI Diff % thresholds — rising Put OI (support) = bullish, rising Call OI (resistance) = bearish.
// Adjust these (or swap the whole function) to match your other pages' thresholds if they differ.
const BULLISH_THRESHOLD = 20;
const BEARISH_THRESHOLD = -20;

function diffPct(ceChange, peChange) {
  if (ceChange == null && peChange == null) return null; // no ΔOI data at all (e.g. historical fetch failed)
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

function sentimentClasses(sentiment) {
  switch (sentiment) {
    case "Bullish":
      return "bg-green-100 text-green-700";
    case "Bearish":
      return "bg-red-100 text-red-700";
    case "N/A":
      return "bg-yellow-50 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

const MAX_TREND_POINTS = 30;

// localStorage-backed OI trend history — resets daily since OI resets each trading session.
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function trendStorageKey(sym, strike) {
  return `oiTrend:${sym}:${strike}`;
}

function loadTrendHistory(sym, strike) {
  if (typeof window === "undefined" || !strike) return [];
  try {
    const raw = window.localStorage.getItem(trendStorageKey(sym, strike));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed.dateKey !== todayKey()) return []; // stale data from a previous trading day
    return Array.isArray(parsed.points) ? parsed.points : [];
  } catch (e) {
    console.error("[oiTrend] failed to read localStorage", e);
    return [];
  }
}

function saveTrendHistory(sym, strike, points) {
  if (typeof window === "undefined" || !strike) return;
  try {
    window.localStorage.setItem(
      trendStorageKey(sym, strike),
      JSON.stringify({ dateKey: todayKey(), points })
    );
  } catch (e) {
    console.error("[oiTrend] failed to write localStorage", e);
  }
}

export default function OptionChain() {
  const [symbol, setSymbol] = useState("NIFTY");
  const [rows, setRows] = useState([]);
  const [spot, setSpot] = useState(null);
  const [expiry, setExpiry] = useState(null);
  const [expiries, setExpiries] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [selectedStrike, setSelectedStrike] = useState(null);
  const [error, setError] = useState(null);

  // Real OI history for the selected strike, built up from each poll and persisted to
  // localStorage (per symbol+strike, reset daily) so it survives page reloads.
  const [trendHistory, setTrendHistory] = useState([]); // [{ time, ceOi, peOi, ceOiChange, peOiChange }]
  const timeoutRef = useRef(null);
  const inFlightRef = useRef(false);

  const fetchData = useCallback(async (sym, expiryOverride) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const qs = new URLSearchParams({ index: sym });
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
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;
      await fetchData(symbol);
      if (cancelled) return;
      timeoutRef.current = setTimeout(loop, POLL_MS);
    };

    setSelectedStrike(null);
    loop();

    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [symbol, fetchData]);

  const selectedRow = rows.find((r) => r.strike === Number(selectedStrike));

  // When the user picks a different strike (or symbol changes), load whatever history
  // is already saved for that strike from localStorage instead of starting empty.
  useEffect(() => {
    setTrendHistory(loadTrendHistory(symbol, selectedStrike));
  }, [symbol, selectedStrike]);

  // Append a real snapshot point every time fresh data arrives for the selected strike,
  // and persist it to localStorage so it survives reloads.
  useEffect(() => {
    if (!selectedRow || (selectedRow.CE_oi == null && selectedRow.PE_oi == null)) return;
    setTrendHistory((prev) => {
      const next = [
        ...prev,
        {
          time: updatedAt ? new Date(updatedAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
          ceOi: selectedRow.CE_oi ?? null,
          peOi: selectedRow.PE_oi ?? null,
          ceOiChange: selectedRow.CE_oiChange ?? null,
          peOiChange: selectedRow.PE_oiChange ?? null,
        },
      ].slice(-MAX_TREND_POINTS);
      saveTrendHistory(symbol, selectedStrike, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow?.CE_oi, selectedRow?.PE_oi, selectedRow?.CE_oiChange, selectedRow?.PE_oiChange, updatedAt]);

  const barChartData = {
    labels: ["Call OI", "Put OI"],
    datasets: [
      {
        label: "Open Interest",
        data: selectedRow ? [selectedRow.CE_oi || 0, selectedRow.PE_oi || 0] : [0, 0],
        backgroundColor: ["#008000", "#f43f5e"],
      },
    ],
  };

  // ΔOI bar — separate chart since OI and ΔOI are on very different scales.
  const oiChangeBarData = {
    labels: ["Δ Call OI", "Δ Put OI"],
    datasets: [
      {
        label: "Change in OI",
        data: selectedRow ? [selectedRow.CE_oiChange ?? 0, selectedRow.PE_oiChange ?? 0] : [0, 0],
        backgroundColor: [
          (selectedRow?.CE_oiChange ?? 0) >= 0 ? "#166534" : "#86efac",
          (selectedRow?.PE_oiChange ?? 0) >= 0 ? "#991b1b" : "#fca5a5",
        ],
      },
    ],
  };

  // Built from real accumulated snapshots (see trendHistory effects above) — grows as you watch it.
  const lineChartData = {
    labels: trendHistory.length ? trendHistory.map((p) => p.time) : ["Now"],
    datasets: [
      {
        label: "Call OI",
        data: trendHistory.length ? trendHistory.map((p) => p.ceOi) : [selectedRow?.CE_oi ?? null],
        borderColor: "#008000",
        pointRadius: trendHistory.length > 1 ? 2 : 5,
        tension: 0.3,
        fill: false,
      },
      {
        label: "Put OI",
        data: trendHistory.length ? trendHistory.map((p) => p.peOi) : [selectedRow?.PE_oi ?? null],
        borderColor: "#f43f5e",
        pointRadius: trendHistory.length > 1 ? 2 : 5,
        tension: 0.3,
        fill: false,
      },
    ],
  };

  // ΔOI trend — same idea, separate chart since ΔOI can be negative and is on a different scale than raw OI.
  const oiChangeLineChartData = {
    labels: trendHistory.length ? trendHistory.map((p) => p.time) : ["Now"],
    datasets: [
      {
        label: "Δ Call OI",
        data: trendHistory.length
          ? trendHistory.map((p) => p.ceOiChange)
          : [selectedRow?.CE_oiChange ?? null],
        borderColor: "#166534",
        pointRadius: trendHistory.length > 1 ? 2 : 5,
        tension: 0.3,
        fill: false,
      },
      {
        label: "Δ Put OI",
        data: trendHistory.length
          ? trendHistory.map((p) => p.peOiChange)
          : [selectedRow?.PE_oiChange ?? null],
        borderColor: "#991b1b",
        pointRadius: trendHistory.length > 1 ? 2 : 5,
        tension: 0.3,
        fill: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: false },
    },
  };

  return (
    <div className="p-6 max-w-screen-xl mx-auto bg-white rounded-lg">
      <div className="text-center mb-2">
        <h2 className="text-3xl font-semibold text-gray-800 flex justify-center items-center gap-3">
          <FaSitemap className="text-blue-600" /> {symbol} Option Chain
        </h2>
        {spot != null && (
          <div className="text-sm text-gray-500 mt-1">
            Spot: {spot.toLocaleString()} &middot; Expiry: {expiry}
            {updatedAt && (
              <> &middot; Updated {new Date(updatedAt).toLocaleTimeString()}</>
            )}
          </div>
        )}
      </div>

      {/* Dropdowns */}
      <div className="flex flex-wrap justify-center gap-4 mb-6 mt-4">
        <select
          className="border border-gray-300 px-5 py-2 rounded shadow-sm bg-gray-50"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        >
          {indexOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {expiries.length > 0 && (
          <select
            className="border border-gray-300 px-5 py-2 rounded shadow-sm bg-gray-50"
            value={expiry || ""}
            onChange={(e) => fetchData(symbol, e.target.value)}
          >
            {expiries.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        )}

        <select
          className="border border-gray-300 px-5 py-2 rounded shadow-sm bg-gray-50"
          value={selectedStrike || ""}
          onChange={(e) => setSelectedStrike(Number(e.target.value))}
        >
          {rows.map((r) => (
            <option key={r.strike} value={r.strike}>
              {r.strike}
            </option>
          ))}
        </select>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-3 col-span-12">
          <h3 className="text-lg font-semibold mb-2 text-center">Current OI</h3>
          <div className="h-[460px]">
            <Bar data={barChartData} options={{ ...chartOptions, maintainAspectRatio: false }} />
          </div>
        </div>

        <div className="md:col-span-9 col-span-12">
          <h3 className="text-lg font-semibold mb-2 text-center">
            OI Trend {trendHistory.length > 1 ? `(${trendHistory.length} live snapshots)` : "(collecting live data...)"}
          </h3>
          <Line key={`${symbol}-${selectedStrike}-oi`} data={lineChartData} options={chartOptions} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start mt-10">
        <div className="md:col-span-3 col-span-12">
          <h3 className="text-lg font-semibold mb-2 text-center">Current ΔOI (Change)</h3>
          <div className="h-[460px]">
            <Bar data={oiChangeBarData} options={{ ...chartOptions, maintainAspectRatio: false }} />
          </div>
        </div>

        <div className="md:col-span-9 col-span-12">
          <h3 className="text-lg font-semibold mb-2 text-center">
            ΔOI Trend {trendHistory.length > 1 ? `(${trendHistory.length} live snapshots)` : "(collecting live data...)"}
          </h3>
          <Line key={`${symbol}-${selectedStrike}-diff`} data={oiChangeLineChartData} options={chartOptions} />
        </div>
      </div>

      {/* Selected Strike Info */}
      {selectedRow && (
        <div className="mt-8 bg-gray-50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-gray-800 text-center">
          <div><strong>Strike:</strong> {selectedRow.strike}</div>
          <div><strong>Call OI:</strong> {selectedRow.CE_oi?.toLocaleString()}</div>
          <div><strong>Put OI:</strong> {selectedRow.PE_oi?.toLocaleString()}</div>
          <div><strong>Δ Call OI:</strong> {selectedRow.CE_oiChange?.toLocaleString()}</div>
          <div><strong>Δ Put OI:</strong> {selectedRow.PE_oiChange?.toLocaleString()}</div>
          <div>
            <strong>ΔOI Diff %:</strong>{" "}
            {(() => {
              const p = diffPct(selectedRow.CE_oiChange, selectedRow.PE_oiChange);
              return p == null ? "N/A" : `${p.toFixed(1)}%`;
            })()}
          </div>
          <div><strong>LTP CE:</strong> ₹{selectedRow.CE_ltp}</div>
          <div><strong>LTP PE:</strong> ₹{selectedRow.PE_ltp}</div>
          <div><strong>Vol CE:</strong> {selectedRow.CE_vol}</div>
          <div><strong>Vol PE:</strong> {selectedRow.PE_vol}</div>
        </div>
      )}

      {/* Market Direction Table */}
      {rows.length > 0 && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-3 text-center">Market Direction (ΔOI Diff %)</h3>
          <div className="overflow-auto">
            <table className="min-w-full text-sm text-center border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-4 py-2">Strike</th>
                  <th className="border px-4 py-2">Call OI</th>
                  <th className="border px-4 py-2">Put OI</th>
                  <th className="border px-4 py-2">Δ Call OI</th>
                  <th className="border px-4 py-2">Δ Put OI</th>
                  <th className="border px-4 py-2">ΔOI Diff %</th>
                  <th className="border px-4 py-2">Sentiment</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const pct = diffPct(row.CE_oiChange, row.PE_oiChange);
                  const sentiment = sentimentFromDiff(pct);
                  return (
                    <tr
                      key={row.strike}
                      className={`hover:bg-gray-50 ${
                        row.strike === selectedStrike ? "bg-yellow-50" : ""
                      }`}
                      onClick={() => setSelectedStrike(row.strike)}
                    >
                      <td className="border px-4 py-1 cursor-pointer">{row.strike}</td>
                      <td className="border px-4 py-1">{row.CE_oi?.toLocaleString()}</td>
                      <td className="border px-4 py-1">{row.PE_oi?.toLocaleString()}</td>
                      <td className="border px-4 py-1">
                        {row.CE_oiChange == null ? (
                          <span className="text-gray-400 italic">N/A</span>
                        ) : (
                          row.CE_oiChange.toLocaleString()
                        )}
                      </td>
                      <td className="border px-4 py-1">
                        {row.PE_oiChange == null ? (
                          <span className="text-gray-400 italic">N/A</span>
                        ) : (
                          row.PE_oiChange.toLocaleString()
                        )}
                      </td>
                      <td className="border px-4 py-1 font-medium">
                        {pct == null ? "N/A" : `${pct.toFixed(1)}%`}
                      </td>
                      <td className={`border px-4 py-1 font-semibold ${sentimentClasses(sentiment)}`}>
                        {sentiment}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <div className="text-red-600 text-center mt-4">{error}</div>}
    </div>
  );
}