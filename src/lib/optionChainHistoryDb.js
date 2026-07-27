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

// One row per captured snapshot (a snapshot = many strike rows sharing one timestamp).
export function listSnapshotTimes(indexKey, date) {
  return db
    .prepare(
      `SELECT DISTINCT time, timestamp FROM option_chain_snapshots
       WHERE index_key = ? AND date = ? ORDER BY timestamp ASC`
    )
    .all(indexKey, date);
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

// Latest snapshot on a date, used when a date is picked but no exact time yet.
export function getLatestSnapshotForDate(indexKey, date) {
  const row = db
    .prepare(
      `SELECT timestamp FROM option_chain_snapshots
       WHERE index_key = ? AND date = ? ORDER BY timestamp DESC LIMIT 1`
    )
    .get(indexKey, date);
  return row ? getSnapshotByTimestamp(indexKey, row.timestamp) : null;
}