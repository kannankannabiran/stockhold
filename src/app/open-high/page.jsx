"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

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
        setPayload(json.data?.[0] || null);
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

  const rows = payload?.rows ?? [];
  const hitCount = rows.filter((r) => r.openRetest === "Hit" || r.highRetest === "Hit").length;

  const byStrike = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.strike)) map.set(r.strike, {});
      map.get(r.strike)[r.type] = r;
    }
    return map;
  }, [rows]);

  const strikes = useMemo(() => [...new Set(rows.map((r) => r.strike))].sort((a, b) => a - b), [rows]);

  return (
    <div className="oh-root">
      <style>{css}</style>

      <div className="bg-blobs" />

      <header className="oh-topbar">
        <div>
          <span className="oh-eyebrow">Options Board</span>
          <h1 className="oh-title">Open = High</h1>
          <p className="oh-subtitle">Calls left, strike center, puts right.</p>
        </div>

        <div className="oh-actions">
          <div className="oh-index-select">
            <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Select index">
              {INDICES.map((idx) => (
                <option key={idx} value={idx}>
                  {idx}
                </option>
              ))}
            </select>
            <span className="oh-select-caret">▾</span>
          </div>
        </div>
      </header>

      {payload && (
        <section className="kpi-grid">
          <div className="kpi-card kpi-blue">
            <span className="kpi-label">Spot</span>
            <span className="kpi-value">{payload.spot?.toFixed(2)}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">ATM</span>
            <span className="kpi-value">{payload.atm}</span>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Expiry</span>
            <span className="kpi-value">{payload.expiry}</span>
          </div>
          <div className="kpi-card kpi-green">
            <span className="kpi-label">Retested</span>
            <span className="kpi-value">{hitCount} / {rows.length}</span>
          </div>
          <div className="kpi-live">
            <span className={`pulse-dot ${loading ? "pulse-off" : ""}`} />
            <span>{loading ? "updating…" : "live"}</span>
          </div>
        </section>
      )}

      {error && <div className="error-box">{error}</div>}

      {!error && payload && (
        <section className="table-shell">
          <div className="table-head">
            <div>Calls</div>
            <div>Strike</div>
            <div>Puts</div>
          </div>

          <div className="table-scroll">
            <div className="oc-table">
              {strikes.map((strike) => {
                const ce = byStrike.get(strike)?.CE;
                const pe = byStrike.get(strike)?.PE;
                const isAtm = strike === payload.atm;

                return (
                  <div key={strike} className={`oc-row ${isAtm ? "oc-atm" : ""}`}>
                    <div className="oc-side oc-left">
                      {ce ? (
                        <OptionCell option={ce} atm={payload.atm} side="CE" strike={strike} />
                      ) : (
                        <span className="empty">—</span>
                      )}
                    </div>

                    <div className={`oc-center ${isAtm ? "oc-center-atm" : ""}`}>
                      <div className="strike-pill">{strike}</div>
                      {isAtm && <div className="atm-chip">ATM</div>}
                    </div>

                    <div className="oc-side oc-right">
                      {pe ? (
                        <OptionCell option={pe} atm={payload.atm} side="PE" strike={strike} />
                      ) : (
                        <span className="empty">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {!payload && !error && <div className="loading-box">Loading {selected}…</div>}
    </div>
  );
}

function OptionCell({ option, atm, side, strike }) {
  const itm = side === "CE" ? strike < atm : strike > atm;

  return (
    <div className="opt-card">
      <div className="opt-top">
        <span className={`side-badge ${itm ? "itm" : "otm"}`}>{itm ? "ITM" : "OTM"}</span>
        <span className={`type-badge ${side === "CE" ? "ce" : "pe"}`}>{side}</span>
      </div>

      <div className="opt-metrics">
        <div>
          <span>Open</span>
          <strong>{option.open}</strong>
        </div>
        <div>
          <span>High</span>
          <strong>{option.high}</strong>
        </div>
        <div>
          <span>Low</span>
          <strong>{option.low}</strong>
        </div>
        <div>
          <span>LTP</span>
          <strong className="ltp">{option.ltp}</strong>
        </div>
      </div>

      <div className="opt-badges">
        <span className={`status-pill ${option.openRetest === "Hit" ? "hit" : ""}`}>
          Open {option.openRetest}
        </span>
        <span className={`status-pill ${option.highRetest === "Hit" ? "hit" : ""}`}>
          High {option.highRetest}
        </span>
      </div>
    </div>
  );
}

const css = `
.oh-root {
  --bg: #f5f8ff;
  --panel: rgba(255,255,255,0.88);
  --panel-strong: #ffffff;
  --line: #dbe3f0;
  --line-strong: #c9d4e5;
  --text: #102033;
  --muted: #6b7a90;
  --accent: #2f5de0;
  --accent-soft: rgba(47,93,224,0.08);
  --green: #16a34a;
  --green-soft: rgba(22,163,74,0.12);
  --ce: #0e9f6e;
  --pe: #e4572e;
  --ce-soft: rgba(14,159,110,0.12);
  --pe-soft: rgba(228,87,46,0.12);

  min-height: 100vh;
  position: relative;
  overflow: hidden;
  padding: 26px 30px 40px;
  background:
    radial-gradient(circle at top left, rgba(79,124,255,0.10), transparent 28%),
    radial-gradient(circle at top right, rgba(22,163,74,0.08), transparent 24%),
    linear-gradient(180deg, #f7f9ff 0%, #eef4ff 100%);
  color: var(--text);
  font-family: ui-sans-serif, "Inter", system-ui, -apple-system, sans-serif;
}

.bg-blobs {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 20% 10%, rgba(79,124,255,0.12), transparent 18%),
    radial-gradient(circle at 80% 12%, rgba(168,85,247,0.08), transparent 18%);
  filter: blur(18px);
  opacity: 0.9;
}

.oh-topbar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 18px 20px;
  margin-bottom: 18px;
  border: 1px solid rgba(255,255,255,0.75);
  border-radius: 18px;
  background: rgba(255,255,255,0.78);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: 0 14px 34px rgba(16, 24, 40, 0.08);
}

.oh-eyebrow {
  display: inline-block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

.oh-title {
  margin: 0;
  font-size: 30px;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.oh-subtitle {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 14px;
}

.oh-index-select {
  position: relative;
}

.oh-index-select select {
  appearance: none;
  min-width: 170px;
  padding: 11px 42px 11px 16px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 10px 22px rgba(16,24,40,0.05);
  cursor: pointer;
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

.kpi-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 14px;
  margin-bottom: 18px;
}

.kpi-card, .kpi-live {
  border: 1px solid rgba(255,255,255,0.9);
  border-radius: 18px;
  background: rgba(255,255,255,0.9);
  box-shadow: 0 10px 28px rgba(16,24,40,0.06);
}

.kpi-card {
  padding: 16px 18px;
}

.kpi-blue {
  background: linear-gradient(135deg, rgba(79,124,255,0.10), rgba(255,255,255,0.92));
}

.kpi-green {
  background: linear-gradient(135deg, rgba(22,163,74,0.10), rgba(255,255,255,0.92));
}

.kpi-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}

.kpi-value {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 18px;
  font-weight: 900;
  color: var(--text);
}

.kpi-live {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--green);
  box-shadow: 0 0 0 0 rgba(22,163,74,0.45);
  animation: pulse 1.6s infinite;
}

.pulse-off {
  animation: none;
  background: var(--muted);
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(22,163,74,0.45); }
  70% { box-shadow: 0 0 0 8px rgba(22,163,74,0); }
  100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
}

.table-shell {
  position: relative;
  z-index: 1;
  border: 1px solid var(--line);
  border-radius: 20px;
  overflow: hidden;
  background: rgba(255,255,255,0.92);
  box-shadow: 0 16px 38px rgba(16,24,40,0.08);
}

.table-head {
  display: grid;
  grid-template-columns: 1fr 120px 1fr;
  gap: 12px;
  padding: 14px 18px;
  background: linear-gradient(180deg, #ffffff, #f7faff);
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #6a7688;
}

.table-head div:nth-child(2) { text-align: center; }
.table-head div:nth-child(3) { text-align: right; }

.table-scroll {
  overflow: auto;
  max-height: 74vh;
}

.oc-table {
  min-width: 1100px;
}

.oc-row {
  display: grid;
  grid-template-columns: 1fr 120px 1fr;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid #edf2f7;
  transition: background 0.18s ease;
}

.oc-row:hover {
  background: rgba(47,93,224,0.04);
}

.oc-atm {
  background: linear-gradient(90deg, rgba(47,93,224,0.10), rgba(47,93,224,0.04));
}

.oc-side {
  display: flex;
  align-items: center;
  min-height: 70px;
}

.oc-left { justify-content: flex-start; }
.oc-right { justify-content: flex-end; }

.oc-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.strike-pill {
  min-width: 92px;
  text-align: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: #0f172a;
  color: #fff;
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.oc-center-atm .strike-pill {
  background: linear-gradient(135deg, #2f5de0, #1f4bd6);
}

.atm-chip {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

.opt-card {
  width: 100%;
  padding: 12px 14px;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff, #fbfcff);
  border: 1px solid var(--line);
  box-shadow: 0 8px 20px rgba(16,24,40,0.04);
}

.opt-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.side-badge,
.type-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.04em;
}

.side-badge.itm {
  color: var(--ce);
  background: var(--ce-soft);
}

.side-badge.otm {
  color: var(--pe);
  background: var(--pe-soft);
}

.type-badge.ce {
  color: var(--ce);
  background: rgba(14,159,110,0.08);
}

.type-badge.pe {
  color: var(--pe);
  background: rgba(228,87,46,0.08);
}

.opt-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.opt-metrics div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.opt-metrics span {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}

.opt-metrics strong {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 13px;
  font-weight: 800;
  color: var(--text);
}

.opt-metrics strong.ltp {
  color: var(--accent);
}

.opt-badges {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  color: #607089;
  background: #eef3fb;
}

.status-pill.hit {
  color: var(--green);
  background: var(--green-soft);
}

.empty {
  color: rgba(107,122,144,0.5);
  font-size: 18px;
  font-weight: 800;
}

.error-box,
.loading-box {
  position: relative;
  z-index: 1;
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.9);
  color: var(--muted);
  box-shadow: 0 10px 22px rgba(16,24,40,0.05);
}

.error-box {
  border-color: rgba(228,87,46,0.18);
  color: #b8391a;
  background: rgba(255,245,242,0.95);
}

@media (max-width: 900px) {
  .oh-root {
    padding: 18px;
  }

  .kpi-grid {
    grid-template-columns: 1fr 1fr;
  }

  .kpi-live {
    grid-column: 1 / -1;
    justify-content: flex-start;
    padding: 14px 16px;
  }

  .oc-table {
    min-width: 950px;
  }
}
`;