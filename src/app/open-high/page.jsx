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

function fmt(v) {
  return v === null || v === undefined ? "—" : v;
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString() : "—";
}

function cellStyle(status, isItm, side) {
  if (status === "OPEN_HIGH") return styles.matchCellBlue;
  if (status === "RETEST") return styles.matchCellGreen;
  if (isItm) return side === "CE" ? styles.itmCellCE : styles.itmCellPE;
  return null;
}

function badgeInfo(status, broke) {
  if (status === "OPEN_HIGH") return { label: "Hit", style: styles.badgeBlue };
  if (status === "RETEST") return { label: "Hit", style: styles.badgeGreen };
  if (broke) return { label: "Pending", style: styles.badgeAmber };
  return { label: "—", style: styles.badgeMuted };
}

function Badge({ status, broke }) {
  const { label, style } = badgeInfo(status, broke);
  const isDash = label === "—";
  return (
    <span style={{ ...styles.badge, ...style }}>
      {!isDash && <span style={{ ...styles.badgeDot, ...(style.dotColor ? { background: style.dotColor } : null) }} />}
      {label}
    </span>
  );
}

export default function OpenHighPage() {
  const [index, setIndex] = useState("NIFTY");
  const [expiry, setExpiry] = useState(null);
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const isToday = date === todayStr();

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ index, date });
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
  }, [index, expiry, date]);

  useEffect(() => {
    setLoading(true);
    load();
    if (!isToday) return; // no polling for historical dates
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, isToday]);

  const atmStrike = useMemo(() => {
    if (!data?.spot || !data.rows.length) return null;
    return data.rows.reduce((closest, r) =>
      Math.abs(r.strike - data.spot) < Math.abs(closest - data.spot) ? r.strike : closest,
    data.rows[0].strike);
  }, [data]);

  const openHighCount = data ? data.rows.filter((r) => r.CE_status === "OPEN_HIGH" || r.PE_status === "OPEN_HIGH").length : 0;
  const retestCount = data ? data.rows.filter((r) => r.CE_status === "RETEST" || r.PE_status === "RETEST").length : 0;
  const pendingCount = data ? data.rows.filter((r) => (r.CE_broke && !r.CE_status) || (r.PE_broke && !r.PE_status)).length : 0;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Open <span style={styles.titleAccent}>= High</span></h1>
          <p style={styles.subtitle}>
            ATM ±10 strikes · Hit = open=high or retested the open price · Pending = broke out, waiting to retest open
          </p>
        </div>

        <div style={styles.controls}>
          <select value={index} onChange={(e) => { setIndex(e.target.value); setExpiry(null); }} style={styles.select}>
            {INDEXES.map((i) => (<option key={i.key} value={i.key}>{i.label}</option>))}
          </select>

          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => { setDate(e.target.value); setExpiry(null); }}
            style={styles.select}
          />

          {data?.expiries?.length > 0 && (
            <select value={expiry || ""} onChange={(e) => setExpiry(e.target.value)} style={styles.select}>
              {data.expiries.map((e) => (<option key={e} value={e}>{e}</option>))}
            </select>
          )}
        </div>
      </div>

      {!isToday && (
        <div style={styles.historicalBanner}>
          Viewing history for {date} — read-only, no live polling.
        </div>
      )}

      <div style={styles.statsBar}>
        {data?.spot != null && (
          <div style={styles.statChip}>
            <span style={styles.statLabel}>SPOT</span>
            <span style={styles.statValue}>{data.spot}</span>
          </div>
        )}
        <div style={styles.statChip}>
          <span style={styles.statLabel}>OPEN=HIGH</span>
          <span style={{ ...styles.statValue, color: "#2563eb" }}>{openHighCount}</span>
        </div>
        <div style={styles.statChip}>
          <span style={styles.statLabel}>RETESTS</span>
          <span style={{ ...styles.statValue, color: "#16a34a" }}>{retestCount}</span>
        </div>
        {isToday && (
          <div style={styles.statChip}>
            <span style={styles.statLabel}>PENDING</span>
            <span style={{ ...styles.statValue, color: "#d97706" }}>{pendingCount}</span>
          </div>
        )}
        <div style={styles.statChip}>
          <span style={styles.statLabel}>EXPIRY</span>
          <span style={styles.statValue}>{data?.expiry || "—"}</span>
        </div>
        <div style={styles.legend}>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#eab308" }} /> ATM</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#2563eb" }} /> Open=High</span>
          <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#16a34a" }} /> Retest</span>
          {isToday && <span style={styles.legendItem}><i style={{ ...styles.swatch, background: "#d97706" }} /> Pending</span>}
        </div>
        {data?.updatedAt && isToday && (
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
              {data.rows.map((r) => {
                const isAtm = r.strike === atmStrike;
                const ceStyle = cellStyle(r.CE_status, r.CE_itm, "CE");
                const peStyle = cellStyle(r.PE_status, r.PE_itm, "PE");
                return (
                  <tr key={r.strike}>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_open)}</td>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_high)}</td>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_low)}</td>
                    <td style={{ ...styles.cell, ...styles.ltpCell, ...ceStyle }}>{fmt(r.CE_ltp)}</td>
                    <td style={styles.cellCenter}>
                      <Badge status={r.CE_status} broke={r.CE_broke} />
                    </td>
                    <td style={styles.cellCenterMuted}>{fmtTime(r.CE_hitAt)}</td>

                    <td style={{ ...styles.strikeCell, ...(isAtm ? styles.atmStrikeCell : null) }}>
                      {r.strike}
                      {isAtm && <span style={styles.atmBadge}>ATM</span>}
                    </td>

                    <td style={styles.cellCenterMuted}>{fmtTime(r.PE_hitAt)}</td>
                    <td style={styles.cellCenter}>
                      <Badge status={r.PE_status} broke={r.PE_broke} />
                    </td>
                    <td style={{ ...styles.cell, ...styles.ltpCell, ...peStyle }}>{fmt(r.PE_ltp)}</td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_low)}</td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_high)}</td>
                    <td style={{ ...styles.cell, ...peStyle }}>{fmt(r.PE_open)}</td>
                  </tr>
                );
              })}
              {data.rows.length === 0 && (
                <tr><td colSpan={13} style={styles.emptyRow}>No strikes recorded for this date.</td></tr>
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
  titleAccent: { color: "#2563eb" },
  subtitle: { margin: "4px 0 0", color: "#6b7280", fontSize: 13 },
  controls: { display: "flex", gap: 10, alignItems: "center" },
  select: { background: "#ffffff", color: "#1a1d23", border: "1px solid #d8dce3", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" },
  historicalBanner: { background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 13 },
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
  cellCenter: { padding: "9px 10px", textAlign: "center", borderBottom: "1px solid #f1f2f4" },
  cellCenterMuted: { padding: "9px 10px", textAlign: "center", borderBottom: "1px solid #f1f2f4", color: "#9ca3af", fontSize: 11 },
  ltpCell: { fontWeight: 600 },
  itmCellCE: { background: "rgba(22, 163, 74, 0.08)", color: "#166534" },
  itmCellPE: { background: "rgba(220, 38, 38, 0.08)", color: "#991b1b" },
  matchCellBlue: { background: "rgba(37, 99, 235, 0.18)", color: "#1d4ed8", fontWeight: 700 },
  matchCellGreen: { background: "rgba(22, 163, 74, 0.22)", color: "#15803d", fontWeight: 700 },
  badge: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.4 },
  badgeDot: { width: 6, height: 6, borderRadius: "50%" },
  badgeBlue: { background: "#dbeafe", color: "#1d4ed8", dotColor: "#2563eb" },
  badgeGreen: { background: "#dcfce7", color: "#15803d", dotColor: "#16a34a" },
  badgeAmber: { background: "#fef3c7", color: "#b45309", dotColor: "#d97706" },
  badgeMuted: { background: "transparent", color: "#c1c5cc", fontWeight: 600 },
  strikeCell: { padding: "9px 10px", textAlign: "center", fontWeight: 700, background: "#f9fafb", borderBottom: "1px solid #f1f2f4", borderLeft: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", whiteSpace: "nowrap", color: "#1a1d23" },
  atmStrikeCell: { background: "rgba(234, 179, 8, 0.18)", color: "#92620a" },
  atmBadge: { marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#ffffff", background: "#eab308", borderRadius: 4, padding: "1px 5px", verticalAlign: "middle" },
  emptyRow: { textAlign: "center", padding: "28px 0", color: "#9ca3af", fontSize: 13 },
};