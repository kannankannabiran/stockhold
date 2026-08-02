import { NextResponse } from "next/server";
import yahooFinance from "@/lib/yahooFinance";
import stocklist from "@/app/symbol/data";
import db from "@/lib/db"; // IMPORTANT: Adjust this path to point to your db.js file

const symbols = stocklist.map((s) => s.value);

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
  }

  // --- SAVE TO SQLITE DATABASE ---
  try {
    // 1. Clear old scan data to replace with new data
    db.prepare("DELETE FROM vwap_scan_results").run();

    // 2. Prepare Insert Statement
    const insertStmt = db.prepare(`
      INSERT INTO vwap_scan_results 
      (symbol, trend, current_year, current_year_vwap, last_price, condition_date, previous_years, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 3. Run Transaction to save all results fast
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

    // Combine both rise and decline arrays to save to DB
    const allResults = [...resultRise, ...resultDecline];
    if (allResults.length > 0) {
      saveTransaction(allResults);
    }

    // 4. Update scan status timestamp
    const lastScanTime = new Date().toISOString();
    db.prepare("UPDATE vwap_scan_status SET last_scan = ?, is_scanning = 0 WHERE id = 1").run(lastScanTime);

    // 5. Send exact same JSON payload back to the frontend
    const finalResults = {
      last_scan: lastScanTime,
      rise: resultRise,
      decline: resultDecline,
    };

    return NextResponse.json(finalResults);

  } catch (dbError) {
    console.error("Failed to save to database:", dbError);
    // Still return results to frontend even if DB fails
    return NextResponse.json({
      last_scan: new Date().toISOString(),
      rise: resultRise,
      decline: resultDecline,
    });
  }
}