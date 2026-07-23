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

function cellStyle(isMatch, isItm, side) {
  if (isMatch) {
    return side === "CE" ? styles.matchCellCE : styles.matchCellPE;
  }
  if (isItm) {
    return side === "CE" ? styles.itmCellCE : styles.itmCellPE;
  }
  return null;
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

  const visibleRows = useMemo(() => {
    if (!data) return [];
    if (showAll) return data.rows;
    return data.rows.filter((r) => r.CE_openHighMatch || r.PE_openHighMatch);
  }, [data, showAll]);

  const matchCount = data ? data.rows.filter((r) => r.CE_openHighMatch || r.PE_openHighMatch).length : 0;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Open <span style={styles.titleAccent}>= High</span></h1>
          <p style={styles.subtitle}>ATM ±10 strikes · haven't traded above their opening print</p>
        </div>

        <div style={styles.controls}>
          <select
            value={index}
            onChange={(e) => { setIndex(e.target.value); setExpiry(null); }}
            style={styles.select}
          >
            {INDEXES.map((i) => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </select>

          {data?.expiries?.length > 0 && (
            <select value={expiry || ""} onChange={(e) => setExpiry(e.target.value)} style={styles.select}>
              {data.expiries.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
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
          <span style={styles.statLabel}>MATCHES</span>
          <span style={{ ...styles.statValue, color: "#4ade80" }}>{matchCount}</span>
        </div>
        <div style={styles.statChip}>
          <span style={styles.statLabel}>EXPIRY</span>
          <span style={styles.statValue}>{data?.expiry || "—"}</span>
        </div>
        <div style={styles.legend}>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#facc15" }} /> ATM</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "rgba(74,222,128,0.35)" }} /> CALL ITM</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "rgba(248,113,113,0.35)" }} /> PUT ITM</span>
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
                <th colSpan={4} style={styles.groupHeadCE}>CALL</th>
                <th style={styles.strikeHeadCol}>STRIKE</th>
                <th colSpan={4} style={styles.groupHeadPE}>PUT</th>
              </tr>
              <tr>
                <th style={styles.subHead}>Open</th>
                <th style={styles.subHead}>High</th>
                <th style={styles.subHead}>Low</th>
                <th style={styles.subHead}>LTP</th>
                <th style={styles.subHeadStrike}></th>
                <th style={styles.subHead}>Open</th>
                <th style={styles.subHead}>High</th>
                <th style={styles.subHead}>Low</th>
                <th style={styles.subHead}>LTP</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const isAtm = r.strike === atmStrike;
                const ceStyle = cellStyle(r.CE_openHighMatch, r.CE_itm, "CE");
                const peStyle = cellStyle(r.PE_openHighMatch, r.PE_itm, "PE");
                return (
                  <tr key={r.strike}>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_open)}</td>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_high)}</td>
                    <td style={{ ...styles.cell, ...(r.CE_itm ? styles.itmCellCE : null) }}>{fmt(r.CE_low)}</td>
                    <td style={{ ...styles.cell, ...styles.ltpCell, ...(r.CE_itm ? styles.itmCellCE : null) }}>{fmt(r.CE_ltp)}</td>
                    <td style={{ ...styles.strikeCell, ...(isAtm ? styles.atmStrikeCell : null) }}>
                      {r.strike}
                      {isAtm && <span style={styles.atmBadge}>ATM</span>}
                    </td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_open)}</td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_high)}</td>
                    <td style={{ ...styles.cell, ...(r.PE_itm ? styles.itmCellPE : null) }}>{fmt(r.PE_low)}</td>
                    <td style={{ ...styles.cell, ...styles.ltpCell, ...(r.PE_itm ? styles.itmCellPE : null) }}>{fmt(r.PE_ltp)}</td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={9} style={styles.emptyRow}>No strikes currently match Open = High.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0b0e14",
    color: "#e6e9ef",
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "28px 32px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 20,
  },
  title: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.5 },
  titleAccent: { color: "#4ade80" },
  subtitle: { margin: "4px 0 0", color: "#8b93a7", fontSize: 13 },
  controls: { display: "flex", gap: 10, alignItems: "center" },
  select: {
    background: "#161b26",
    color: "#e6e9ef",
    border: "1px solid #262d3d",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none",
  },
  toggle: {
    background: "#161b26",
    color: "#8b93a7",
    border: "1px solid #262d3d",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  toggleActive: { background: "#1c2333", color: "#e6e9ef", borderColor: "#3b4356" },
  statsBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" },
  statChip: {
    background: "#12161f",
    border: "1px solid #1f2532",
    borderRadius: 10,
    padding: "8px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 90,
  },
  statLabel: { fontSize: 10, letterSpacing: 1, color: "#5b6377" },
  statValue: { fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" },
  legend: { display: "flex", gap: 14, marginLeft: 8 },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8b93a7" },
  swatch: { width: 10, height: 10, borderRadius: 3, display: "inline-block" },
  liveDot: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8b93a7" },
  pulseDot: { width: 8, height: 8, borderRadius: "50%", background: "#4ade80" },
  errorBox: {
    background: "#2a1418", border: "1px solid #5c2530", color: "#f87171",
    borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13,
  },
  loading: { color: "#8b93a7", fontSize: 14 },
  tableWrap: { background: "#0f131c", border: "1px solid #1f2532", borderRadius: 14, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  groupHeadCE: {
    background: "linear-gradient(90deg, #123324, #0f131c)", color: "#4ade80",
    padding: "10px 0", fontSize: 12, fontWeight: 700, letterSpacing: 1,
    textAlign: "center", borderBottom: "1px solid #1f2532",
  },
  groupHeadPE: {
    background: "linear-gradient(270deg, #331217, #0f131c)", color: "#f87171",
    padding: "10px 0", fontSize: 12, fontWeight: 700, letterSpacing: 1,
    textAlign: "center", borderBottom: "1px solid #1f2532",
  },
  strikeHeadCol: { background: "#161b26", borderBottom: "1px solid #1f2532" },
  subHead: {
    padding: "8px 10px", color: "#5b6377", fontSize: 11, fontWeight: 600,
    textAlign: "right", borderBottom: "1px solid #1f2532",
  },
  subHeadStrike: { borderBottom: "1px solid #1f2532", background: "#161b26" },
  cell: { padding: "9px 10px", textAlign: "right", borderBottom: "1px solid #171c27", color: "#c3c9d6" },
  ltpCell: { fontWeight: 600 },
  itmCellCE: { background: "rgba(74, 222, 128, 0.10)", color: "#bff2cf" },
  itmCellPE: { background: "rgba(248, 113, 113, 0.10)", color: "#f9c9c9" },
  matchCellCE: { background: "rgba(74, 222, 128, 0.28)", color: "#4ade80", fontWeight: 700 },
  matchCellPE: { background: "rgba(248, 113, 113, 0.28)", color: "#f87171", fontWeight: 700 },
  strikeCell: {
    padding: "9px 10px", textAlign: "center", fontWeight: 700, background: "#12161f",
    borderBottom: "1px solid #171c27", borderLeft: "1px solid #1f2532", borderRight: "1px solid #1f2532",
    whiteSpace: "nowrap",
  },
  atmStrikeCell: { background: "rgba(250, 204, 21, 0.18)", color: "#facc15" },
  atmBadge: {
    marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#0b0e14", background: "#facc15",
    borderRadius: 4, padding: "1px 5px", verticalAlign: "middle",
  },
  emptyRow: { textAlign: "center", padding: "28px 0", color: "#5b6377", fontSize: 13 },
};