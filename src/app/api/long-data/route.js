import { NextResponse } from "next/server";
import yahooFinance from "@/lib/yahooFinance";
import stocklist from "@/app/symbol/data";
import fs from "fs/promises";
import path from "path";

// symbols from your stocklist
const symbols = stocklist.map((s) => s.value);

// --- Helper: split into chunks ---
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// --- VWAP calculation ---
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

// --- Global scan lock: only ONE scan can run at a time across all users ---
let isScanning = false;
let scanProgress = { current: 0, total: 0 };

// --- Daily run limit tracking ---
let scanCount = 0;         // how many scans ran in current scan-day
let lastScanDayKey = null; // key changes at SCAN_RESET_TIME each day

/**
 * Returns a "scan day" key that rolls over at SCAN_RESET_TIME (default 09:15).
 * Before 09:15 AM today → same key as yesterday (still "yesterday's scan day").
 * At/after 09:15 AM today → today's key.
 */
function getScanDayKey() {
  const now = new Date();
  const [resetH, resetM] = (process.env.SCAN_RESET_TIME || "09:15").split(":").map(Number);
  const resetBoundary = new Date(now);
  resetBoundary.setHours(resetH, resetM, 0, 0);

  if (now < resetBoundary) {
    // Before today's reset time — still in "yesterday's" scan day
    const prev = new Date(now);
    prev.setDate(prev.getDate() - 1);
    return prev.toISOString().split("T")[0];
  }
  return now.toISOString().split("T")[0];
}

/**
 * Returns the ISO timestamp of the next SCAN_RESET_TIME.
 * If current time is already past today's reset → next is tomorrow at reset time.
 */
function getNextScanTime() {
  const now = new Date();
  const [resetH, resetM] = (process.env.SCAN_RESET_TIME || "09:15").split(":").map(Number);
  const next = new Date(now);
  next.setHours(resetH, resetM, 0, 0);
  if (now >= next) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function checkAndResetDailyCount() {
  const key = getScanDayKey();
  if (lastScanDayKey !== key) {
    scanCount = 0;
    lastScanDayKey = key;
  }
}

function getDayRunLimit() {
  return parseInt(process.env.DAY_RUN || "1", 10);
}

function getDailyStatus() {
  checkAndResetDailyCount();
  const dayRunLimit = getDayRunLimit();
  const dailyLimitReached = scanCount >= dayRunLimit;
  return {
    scanCount,
    dayRunLimit,
    dailyLimitReached,
    nextScanTime: dailyLimitReached ? getNextScanTime() : null,
    scanResetTime: process.env.SCAN_RESET_TIME || "09:15",
  };
}

async function runScanInBackground() {
  if (isScanning) {
    console.log("⏳ Long-term scan is already running, skipping new trigger.");
    return;
  }
  checkAndResetDailyCount();
  const dayRunLimit = getDayRunLimit();
  if (scanCount >= dayRunLimit) {
    console.log(`🚫 Daily scan limit reached (${scanCount}/${dayRunLimit}). Skipping.`);
    return;
  }
  scanCount++;
  isScanning = true;
  scanProgress = { current: 0, total: symbols.length };
  console.log(`🚀 Long-term scan started! Total symbols: ${symbols.length}`);

  try {
    const resultRise = [];
    const resultDecline = [];

    const batches = chunkArray(symbols, 20);

    for (const batch of batches) {
      const promises = batch.map(async (symbol) => {
        try {
          const rawData = await yahooFinance.historical(symbol, {
            period1: new Date(new Date().setFullYear(new Date().getFullYear() - 5)),
            period2: new Date(),
            interval: "1d",
          });

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
          if (err.message?.includes("No data found") || err.message?.includes("delisted")) {
            console.log(`${symbol} appears to be delisted, skipping`);
          } else {
            console.error(`Error fetching ${symbol}:`, err.message);
          }
          return null;
        }
      });

      const batchResults = await Promise.all(promises);

      // Update progress after each batch completes
      scanProgress.current = Math.min(scanProgress.current + batch.length, symbols.length);

      for (const res of batchResults) {
        if (res?.trend === "rise") resultRise.push(res);
        if (res?.trend === "decline") resultDecline.push(res);
      }

      // Small delay between batches to avoid rate-limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
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
  const dailyStatus = getDailyStatus();
  try {
    const filePath = path.join(process.cwd(), "data", "longterm.json");
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);
    return NextResponse.json({ isScanning, scanProgress, ...dailyStatus, ...parsed });
  } catch {
    return NextResponse.json({ isScanning, scanProgress, ...dailyStatus, rise: [], decline: [] });
  }
}

// --- POST: trigger a background scan (only if one isn't already running and daily limit not hit) ---
export async function POST() {
  checkAndResetDailyCount();
  const dayRunLimit = getDayRunLimit();
  const dailyStatus = getDailyStatus();

  if (dailyStatus.dailyLimitReached) {
    // Limit reached — return current data with limit info, do NOT start scan
    try {
      const filePath = path.join(process.cwd(), "data", "longterm.json");
      const data = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(data);
      return NextResponse.json({ isScanning: false, scanProgress, ...dailyStatus, ...parsed });
    } catch {
      return NextResponse.json({ isScanning: false, scanProgress, ...dailyStatus, rise: [], decline: [] });
    }
  }

  // Fire the background scan — non-blocking
  runScanInBackground();

  // Immediately return current status + any existing results
  try {
    const filePath = path.join(process.cwd(), "data", "longterm.json");
    const data = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);
    return NextResponse.json({ isScanning: true, scanProgress, ...dailyStatus, ...parsed });
  } catch {
    return NextResponse.json({ isScanning: true, scanProgress, ...dailyStatus, rise: [], decline: [] });
  }
}
