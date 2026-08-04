import { NextResponse } from "next/server";
import { newClient } from "@/lib/kite";
import { getStoredAccessToken } from "@/lib/kiteTokenStore";
import stocklist from "@/app/symbol/data";
import db from "@/lib/db"; // IMPORTANT: adjust this path to where your db.js is located

// symbols from your stocklist — strip ".NS" since Kite tradingsymbols don't use it
const symbols = stocklist.map((s) => s.value.replace(".NS", ""));

// --- Helper: split into chunks ---
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// --- VWAP calculation (unchanged) ---
function calculateYearlyVWAP(data) {
  const yearlyMap = {};

  data.forEach((row) => {
    const date = new Date(row.date);
    const year = date.getFullYear();
    const TP = (row.high + row.low + row.close) / 3;
    const TPV = TP * row.volume;

    if (!yearlyMap[year]) {
      yearlyMap[year] = { TPV: 0, volume: 0 };
    }

    yearlyMap[year].TPV += TPV;
    yearlyMap[year].volume += row.volume;
  });

  const yearlyVWAP = {};
  for (const year in yearlyMap) {
    const { TPV, volume } = yearlyMap[year];
    yearlyVWAP[year] = TPV / volume;
  }

  return yearlyVWAP;
}

// --- NSE instrument map cache (tradingsymbol -> instrument_token) ---
let instrumentMapCache = null;
let instrumentMapFetchedAt = 0;
const INSTRUMENT_MAP_TTL_MS = 24 * 60 * 60 * 1000; // refresh once a day

async function getInstrumentMap(kc) {
  const now = Date.now();
  if (instrumentMapCache && now - instrumentMapFetchedAt < INSTRUMENT_MAP_TTL_MS) {
    return instrumentMapCache;
  }

  const instruments = await kc.getInstruments(["NSE"]);
  const map = new Map();
  for (const inst of instruments) {
    if (inst.segment === "NSE" && inst.instrument_type === "EQ") {
      map.set(inst.tradingsymbol, inst.instrument_token);
    }
  }

  instrumentMapCache = map;
  instrumentMapFetchedAt = now;
  return map;
}

// --- Fetch historical daily candles from Kite with 429 retry ---
async function fetchHistoricalWithRetry(kc, instrumentToken, from, to, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await kc.getHistoricalData(instrumentToken, "day", from, to, false, 0);
    } catch (err) {
      const isRateLimited = err?.message?.includes("Too many requests") || err?.status_code === 429;
      if (isRateLimited && attempt < retries) {
        const backoff = 1000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
}

// --- Background Worker saving to SQLite (trading.db) ---
async function runScanInBackground() {
  // 1. Check if scan is already running using DB
  const statusRow = db.prepare("SELECT is_scanning FROM vwap_scan_status WHERE id = 1").get();
  if (statusRow?.is_scanning === 1) {
    console.log("⏳ Long-term scan is already running, skipping new trigger.");
    return;
  }

  // 2. Set DB to scanning state
  db.prepare("UPDATE vwap_scan_status SET is_scanning = 1, current_progress = 0, total_progress = ? WHERE id = 1")
    .run(symbols.length);
  
  console.log(`🚀 Long-term scan started! Total symbols: ${symbols.length}`);

  try {
    const accessToken = getStoredAccessToken();
if (!accessToken) {
  console.error("❌ No stored Kite access token — login via /connect first.");
  db.prepare("UPDATE vwap_scan_status SET is_scanning = 0 WHERE id = 1").run();
  return;
}
const kc = newClient(accessToken);
    const instrumentMap = await getInstrumentMap(kc);

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(toDate.getFullYear() - 5);

    // 3. Clear old results from DB before starting new scan
    db.prepare("DELETE FROM vwap_scan_results").run();

    const batches = chunkArray(symbols, 3);
    let currentProgress = 0;

    const insertStmt = db.prepare(`
      INSERT INTO vwap_scan_results 
      (symbol, trend, current_year, current_year_vwap, last_price, condition_date, previous_years, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const batch of batches) {
      const promises = batch.map(async (symbol) => {
        try {
          const instrumentToken = instrumentMap.get(symbol);
          if (!instrumentToken) return null;

          const rawData = await fetchHistoricalWithRetry(kc, instrumentToken, fromDate, toDate);
          if (!rawData || rawData.length === 0) return null;

          const cleanData = rawData.map((row) => ({
            date: row.date,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
          }));

          const yearlyVWAP = calculateYearlyVWAP(cleanData);
          const years = Object.keys(yearlyVWAP).map((y) => parseInt(y)).sort((a, b) => b - a);

          if (years.length < 5) return null;

          const latestYear = years[0];
          const previousYears = years.slice(1, 5);
          const currentVWAP = yearlyVWAP[latestYear];
          const prevVWAPs = previousYears.map((y) => yearlyVWAP[y]);

          const currentYearData = cleanData.filter((row) => new Date(row.date).getFullYear() === latestYear);

          let conditionDate = null;
          for (const row of currentYearData) {
            if (row.close > currentVWAP) {
              conditionDate = new Date(row.date).toISOString().split("T")[0];
              break;
            }
          }

          if (!conditionDate) return null;

          const lastClose = cleanData[cleanData.length - 1].close;

          const resultObj = {
            symbol,
            current_year: latestYear,
            current_year_vwap: parseFloat(currentVWAP.toFixed(2)),
            last_price: parseFloat(lastClose.toFixed(2)),
            condition_date: conditionDate,
            previous_years: Object.fromEntries(
              previousYears.map((y) => [y, parseFloat(yearlyVWAP[y].toFixed(2))])
            ),
          };

          if (prevVWAPs.every((v) => v < currentVWAP) && lastClose > currentVWAP) {
            return { ...resultObj, trend: "rise" };
          }
          if (prevVWAPs.every((v) => v > currentVWAP) && lastClose > currentVWAP) {
            return { ...resultObj, trend: "decline" };
          }

          return null;
        } catch (err) {
          console.error(`Error fetching ${symbol}:`, err.message);
          return null;
        }
      });

      const batchResults = await Promise.all(promises);

      // 4. Save batch directly to SQLite inside a transaction for performance
      const now = Date.now();
      const saveTransaction = db.transaction((results) => {
        for (const res of results) {
          if (res && (res.trend === "rise" || res.trend === "decline")) {
            insertStmt.run(
              res.symbol,
              res.trend,
              res.current_year,
              res.current_year_vwap,
              res.last_price,
              res.condition_date,
              JSON.stringify(res.previous_years),
              now
            );
          }
        }
      });
      saveTransaction(batchResults);

      // 5. Update progress in DB
      currentProgress = Math.min(currentProgress + batch.length, symbols.length);
      db.prepare("UPDATE vwap_scan_status SET current_progress = ? WHERE id = 1").run(currentProgress);

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 6. Mark scan as finished in DB
    db.prepare("UPDATE vwap_scan_status SET is_scanning = 0, last_scan = ? WHERE id = 1")
      .run(new Date().toISOString());
    console.log("✅ Long-term scan completed successfully and saved to trading.db!");

  } catch (error) {
    console.error("❌ Long-term scan failed:", error.message);
    db.prepare("UPDATE vwap_scan_status SET is_scanning = 0 WHERE id = 1").run();
  }
}

// --- GET: Fetch results from trading.db for the Frontend ---
export async function GET() {
  try {
    const statusRow = db.prepare("SELECT * FROM vwap_scan_status WHERE id = 1").get();
    const rows = db.prepare("SELECT * FROM vwap_scan_results").all();
    
    const rise = [];
    const decline = [];

    rows.forEach(row => {
      const formatted = {
        symbol: row.symbol,
        trend: row.trend,
        current_year: row.current_year,
        current_year_vwap: row.current_year_vwap,
        last_price: row.last_price,
        condition_date: row.condition_date,
        previous_years: JSON.parse(row.previous_years),
      };
      if (row.trend === "rise") rise.push(formatted);
      if (row.trend === "decline") decline.push(formatted);
    });

    return NextResponse.json({
      isScanning: statusRow?.is_scanning === 1,
      scanProgress: {
        current: statusRow?.current_progress || 0,
        total: statusRow?.total_progress || 0
      },
      last_scan: statusRow?.last_scan || null,
      rise,
      decline
    });
  } catch (err) {
    console.error("DB Fetch Error:", err);
    return NextResponse.json({ 
      isScanning: false, 
      scanProgress: { current: 0, total: 0 }, 
      rise: [], 
      decline: [] 
    });
  }
}

// --- POST: Trigger background scan ---
export async function POST() {
  runScanInBackground();
  
  // Return current DB status immediately so UI knows it started
  const response = await GET();
  return response;
}