// app/open-high/page.jsx
"use client";

import { useEffect, useState, useCallback } from "react";

const POLL_MS = 5000;
const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"];

export default function OpenHighPage() {
  const [selected, setSelected] = useState("NIFTY");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (index) => {
    try {
      const res = await fetch(`/api/open-high?index=${index}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to fetch");
      } else {
        setPayload(json.data[0]);
        setError(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData(selected);
    const timer = setInterval(() => fetchData(selected), POLL_MS);
    return () => clearInterval(timer);
  }, [selected, fetchData]);

  // every fetched row is rendered -- strikes already marked "Hit" stay
  // in the table and keep their badge, nothing is filtered out.
  const rows = payload?.rows ?? [];
  const hitCount = rows.filter((r) => r.openRetest === "Hit" || r.highRetest === "Hit").length;

  return (
    <div className="oh-root">
      <style>{css}</style>

      <header className="oh-header">
        <div className="oh-title-block">
          <span className="oh-eyebrow">Options Board</span>
          <h1 className="oh-title">Open / High Retest</h1>
        </div>

        <div className="oh-index-select">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Select index"
          >
            {INDICES.map((idx) => (
              <option key={idx} value={idx}>{idx}</option>
            ))}
          </select>
          <span className="oh-select-caret">▾</span>
        </div>
      </header>

      {payload && (
        <div className="oh-stat-strip">
          <div className="oh-stat">
            <span className="oh-stat-label">Spot</span>
            <span className="oh-stat-value">{payload.spot?.toFixed(2)}</span>
          </div>
          <div className="oh-divider" />
          <div className="oh-stat">
            <span className="oh-stat-label">ATM</span>
            <span className="oh-stat-value oh-accent">{payload.atm}</span>
          </div>
          <div className="oh-divider" />
          <div className="oh-stat">
            <span className="oh-stat-label">Expiry</span>
            <span className="oh-stat-value">{payload.expiry}</span>
          </div>
          <div className="oh-divider" />
          <div className="oh-stat">
            <span className="oh-stat-label">Retested</span>
            <span className="oh-stat-value oh-green">{hitCount} / {rows.length}</span>
          </div>
          <div className="oh-stat oh-stat-right">
            <span className={`oh-pulse-dot ${loading ? "oh-pulse-off" : ""}`} />
            <span className="oh-stat-label">{loading ? "updating…" : "live"}</span>
          </div>
        </div>
      )}

      {error && <div className="oh-error">{error}</div>}

      {!error && (
        <div className="oh-table-wrap">
          <table className="oh-table">
            <thead>
              <tr>
                <th>Strike</th>
                <th>Side</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>LTP</th>
                <th>Open Retest</th>
                <th>High Retest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.symbol}
                  className={r.strike === payload.atm ? "oh-atm-row" : ""}
                >
                  <td className="oh-strike">{r.strike}</td>
                  <td>
                    <span className={`oh-badge ${r.type === "CE" ? "oh-badge-ce" : "oh-badge-pe"}`}>
                      {r.type}
                    </span>
                  </td>
                  <td className="oh-num">{r.open}</td>
                  <td className="oh-num">{r.high}</td>
                  <td className="oh-num">{r.low}</td>
                  <td className="oh-num oh-ltp">{r.ltp}</td>
                  <td>
                    <span className={`oh-retest ${r.openRetest === "Hit" ? "oh-hit" : ""}`}>
                      {r.openRetest === "Hit" ? "● Hit" : "— Not Hit"}
                    </span>
                  </td>
                  <td>
                    <span className={`oh-retest ${r.highRetest === "Hit" ? "oh-hit" : ""}`}>
                      {r.highRetest === "Hit" ? "● Hit" : "— Not Hit"}
                    </span>
                  </td>
                </tr>
              ))}
              {!payload && !error && (
                <tr>
                  <td colSpan={8} className="oh-loading-row">Loading {selected}…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const css = `
.oh-root {
  --bg: #f5f6fa;
  --panel: #ffffff;
  --border: #e3e6ee;
  --text: #151b2b;
  --muted: #6b7280;
  --accent: #2f5de0;
  --accent-soft: rgba(47, 93, 224, 0.08);
  --green: #16a34a;
  --green-soft: rgba(22, 163, 74, 0.1);
  --ce: #0e9f6e;
  --ce-soft: rgba(14, 159, 110, 0.1);
  --pe: #e4572e;
  --pe-soft: rgba(228, 87, 46, 0.1);

  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  padding: 32px 40px 60px;
  font-family: ui-sans-serif, "Inter", system-ui, -apple-system, sans-serif;
}

.oh-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 16px;
}

.oh-eyebrow {
  display: block;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 6px;
}

.oh-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--text);
}

.oh-index-select {
  position: relative;
}

.oh-index-select select {
  appearance: none;
  background: var(--panel);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 10px 40px 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  min-width: 160px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.oh-index-select select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.oh-select-caret {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  pointer-events: none;
  font-size: 12px;
}

.oh-stat-strip {
  display: flex;
  gap: 20px;
  align-items: center;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 22px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.oh-divider {
  width: 1px;
  align-self: stretch;
  background: var(--border);
}

.oh-stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.oh-stat-right {
  margin-left: auto;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.oh-stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  font-weight: 600;
}

.oh-stat-value {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 17px;
  font-weight: 700;
}

.oh-accent { color: var(--accent); }
.oh-green { color: var(--green); }

.oh-pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.5);
  animation: oh-pulse 1.6s infinite;
}

.oh-pulse-off {
  background: var(--muted);
  animation: none;
}

@keyframes oh-pulse {
  0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.45); }
  70% { box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); }
  100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
}

.oh-error {
  background: rgba(228, 87, 46, 0.08);
  border: 1px solid rgba(228, 87, 46, 0.25);
  color: #b8391a;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
}

.oh-table-wrap {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--panel);
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.oh-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.oh-table thead th {
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  font-weight: 700;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: #fafbfd;
  position: sticky;
  top: 0;
}

.oh-table tbody td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.oh-table tbody tr:nth-child(even) {
  background: #fbfbfd;
}

.oh-table tbody tr:last-child td {
  border-bottom: none;
}

.oh-table tbody tr:hover {
  background: var(--accent-soft);
}

.oh-atm-row {
  background: var(--accent-soft) !important;
}

.oh-atm-row td {
  box-shadow: inset 3px 0 0 var(--accent);
}

.oh-strike {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-weight: 700;
}

.oh-num {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  color: #4b5261;
}

.oh-ltp {
  color: var(--text);
  font-weight: 700;
}

.oh-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 3px 9px;
  border-radius: 5px;
}

.oh-badge-ce {
  color: var(--ce);
  background: var(--ce-soft);
}

.oh-badge-pe {
  color: var(--pe);
  background: var(--pe-soft);
}

.oh-retest {
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.oh-hit {
  color: var(--green);
  font-weight: 700;
  background: var(--green-soft);
  padding: 3px 8px;
  border-radius: 5px;
}

.oh-loading-row {
  text-align: center;
  color: var(--muted);
  padding: 40px 0;
}

@media (max-width: 640px) {
  .oh-root { padding: 20px; }
  .oh-table { font-size: 12px; }
  .oh-table thead th, .oh-table tbody td { padding: 8px 10px; }
  .oh-stat-strip { gap: 14px; }
  .oh-divider { display: none; }
}
`;