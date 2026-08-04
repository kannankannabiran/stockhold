import { NextResponse } from "next/server";
import { newClient } from "@/lib/kite";
import { getStoredAccessToken } from "@/lib/kiteTokenStore";
import stocklist from "@/app/symbol/data";
import fs from "fs";
import path from "path";

// symbols from your stocklist — strip ".NS" since Kite tradingsymbols don't use it
const symbols = stocklist.map((s) => s.value.replace(".NS", ""));

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

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

export async function GET() {
  const accessToken = getStoredAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "no_access_token", message: "Login via /connect first." },
      { status: 401 }
    );
  }
  const kc = newClient(accessToken);
  const instrumentMap = await getInstrumentMap(kc);

  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 15;
  const fromDate = new Date(`${startYear}-01-01`);
  const toDate = new Date();

  const results = [];
  const batches = chunkArray(symbols, 3);

  for (const batch of batches) {
    const promises = batch.map(async (symbol) => {
      try {
        const instrumentToken = instrumentMap.get(symbol);
        if (!instrumentToken) return null;

        const rawData = await fetchHistoricalWithRetry(kc, instrumentToken, fromDate, toDate);
        if (!rawData || rawData.length === 0) return null;

        const clean = rawData.filter((row) => row.close && row.volume);

        // Group data by year in-memory
        const dataByYear = {};
        clean.forEach((row) => {
          const y = new Date(row.date).getFullYear();
          if (y >= startYear && y <= currentYear) {
            if (!dataByYear[y]) dataByYear[y] = [];
            dataByYear[y].push(row);
          }
        });

        // Calculate VWAP for each year in-memory
        const yearlyData = {};
        for (const y in dataByYear) {
          const yearRows = dataByYear[y];
          if (yearRows.length === 0) continue;
          const tpv = yearRows.reduce(
            (sum, r) => sum + ((r.high + r.low + r.close) / 3) * r.volume,
            0
          );
          const vol = yearRows.reduce((sum, r) => sum + r.volume, 0);
          if (vol === 0) continue;
          yearlyData[y] = {
            vwap: tpv / vol,
            lastClose: yearRows[yearRows.length - 1].close,
            data: yearRows,
          };
        }

        if (Object.keys(yearlyData).length < 5) return null;

        const years = Object.keys(yearlyData).map(Number);
        const backtest = [];
        for (let i = 4; i < years.length; i++) {
          const year = years[i];
          const prevYears = years.slice(i - 4, i);
          const prevCloses = prevYears.map((y) => yearlyData[y]?.lastClose).filter(Boolean);
          if (prevCloses.length < 4) continue;

          const current = yearlyData[year];
          const currentVWAP = current.vwap;
          const breakout = current.data.find(
            (row) => row.close > currentVWAP && prevCloses.every((p) => currentVWAP > p)
          );
          if (!breakout) continue;

          const end = current.data[current.data.length - 1];
          const pct = ((end.close - breakout.close) / breakout.close) * 100;
          backtest.push({
            year,
            start_date: new Date(breakout.date).toISOString().split("T")[0],
            end_date: new Date(end.date).toISOString().split("T")[0],
            start_price: Number(breakout.close.toFixed(2)),
            end_price: Number(end.close.toFixed(2)),
            percent_change: Number(pct.toFixed(2)),
            trend: "rise",
          });
        }

        if (backtest.length > 0) {
          return { symbol, occurrences: backtest.length, details: backtest };
        }
        return null;
      } catch (err) {
        console.warn(`Skipping ${symbol}:`, err.message);
        return null;
      }
    });

    const batchResults = await Promise.all(promises);
    for (const res of batchResults) {
      if (res) results.push(res);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Save result to backtest.json
  try {
    const dirPath = path.join(process.cwd(), "data");
    const filePath = path.join(dirPath, "backtest.json");
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    fs.writeFileSync(
      filePath,
      JSON.stringify({ results, lastRun: new Date().toISOString() }, null, 2),
      "utf8"
    );
    console.log("✅ Saved backtest.json to", filePath);
  } catch (err) {
    console.error("❌ Failed to save JSON:", err.message);
  }

  return NextResponse.json({ results });
}