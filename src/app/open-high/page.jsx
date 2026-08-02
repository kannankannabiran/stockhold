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

function cellStyle(status, side) {
  if (status === "OPEN_HIGH") return styles.matchCellGreen;
  if (status === "RETEST") return styles.matchCellBlue;
  return side === "CE" ? null : null;
}

function badgeInfo(status, broke) {
  if (status === "OPEN_HIGH") return { label: "Hit", style: styles.badgeGreen };
  if (status === "RETEST") return { label: "Hit", style: styles.badgeBlue };
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

function TimeChip({ iso }) {
  const time = fmtTime(iso);
  if (!time) return <span style={styles.timeChipEmpty}>—</span>;
  return (
    <span style={styles.timeChip}>
      <svg width="10" height="10" viewBox="0 0 10 10" style={styles.timeChipIcon}>
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
    <td style={{ ...styles.strikeCell, ...(isAtm ? styles.atmStrikeCell : null) }}>
      <div style={styles.strikeInner}>
        <span style={styles.strikeNumber}>{strike}</span>
        {isAtm ? (
          <span style={styles.atmBadge}>ATM</span>
        ) : pts ? (
          <span style={{ ...styles.strikePts, ...(pts.startsWith("+") ? styles.strikePtsPos : styles.strikePtsNeg) }}>
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
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            Open <span style={styles.titleAccent}>= High</span>
          </h1>
          <p style={styles.subtitle}>Only Open = High matched strikes are shown. First hit time stays saved.</p>
        </div>

        <div style={styles.controls}>
          <select
            value={index}
            onChange={(e) => {
              setIndex(e.target.value);
              setExpiry(null);
            }}
            style={styles.select}
          >
            {INDEXES.map((i) => (
              <option key={i.key} value={i.key}>
                {i.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={handleDateChange}
            onClick={(e) => {
              if (typeof e.target.showPicker === "function") {
                e.target.showPicker();
              }
            }}
            style={{ ...styles.select, cursor: "pointer" }}
          />

          {data?.expiries?.length > 0 && (
            <select value={expiry || ""} onChange={(e) => setExpiry(e.target.value)} style={styles.select}>
              {data.expiries.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {dateWarning && <div style={styles.warningBanner}>{dateWarning}</div>}
      {!isToday && !weekendSelected && (
        <div style={styles.historicalBanner}>Viewing history for {date} — read-only, no live polling.</div>
      )}
      {weekendSelected && <div style={styles.holidayBanner}>{date} is a weekend — markets are closed, no data to show.</div>}
      {isLikelyHoliday && <div style={styles.holidayBanner}>No data recorded for {date} — likely a market holiday.</div>}

      {!weekendSelected && (
        <div style={styles.statsBar}>
          {data?.spot != null && (
            <div style={styles.statChip}>
              <span style={styles.statLabel}>SPOT</span>
              <span style={styles.statValue}>{data.spot}</span>
            </div>
          )}
          <div style={styles.statChip}>
            <span style={styles.statLabel}>MATCHED</span>
            <span style={{ ...styles.statValue, color: "#16a34a" }}>{hitCount}</span>
          </div>
          <div style={styles.statChip}>
            <span style={styles.statLabel}>EXPIRY</span>
            <span style={styles.statValue}>{data?.expiry || "—"}</span>
          </div>
          {data?.updatedAt && isToday && (
            <div style={styles.liveDot}>
              <span style={styles.pulseDot} />
              {new Date(data.updatedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {error && <div style={styles.errorBox}>{error}</div>}
      {loading && !data && !weekendSelected && <div style={styles.loading}>Loading…</div>}

      {data && !weekendSelected && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th colSpan={6} style={styles.groupHeadCE}>
                  CALL
                </th>
                <th style={styles.strikeHeadCol}>STRIKE</th>
                <th colSpan={6} style={styles.groupHeadPE}>
                  PUT
                </th>
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
              {matchedRows.map((r) => {
                const isAtm = r.strike === atmStrike;
                const ceStyle = cellStyle(r.CE_status, "CE");
                const peStyle = cellStyle(r.PE_status, "PE");
                return (
                  <tr key={r.strike}>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_open)}</td>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_high)}</td>
                    <td style={{ ...styles.cell, ...ceStyle }}>{fmt(r.CE_low)}</td>
                    <td style={{ ...styles.cell, ...styles.ltpCell, ...ceStyle }}>{fmt(r.CE_ltp)}</td>
                    <td style={styles.cellCenter}>
                      <Badge status={r.CE_status} broke={r.CE_broke} />
                    </td>
                    <td style={styles.cellCenter}>
                      <TimeChip iso={r.CE_hitAt} />
                    </td>

                    <StrikeCell strike={r.strike} spot={data.spot} isAtm={isAtm} />

                    <td style={styles.cellCenter}>
                      <TimeChip iso={r.PE_hitAt} />
                    </td>
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

              {matchedRows.length === 0 && (
                <tr>
                  <td colSpan={13} style={styles.emptyRow}>
                    No Open = High matches for this date.
                  </td>
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
  page: { minHeight: "100vh", background: "#f7f8fa", color: "#1a1d23", fontFamily: "'Inter', system-ui, sans-serif", padding: "28px 32px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.5, color: "#111318" },
  titleAccent: { color: "#16a34a" },
  subtitle: { margin: "4px 0 0", color: "#6b7280", fontSize: 13 },
  controls: { display: "flex", gap: 10, alignItems: "center" },
  select: { background: "#ffffff", color: "#1a1d23", border: "1px solid #d8dce3", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" },
  warningBanner: { background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 13 },
  historicalBanner: { background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 13 },
  holidayBanner: { background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#4b5563", borderRadius: 8, padding: "8px 14px", marginBottom: 14, fontSize: 13 },
  statsBar: { display: "flex", gap: 10, alignItems: "center", marginBottom: 18, flexWrap: "wrap" },
  statChip: { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", display: "flex", flexDirection: "column", gap: 2, minWidth: 90, boxShadow: "0 1px 2px rgba(0,0,0,0.03)" },
  statLabel: { fontSize: 10, letterSpacing: 1, color: "#9ca3af" },
  statValue: { fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#111318" },
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
  ltpCell: { fontWeight: 600 },
  matchCellGreen: { background: "rgba(22, 163, 74, 0.18)", color: "#166534", fontWeight: 700 },
  matchCellBlue: { background: "rgba(37, 99, 235, 0.15)", color: "#1d4ed8", fontWeight: 700 },
  badge: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, lineHeight: 1.4 },
  badgeDot: { width: 6, height: 6, borderRadius: "50%" },
  badgeGreen: { background: "#dcfce7", color: "#15803d", dotColor: "#16a34a" },
  badgeBlue: { background: "#dbeafe", color: "#1d4ed8", dotColor: "#2563eb" },
  badgeAmber: { background: "#fef3c7", color: "#b45309", dotColor: "#d97706" },
  badgeMuted: { background: "transparent", color: "#c1c5cc", fontWeight: 600 },
  timeChip: { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: "#f3f4f6", border: "1px solid #e5e7eb", color: "#6b7280", fontSize: 10.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: 0.2 },
  timeChipIcon: { color: "#9ca3af", flexShrink: 0 },
  timeChipEmpty: { color: "#d1d5db", fontSize: 12 },
  strikeCell: { padding: "8px 6px", textAlign: "center", background: "linear-gradient(180deg, #ffffff, #f8f9fb)", borderBottom: "1px solid #f1f2f4", borderLeft: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb", whiteSpace: "nowrap", color: "#1a1d23" },
  strikeInner: { display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 64, padding: "4px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid #e9ebef", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" },
  strikeNumber: { fontSize: 14, fontWeight: 800, letterSpacing: -0.2, color: "#111318" },
  strikePts: { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2 },
  strikePtsPos: { color: "#16a34a" },
  strikePtsNeg: { color: "#dc2626" },
  atmStrikeCell: { background: "linear-gradient(180deg, #fffbeb, #fef9e7)" },
  atmBadge: { fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "#ffffff", background: "linear-gradient(135deg, #f59e0b, #eab308)", borderRadius: 999, padding: "1.5px 8px", boxShadow: "0 1px 3px rgba(234,179,8,0.4)" },
  emptyRow: { textAlign: "center", padding: "28px 0", color: "#9ca3af", fontSize: 13 },
};