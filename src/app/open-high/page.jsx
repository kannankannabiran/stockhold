"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

const INDEXES = [
  { key: "NIFTY", label: "NIFTY" },
  { key: "BANKNIFTY", label: "BANK NIFTY" },
  { key: "SENSEX", label: "SENSEX" },
];

const REFRESH_MS = 5000;

function fmt(v) {
  return v === null || v === undefined ? "—" : v;
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString() : "—";
}

function cellStyle(status, isItm, side) {
  if (status === "OPEN_HIGH") return side === "CE" ? styles.matchCellCE : styles.matchCellPE;
  if (status === "RETEST") return styles.retestCell;
  if (isItm) return side === "CE" ? styles.itmCellCE : styles.itmCellPE;
  return null;
}

function hitTextStyle(status) {
  if (status === "OPEN_HIGH") return styles.hitTextGreen;
  if (status === "RETEST") return styles.hitTextBlue;
  return styles.hitTextNone;
}

export default function OpenHighPage() {
  const [index, setIndex] = useState("NIFTY");
  const [expiry, setExpiry] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ index });
      if (expiry) params.set("expiry", expiry);
      const res = await fetch(`/api/open-high?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || json.error || "Failed to load");
        return;
      }
      setError(null);
      setData(json);
      if (!expiry) setExpiry(json.expiry);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [index, expiry]);

  useEffect(() => {
    setLoading(true);
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const atmStrike = useMemo(() => {
    if (!data?.spot || !data.rows.length) return null;
    return data.rows.reduce((closest, r) =>
      Math.abs(r.strike - data.spot) < Math.abs(closest - data.spot) ? r.strike : closest,
    data.rows[0].strike);
  }, [data]);

  const rowMatches = (r) => r.CE_status || r.PE_status;

  const visibleRows = useMemo(() => {
    if (!data) return [];
    if (showAll) return data.rows;
    return data.rows.filter(rowMatches);
  }, [data, showAll]);

  const openHighCount = data ? data.rows.filter((r) => r.CE_status === "OPEN_HIGH" || r.PE_status === "OPEN_HIGH").length : 0;
  const retestCount = data ? data.rows.filter((r) => r.CE_status === "RETEST" || r.PE_status === "RETEST").length : 0;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Open <span style={styles.titleAccent}>= High</span></h1>
          <p style={styles.subtitle}>ATM ±10 strikes · morning open=high, plus retests after breakout</p>
        </div>

        <div style={styles.controls}>
          <select value={index} onChange={(e) => { setIndex(e.target.value); setExpiry(null); }} style={styles.select}>
            {INDEXES.map((i) => (<option key={i.key} value={i.key}>{i.label}</option>))}
          </select>

          {data?.expiries?.length > 0 && (
            <select value={expiry || ""} onChange={(e) => setExpiry(e.target.value)} style={styles.select}>
              {data.expiries.map((e) => (<option key={e} value={e}>{e}</option>))}
            </select>
          )}

          <button
            onClick={() => setShowAll((s) => !s)}
            style={{ ...styles.toggle, ...(showAll ? styles.toggleActive : {}) }}
          >
            {showAll ? "Showing All" : "Matches Only"}
          </button>
        </div>
      </div>

      <div style={styles.statsBar}>
        {data?.spot != null && (
          <div style={styles.statChip}>
            <span style={styles.statLabel}>SPOT</span>
            <span style={styles.statValue}>{data.spot}</span>
          </div>
        )}
        <div style={styles.statChip}>
          <span style={styles.statLabel}>OPEN=HIGH</span>
          <span style={{ ...styles.statValue, color: "#16a34a" }}>{openHighCount}</span>
        </div>
        <div style={styles.statChip}>
          <span style={styles.statLabel}>RETESTS</span>
          <span style={{ ...styles.statValue, color: "#2563eb" }}>{retestCount}</span>
        </div>
        <div style={styles.statChip}>
          <span style={styles.statLabel}>EXPIRY</span>
          <span style={styles.statValue}>{data?.expiry || "—"}</span>
        </div>
        <div style={styles.legend}>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#eab308" }} /> ATM</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#16a34a" }} /> Open=High</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#2563eb" }} /> Retest</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "rgba(22,163,74,0.35)" }} /> CALL ITM</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "rgba(220,38,38,0.35)" }} /> PUT ITM</span>
        </div>
        {data?.updatedAt && (
          <div style={styles.liveDot}>
            <span style={styles.pulseDot} />
            {new Date(data.updatedAt).toLocaleTimeString()}
          </div>
        )}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}
      {loading && !data && <div style={styles.loading}>Loading…</div>}

      {data && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th colSpan={6} style={styles.groupHeadCE}>CALL</th>
                <th style={styles.strikeHeadCol}>STRIKE</th>
                <th colSpan={6} style={styles.groupHeadPE}>PUT</th>
              </tr>
              <tr>
                <th style={styles.subHead}>Open</th>
                <th style={styles.subHead}>High</th>
                <th style={styles.subHead}>Low</th>
                <th style={styles.subHead}>LTP</th>
                <th style={styles.subHeadCenter}>Hit</th>
                <th style={styles.subHeadCenter}>Time</th>
                <th style={styles.subHeadStrike}></th>
                <th style={styles.subHeadCenter}>Time</th>
                <th style={styles.subHeadCenter}>Hit</th>
                <th style={styles.subHead}>LTP</th>
                <th style={styles.subHead}>Low</th>
                <th style={styles.subHead}>High</th>
                <th style={styles.subHead}>Open</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const isAtm = r.strike === atmStrike;
                const ceStyle = cellStyle(r.CE_status, r.CE_itm, "CE");
                const peStyle = cellStyle(r.PE_status, r.PE_itm, "PE");
                return (
                  <tr key={r.strike}>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_open)}</td>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_high)}</td>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_low)}</td>
                    <td style={{ ...styles.cell, ...styles.ltpCell, ...ceStyle }}>{fmt(r.CE_ltp)}</td>
                    <td style={{ ...styles.cellCenter, ...hitTextStyle(r.CE_status) }}>
                      {r.CE_status ? "Hit" : "—"}
                    </td>
                    <td style={styles.cellCenterMuted}>{fmtTime(r.CE_hitAt)}</td>

                    <td style={{ ...styles.strikeCell, ...(isAtm ? styles.atmStrikeCell : null) }}>
                      {r.strike}
                      {isAtm && <span style={styles.atmBadge}>ATM</span>}
                    </td>

                    <td style={styles.cellCenterMuted}>{fmtTime(r.PE_hitAt)}</td>
                    <td style={{ ...styles.cellCenter, ...hitTextStyle(r.PE_status) }}>
                      {r.PE_status ? "Hit" : "—"}
                    </td>
                    <td style={{ ...styles.cell, ...styles.ltpCell, ...peStyle }}>{fmt(r.PE_ltp)}</td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_low)}</td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_high)}</td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_open)}</td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr><td colSpan={13} style={styles.emptyRow}>No strikes currently match Open=High or Retest.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f7f8fa", color: "#1a1d23", fontFamily: "'Inter', system-ui, sans-serif", padding: "28px 32px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.5, color: "#111318" },
  titleAccent: { color: "#16a34a" },
  subtitle: { margin: "4px 0 0", color: "#6b7280", fontSize: 13 },
  controls: { display: "flex", gap: 10, alignItems: "center" },
  select: { background: "#ffffff", color: "#1a1d23", border: "1px solid #d8dce3", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" },
  toggle: { background: "#ffffff", color: "#6b7280", borderWidth: 1, borderStyle: "solid", borderColor: "#d8dce3", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  toggleActive: { background: "#eef2ff", color: "#1a1d23", borderColor: "#c7d2fe" },
  statsBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" },
  statChip: { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2, minWidth: 90, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" },
  statLabel: { fontSize: 10, letterSpacing: 1, color: "#9ca3af" },
  statValue: { fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#111318" },
  legend: { display: "flex", gap: 14, marginLeft: 8, flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280" },
  swatch: { width: 10, height: 10, borderRadius: 3, display: "inline-block" },
  liveDot: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" },
  pulseDot: { width: 8, height: 8, borderRadius: "50%", background: "#16a34a" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 },
  loading: { color: "#6b7280", fontSize: 14 },
  tableWrap: { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  groupHeadCE: { background: "linear-gradient(90deg, #dcfce7, #f9fafb)", color: "#15803d", padding: "10px 0", fontSize: 12, fontWeight: 700, letterSpacing: 1, textAlign: "center", borderBottom: "1px solid #e5e7eb" },
  groupHeadPE: { background: "linear-gradient(270deg, #fee2e2, #f9fafb)", color: "#b91c1c", padding: "10px 0", fontSize: 12, fontWeight: 700, letterSpacing: 1, textAlign: "center", borderBottom: "1px solid #e5e7eb" },
  strikeHeadCol: { background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" },
  subHead: { padding: "8px 10px", color: "#9ca3af", fontSize: 11, fontWeight: 600, textAlign: "right", borderBottom: "1px solid #e5e7eb" },
  subHeadCenter: { padding: "8px 10px", color: "#9ca3af", fontSize: 11, fontWeight: 600, textAlign: "center", borderBottom: "1px solid #e5e7eb" },
  subHeadStrike: { borderBottom: "1px solid #e5e7eb", background: "#f3f4f6" },
  cell: { padding: "9px 10px", textAlign: "right", borderBottom: "1px solid #f1f2f4", color: "#374151" },
  cellCenter: { padding: "9px 10px", textAlign: "center", borderBottom: "1px solid #f1f2f4", fontWeight: 700, fontSize: 12 },
  cellCenterMuted: { padding: "9px 10px", textAlign: "center", borderBottom: "1px solid #f1f2f4", color: "#9ca3af", fontSize: 11 },
  ltpCell: { fontWeight: 600 },
  itmCellCE: { background: "rgba(22, 163, 74, 0.08)", color: "#166534" },
  itmCellPE: { background: "rgba(220, 38, 38, 0.08)", color: "#991b1b" },
  matchCellCE: { background: "rgba(22, 163, 74, 0.22)", color: "#15803d", fontWeight: 700 },
  matchCellPE: { background: "rgba(220, 38, 38, 0.22)", color: "#b91c1c", fontWeight: 700 },
  retestCell: { background: "rgba(37, 99, 235, 0.16)", color: "#2563eb", fontWeight: 700 },
  hitTextGreen: { color: "#16a34a" },
  hitTextBlue: { color: "#2563eb" },
  hitTextNone: { color: "#d1d5db" },
  strikeCell: { padding: "9px 10px", textAlign: "center", fontWeight: 700, background: "#f9fafb", borderBottom: "1px solid #f1f2f4", borderLeft: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", whiteSpace: "nowrap", color: "#1a1d23" },
  atmStrikeCell: { background: "rgba(234, 179, 8, 0.18)", color: "#92620a" },
  atmBadge: { marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#ffffff", background: "#eab308", borderRadius: 4, padding: "1px 5px", verticalAlign: "middle" },
  emptyRow: { textAlign: "center", padding: "28px 0", color: "#9ca3af", fontSize: 13 },
};