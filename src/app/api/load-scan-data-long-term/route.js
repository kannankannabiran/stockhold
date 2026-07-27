import { NextResponse } from "next/server";
import { getKiteClient } from "@/lib/kite"; // ASSUMPTION: adjust if your singleton lives elsewhere
import stocklist from "@/app/symbol/data";
import fs from "fs/promises";
import path from "path";

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
// Kite's historical data endpoint needs instrument_token, not the symbol string.
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
    // only equity segment, exact tradingsymbol match
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
      const data = await kc.getHistoricalData(instrumentToken, "day", from, to, false, 0);
      return data;
    } catch (err) {
      const isRateLimited =
        err?.message?.includes("Too many requests") || err?.status_code === 429;
      if (isRateLimited && attempt < retries) {
        const backoff = 1000 * (attempt + 1);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
}

// --- Global scan lock: only ONE scan can run at a time across all users ---
let isScanning = false;
let scanProgress = { current: 0, total: 0 };

async function runScanInBackground() {
  if (isScanning) {
    console.log("⏳ Long-term scan is already running, skipping new trigger.");
    return;
  }
  isScanning = true;
  scanProgress = { current: 0, total: symbols.length };
  console.log(`🚀 Long-term scan started! Total symbols: ${symbols.length}`);

  try {
    const kc = await getKiteClient();
    const instrumentMap = await getInstrumentMap(kc);

    const resultRise = [];
    const resultDecline = [];

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setFullYear(toDate.getFullYear() - 5);

    // Kite historical endpoint is strict on rate limits — small batches, real delay between them
    const batches = chunkArray(symbols, 3);

    for (const batch of batches) {
      const promises = batch.map(async (symbol) => {
        try {
          const instrumentToken = instrumentMap.get(symbol);
          if (!instrumentToken) {
            console.log(`No Kite instrument_token found for ${symbol}, skipping`);
            return null;
          }

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
          const years = Object.keys(yearlyVWAP)
            .map((y) => parseInt(y))
            .sort((a, b) => b - a);

          if (years.length < 5) return null;

          const latestYear = years[0];
          const previousYears = years.slice(1, 5);
          const currentVWAP = yearlyVWAP[latestYear];
          const prevVWAPs = previousYears.map((y) => yearlyVWAP[y]);

          const currentYearData = cleanData.filter(
            (row) => new Date(row.date).getFullYear() === latestYear
          );

          let conditionDate = null;
          for (const row of currentYearData) {
            if (row.close > currentVWAP) {
              // NOTE: matches original UTC-shift-fixed formatting used elsewhere in STOCKHOLD —
              // if that fix lives in a shared util, swap this line to use it instead.
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

      scanProgress.current = Math.min(scanProgress.current + batch.length, symbols.length);

      for (const res of batchResults) {
        if (res?.trend === "rise") resultRise.push(res);
        if (res?.trend === "decline") resultDecline.push(res);
      }

      // Larger delay between batches — Kite's historical API rate limit is much tighter than Yahoo's
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const finalResults = {
      last_scan: new Date().toISOString(),
      rise: resultRise,
      decline: resultDecline,
    };

    const filePath = path.join(process.cwd(), "data", "longterm.json");
    await fs.writeFile(filePath, JSON.stringify(finalResults, null, 2), "utf-8");
    console.log("✅ Long-term scan completed successfully!");
  } catch (error) {
    console.error("❌ Long-term scan failed:", error.message);
  } finally {
    isScanning = false;
    scanProgress = { current: 0, total: 0 };
  }
}

// --- GET: return current scan status + existing results (does NOT trigger a scan) ---
export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "longterm.json");
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);
    return NextResponse.json({ isScanning, scanProgress, ...parsed });
  } catch {
    return NextResponse.json({ isScanning, scanProgress, rise: [], decline: [] });
  }
}

// --- POST: trigger a background scan (only if one isn't already running) ---
export async function POST() {
  runScanInBackground();

  try {
    const filePath = path.join(process.cwd(), "data", "longterm.json");
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);
    return NextResponse.json({ isScanning: true, scanProgress, ...parsed });
  } catch {
    return NextResponse.json({ isScanning: true, scanProgress, rise: [], decline: [] });
  }
}