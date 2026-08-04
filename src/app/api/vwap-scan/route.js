import { NextResponse } from "next/server";
import { newClient } from "@/lib/kite";
import { getStoredAccessToken } from "@/lib/kiteTokenStore";
import stocklist from "@/app/symbol/data";
import db from "@/lib/db"; // IMPORTANT: Adjust this path to point to your db.js file

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

function calculateYearlyVWAP(data) {
  const yearlyMap = {};
  data.forEach((row) => {
    const year = new Date(row.date).getFullYear();
    const TP = (row.high + row.low + row.close) / 3;
    const TPV = TP * row.volume;
    if (!yearlyMap[year]) yearlyMap[year] = { TPV: 0, volume: 0 };
    yearlyMap[year].TPV += TPV;
    yearlyMap[year].volume += row.volume;
  });
  const yearlyVWAP = {};
  for (const y in yearlyMap) yearlyVWAP[y] = yearlyMap[y].TPV / yearlyMap[y].volume;
  return yearlyVWAP;
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

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(toDate.getFullYear() - 5);

  const resultRise = [];
  const resultDecline = [];
  const batches = chunkArray(symbols, 3);

  for (const batch of batches) {
    const promises = batch.map(async (symbol) => {
      try {
        const instrumentToken = instrumentMap.get(symbol);
        if (!instrumentToken) return null;

        const rawData = await fetchHistoricalWithRetry(kc, instrumentToken, fromDate, toDate);
        if (!rawData?.length) return null;

        const cleanData = rawData.map((row) => ({
          date: row.date,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
        }));

        const yearlyVWAP = calculateYearlyVWAP(cleanData);
        const years = Object.keys(yearlyVWAP).map(Number).sort((a, b) => b - a);
        if (years.length < 5) return null;

        const latestYear = years[0];
        const prevYears = years.slice(1, 5);
        const currentVWAP = yearlyVWAP[latestYear];
        const prevVWAPs = prevYears.map((y) => yearlyVWAP[y]);

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
            prevYears.map((y) => [y, parseFloat(yearlyVWAP[y].toFixed(2))])
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
    for (const res of batchResults) {
      if (res?.trend === "rise") resultRise.push(res);
      if (res?.trend === "decline") resultDecline.push(res);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // --- SAVE TO SQLITE DATABASE ---
  try {
    db.prepare("DELETE FROM vwap_scan_results").run();

    const insertStmt = db.prepare(`
      INSERT INTO vwap_scan_results 
      (symbol, trend, current_year, current_year_vwap, last_price, condition_date, previous_years, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const saveTransaction = db.transaction((results) => {
      for (const res of results) {
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
    });

    const allResults = [...resultRise, ...resultDecline];
    if (allResults.length > 0) {
      saveTransaction(allResults);
    }

    const lastScanTime = new Date().toISOString();
    db.prepare("UPDATE vwap_scan_status SET last_scan = ?, is_scanning = 0 WHERE id = 1").run(lastScanTime);

    return NextResponse.json({
      last_scan: lastScanTime,
      rise: resultRise,
      decline: resultDecline,
    });
  } catch (dbError) {
    console.error("Failed to save to database:", dbError);
    return NextResponse.json({
      last_scan: new Date().toISOString(),
      rise: resultRise,
      decline: resultDecline,
    });
  }
}