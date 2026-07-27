import db from "./db";

// rows = the `rows` array from getOptionChainData()
export function saveSnapshot(indexKey, expiry, spot, rows) {
  const now = new Date();
  const timestamp = now.getTime();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
  const time = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }); // HH:MM:SS

  const insert = db.prepare(`
    INSERT INTO option_chain_snapshots
      (id, index_key, expiry, strike, spot, ce_ltp, ce_oi, ce_oi_change, ce_vol, ce_chg,
       pe_ltp, pe_oi, pe_oi_change, pe_vol, pe_chg, date, time, timestamp)
    VALUES (@id, @indexKey, @expiry, @strike, @spot, @ce_ltp, @ce_oi, @ce_oiChange, @ce_vol, @ce_chg,
       @pe_ltp, @pe_oi, @pe_oiChange, @pe_vol, @pe_chg, @date, @time, @timestamp)
  `);

  const insertMany = db.transaction((allRows) => {
    for (const r of allRows) {
      insert.run({
        id: `${indexKey}-${r.strike}-${timestamp}`,
        indexKey,
        expiry,
        date,
        time,
        timestamp,
        strike: r.strike,
        spot,
        ce_ltp: r.CE_ltp ?? null,
        ce_oi: r.CE_oi ?? null,
        ce_oiChange: r.CE_oiChange ?? null,
        ce_vol: r.CE_vol ?? null,
        ce_chg: r.CE_chg ?? null,
        pe_ltp: r.PE_ltp ?? null,
        pe_oi: r.PE_oi ?? null,
        pe_oiChange: r.PE_oiChange ?? null,
        pe_vol: r.PE_vol ?? null,
        pe_chg: r.PE_chg ?? null,
      });
    }
  });

  insertMany(rows);
}

export function listSnapshotDates(indexKey) {
  return db
    .prepare(`SELECT DISTINCT date FROM option_chain_snapshots WHERE index_key = ? ORDER BY date DESC`)
    .all(indexKey)
    .map((r) => r.date);
}

export const TIMEFRAME_MINUTES = [1, 3, 5, 15, 30, 60];

// timeframe: 1 | 3 | 5 | 15 | 30 | 60 (minutes) or "day".
export function listSnapshotTimes(indexKey, date, timeframe = 1) {
  if (timeframe === "day") {
    const row = db
      .prepare(
        `SELECT time, timestamp FROM option_chain_snapshots
         WHERE index_key = ? AND date = ? ORDER BY timestamp DESC LIMIT 1`
      )
      .get(indexKey, date);
    return row ? [row] : [];
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT time, timestamp FROM option_chain_snapshots
       WHERE index_key = ? AND date = ? ORDER BY timestamp ASC`
    )
    .all(indexKey, date);

  const minutes = Number(timeframe) || 1;
  if (minutes <= 1) return rows;

  const bucketMs = minutes * 60 * 1000;
  const bucketed = new Map();
  for (const r of rows) {
    const bucketKey = Math.floor(r.timestamp / bucketMs);
    bucketed.set(bucketKey, r); // later rows overwrite -> keeps latest in bucket
  }
  return Array.from(bucketed.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function getSnapshotByTimestamp(indexKey, timestamp) {
  const rows = db
    .prepare(
      `SELECT * FROM option_chain_snapshots
       WHERE index_key = ? AND timestamp = ? ORDER BY strike ASC`
    )
    .all(indexKey, timestamp);
  if (!rows.length) return null;

  return {
    expiry: rows[0].expiry,
    spot: rows[0].spot,
    date: rows[0].date,
    time: rows[0].time,
    timestamp: rows[0].timestamp,
    rows: rows.map((r) => ({
      strike: r.strike,
      CE_ltp: r.ce_ltp,
      CE_oi: r.ce_oi,
      CE_oiChange: r.ce_oi_change,
      CE_vol: r.ce_vol,
      CE_chg: r.ce_chg,
      PE_ltp: r.pe_ltp,
      PE_oi: r.pe_oi,
      PE_oiChange: r.pe_oi_change,
      PE_vol: r.pe_vol,
      PE_chg: r.pe_chg,
    })),
  };
}

export function getLatestSnapshotForDate(indexKey, date) {
  const row = db
    .prepare(
      `SELECT timestamp FROM option_chain_snapshots
       WHERE index_key = ? AND date = ? ORDER BY timestamp DESC LIMIT 1`
    )
    .get(indexKey, date);
  return row ? getSnapshotByTimestamp(indexKey, row.timestamp) : null;
}

// Nearest saved snapshot to targetTimestamp, used to build a live "N minutes
// ago" baseline for interval OI/LTP change. Returns null if nothing was
// captured within `toleranceMs` of the target (e.g. market just opened,
// or the poller had downtime).
export function getSnapshotNearTimestamp(indexKey, targetTimestamp, toleranceMs) {
  const row = db
    .prepare(
      `SELECT timestamp FROM option_chain_snapshots
       WHERE index_key = ?
       ORDER BY ABS(timestamp - ?) ASC
       LIMIT 1`
    )
    .get(indexKey, targetTimestamp);
  if (!row) return null;
  if (Math.abs(row.timestamp - targetTimestamp) > toleranceMs) return null;
  return getSnapshotByTimestamp(indexKey, row.timestamp);
}