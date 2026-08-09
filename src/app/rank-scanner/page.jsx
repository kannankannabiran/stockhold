'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './rank-scanner.module.css';

const PERIODS = [
  { key: 'today', label: "Today" },
  { key: 'd5', label: '5D' },
  { key: 'd10', label: '10D' },
  { key: 'd15', label: '15D' },
  { key: 'd30', label: '30D' },
  { key: 'd90', label: '90D' },
  { key: 'd180', label: '180D' },
  { key: 'y1', label: '1Y' },
];

// Config-driven columns so the header row, filter row, sort logic, and
// cell rendering all stay in sync from one source of truth.
const COLUMNS = [
  { key: 'symbol', label: 'Symbol', type: 'text', sticky: true },
  { key: 'index', label: 'Index', type: 'text' },
  { key: 'ltp', label: 'LTP', type: 'range' },
  ...PERIODS.map((p) => ({
    key: `change_${p.key}`,
    label: `${p.label} %`,
    type: 'range',
    group: 'change',
    periodKey: p.key,
  })),
  ...PERIODS.map((p) => ({
    key: `rank_${p.key}`,
    label: `Rk ${p.label}`,
    type: 'range',
    group: 'rank',
    periodKey: p.key,
  })),
];

function getValue(row, col) {
  if (col.key === 'symbol') return row.symbol;
  if (col.key === 'index') return row.index;
  if (col.key === 'ltp') return row.ltp;
  if (col.group === 'change') return row.changes?.[col.periodKey];
  if (col.group === 'rank') return row.ranks?.[col.periodKey];
  return null;
}

function passesFilter(row, col, filter) {
  if (!filter) return true;
  const val = getValue(row, col);

  if (col.type === 'text') {
    if (!filter.text) return true;
    return (val || '').toLowerCase().includes(filter.text.toLowerCase());
  }

  if (col.type === 'range') {
    if (val === null || val === undefined) return !filter.min && !filter.max;
    if (filter.min !== undefined && filter.min !== '' && val < parseFloat(filter.min)) return false;
    if (filter.max !== undefined && filter.max !== '' && val > parseFloat(filter.max)) return false;
    return true;
  }

  return true;
}

function formatPct(v) {
  if (v === null || v === undefined) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
}

// Magnitude-scaled heatmap tint instead of a flat green/red block —
// a +0.3% day and a +12% day shouldn't look the same weight.
function changeCellStyle(v) {
  if (v === null || v === undefined) return {};
  const alpha = 0.06 + (Math.min(Math.abs(v), 15) / 15) * 0.22;
  return {
    backgroundColor: `rgba(${v >= 0 ? '46, 158, 79' : '194, 59, 50'}, ${alpha})`,
    color: v >= 0 ? 'var(--gain)' : 'var(--loss)',
  };
}

function findExtreme(rows, key, dir) {
  let best = null;
  for (const row of rows) {
    const v = row.changes?.[key];
    if (v === null || v === undefined) continue;
    if (!best || (dir === 'max' ? v > best.changes[key] : v < best.changes[key])) best = row;
  }
  return best;
}

export default function RankScannerPage() {
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [sortKey, setSortKey] = useState('rank_today');
  const [sortDir, setSortDir] = useState('asc');
  const [filters, setFilters] = useState({});
  const pollRef = useRef(null);

  async function fetchResults() {
    const res = await fetch('/api/rank-scanner');
    const data = await res.json();
    setRows(data.results || []);
  }

  async function fetchStatus() {
    const res = await fetch('/api/rank-scanner/status');
    const data = await res.json();
    setStatus(data);
    return data;
  }

  async function startScan() {
    await fetch('/api/rank-scanner', { method: 'POST' });
    poll();
  }

  function poll() {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const s = await fetchStatus();
      if (!s.running) {
        clearInterval(pollRef.current);
        fetchResults();
      }
    }, 1500);
  }

  useEffect(() => {
    fetchStatus().then((s) => {
      if (s.running) poll();
      if (s.hasResults) fetchResults();
    });
    return () => pollRef.current && clearInterval(pollRef.current);
  }, []);

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function updateTextFilter(colKey, text) {
    setFilters((f) => ({ ...f, [colKey]: { text } }));
  }

  function updateRangeFilter(colKey, edge, value) {
    setFilters((f) => ({ ...f, [colKey]: { ...f[colKey], [edge]: value } }));
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => COLUMNS.every((col) => passesFilter(row, col, filters[col.key])));
  }, [rows, filters]);

  const sortedRows = useMemo(() => {
    const sortCol = COLUMNS.find((c) => c.key === sortKey);
    return [...filteredRows].sort((a, b) => {
      const av = getValue(a, sortCol);
      const bv = getValue(b, sortCol);
      const aMissing = av === null || av === undefined;
      const bMissing = bv === null || bv === undefined;
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filteredRows, sortKey, sortDir]);

  const activeFilterCount = Object.values(filters).filter(
    (f) => f && (f.text || f.min !== undefined && f.min !== '' || f.max !== undefined && f.max !== '')
  ).length;

  const topGainer = useMemo(() => findExtreme(rows, 'today', 'max'), [rows]);
  const topLoser = useMemo(() => findExtreme(rows, 'today', 'min'), [rows]);

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Rank Scanner</h1>
          <p className={styles.subtitle}>Multi-timeframe % change &amp; rank — NIFTY 500</p>
        </div>

        <button className={styles.runButton} onClick={startScan} disabled={status?.running}>
          {status?.running ? 'Scanning…' : 'Run Scan'}
        </button>

        {status?.running && (
          <>
            <div className={styles.progressTrack}>
              <div
                className={styles.progressFill}
                style={{ width: `${status.total ? (100 * status.completed) / status.total : 0}%` }}
              />
            </div>
            <span className={styles.statusPill}>
              {status.completed} / {status.total}
            </span>
          </>
        )}

        {status?.error && <span className={styles.errorPill}>{status.error}</span>}

        {status?.finishedAt && !status.running && (
          <span className={styles.statusPill}>
            Last run {new Date(status.finishedAt).toLocaleTimeString()}
          </span>
        )}

        {activeFilterCount > 0 && (
          <button className={styles.clearButton} onClick={() => setFilters({})}>
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {rows.length > 0 && (topGainer || topLoser) && (
        <div className={styles.moversStrip}>
          {topGainer && (
            <div className={styles.moverCard}>
              <div className={styles.moverBar} style={{ background: 'var(--gain)' }} />
              <div>
                <div className={styles.moverLabel}>Top gainer today</div>
                <div className={styles.moverSymbol}>{topGainer.symbol}</div>
              </div>
              <div className={`${styles.moverValue} ${styles.moverValuePos}`}>
                {formatPct(topGainer.changes.today)}
              </div>
            </div>
          )}
          {topLoser && (
            <div className={styles.moverCard}>
              <div className={styles.moverBar} style={{ background: 'var(--loss)' }} />
              <div>
                <div className={styles.moverLabel}>Top loser today</div>
                <div className={styles.moverSymbol}>{topLoser.symbol}</div>
              </div>
              <div className={`${styles.moverValue} ${styles.moverValueNeg}`}>
                {formatPct(topLoser.changes.today)}
              </div>
            </div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <p className={styles.rowCount}>
          Showing {sortedRows.length} of {rows.length} symbols
        </p>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`${styles.th} ${sortKey === col.key ? styles.thActive : ''} ${
                    col.sticky ? styles.stickyColHead : ''
                  }`}
                  onClick={() => handleSort(col.key)}
                  title="Click to sort"
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className={styles.sortArrow}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
            <tr className={styles.filterRow}>
              {COLUMNS.map((col) => (
                <th key={col.key} className={col.sticky ? styles.stickyColHead : ''}>
                  {col.type === 'text' ? (
                    <input
                      className={styles.filterInput}
                      placeholder="filter…"
                      value={filters[col.key]?.text || ''}
                      onChange={(e) => updateTextFilter(col.key, e.target.value)}
                    />
                  ) : (
                    <div className={styles.rangeInputs}>
                      <input
                        className={styles.filterInput}
                        placeholder="min"
                        type="number"
                        value={filters[col.key]?.min ?? ''}
                        onChange={(e) => updateRangeFilter(col.key, 'min', e.target.value)}
                      />
                      <input
                        className={styles.filterInput}
                        placeholder="max"
                        type="number"
                        value={filters[col.key]?.max ?? ''}
                        onChange={(e) => updateRangeFilter(col.key, 'max', e.target.value)}
                      />
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={row.symbol} className={`${styles.row} ${idx % 2 === 1 ? styles.rowEven : ''}`}>
                <td className={`${styles.td} ${styles.tdSymbol} ${styles.stickyCol}`}>{row.symbol}</td>
                <td className={`${styles.td} ${styles.tdIndex}`}>{row.index}</td>
                <td className={`${styles.td} ${styles.tdLtp}`}>
                  {row.ltp !== null && row.ltp !== undefined ? row.ltp.toFixed(2) : '—'}
                </td>
                {PERIODS.map((p) => {
                  const v = row.changes?.[p.key];
                  const cls = v === null || v === undefined ? styles.tdEmpty : '';
                  return (
                    <td
                      key={p.key}
                      className={`${styles.td} ${styles.changeCell} ${cls}`}
                      style={changeCellStyle(v)}
                    >
                      {formatPct(v)}
                    </td>
                  );
                })}
                {PERIODS.map((p) => {
                  const r = row.ranks?.[p.key];
                  const active = sortKey === `rank_${p.key}`;
                  return (
                    <td
                      key={p.key}
                      className={`${styles.td} ${styles.rankCell} ${active ? styles.rankCellActive : ''}`}
                    >
                      {r ?? '—'}
                    </td>
                  );
                })}
              </tr>
            ))}

            {sortedRows.length === 0 && rows.length > 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className={styles.emptyState}>
                  No symbols match the current filters.
                </td>
              </tr>
            )}

            {rows.length === 0 && !status?.running && (
              <tr>
                <td colSpan={COLUMNS.length} className={styles.emptyState}>
                  No scan results yet — click "Run Scan" to build the table.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}