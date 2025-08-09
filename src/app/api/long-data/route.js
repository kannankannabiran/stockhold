import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import stocklist from "@/app/symbol/data";
import { readSymbol, writeSymbol } from "../utils/store"; // adjust path if needed

const symbols = stocklist.map((s) => s.value);

function calculateYearlyVWAP(data) {
  const yearlyMap = {};
  data.forEach((row) => {
    const date = new Date(row.date);
    const year = date.getFullYear();
    const TP = (row.high + row.low + row.close) / 2;
    const TPV = TP * row.volume;
    if (!yearlyMap[year]) yearlyMap[year] = { TPV: 0, volume: 0 };
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

export async function GET() {
  const resultRise = [];

  for (const symbol of symbols) {
    try {
      const symbolEntry = readSymbol(symbol); // { data, lastScanDate, latestResult }
      let period1;

      if (symbolEntry.lastScanDate) {
        const prev = new Date(symbolEntry.lastScanDate);
        prev.setDate(prev.getDate() + 1);
        period1 = prev;
      } else {
        period1 = new Date(new Date().setFullYear(new Date().getFullYear() - 5));
      }

      const today = new Date();
      if (period1 > today) {
        // nothing new to fetch
      }

      const rawData = await yahooFinance.historical(symbol, {
        period1,
        interval: "1d",
      });

      const newClean = (rawData || []).map((row) => ({
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      }));

      // merge existing + new
      const combinedMap = {};
      [...(symbolEntry.data || []), ...newClean].forEach((r) => {
        const key = new Date(r.date).toISOString().split("T")[0];
        combinedMap[key] = r;
      });
      const mergedData = Object.values(combinedMap).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // VWAP calculation
      const yearlyVWAP = calculateYearlyVWAP(mergedData);
      const years = Object.keys(yearlyVWAP)
        .map((y) => parseInt(y))
        .sort((a, b) => b - a);

      // persist basics
      symbolEntry.data = mergedData;
      if (mergedData.length) {
        symbolEntry.lastScanDate = new Date(
          mergedData[mergedData.length - 1].date
        )
          .toISOString()
          .split("T")[0];
      }

      if (years.length < 5) {
        writeSymbol(symbol, symbolEntry);
        continue;
      }

      const latestYear = years[0];
      const previousYears = years.slice(1, 5);
      const currentVWAP = yearlyVWAP[latestYear];
      const currentYearData = mergedData.filter(
        (row) => new Date(row.date).getFullYear() === latestYear
      );

      let conditionDate = null;
      let signalPrice = null;
      for (const row of currentYearData) {
        if (row.close > currentVWAP) {
          conditionDate = new Date(row.date).toISOString().split("T")[0];
          signalPrice = parseFloat(row.close.toFixed(2));
          break;
        }
      }

      if (!conditionDate || !signalPrice) {
        writeSymbol(symbol, symbolEntry);
        continue;
      }

      const lastClose = mergedData[mergedData.length - 1].close;

      const resultObj = {
        symbol,
        current_year: latestYear,
        current_year_vwap: parseFloat(currentVWAP.toFixed(2)),
        signal_price: signalPrice,
        last_price: parseFloat(lastClose.toFixed(2)),
        condition_date: conditionDate,
        previous_years: Object.fromEntries(
          previousYears.map((y) => [y, parseFloat(yearlyVWAP[y].toFixed(2))])
        ),
      };

      // NEW CONDITION:
      // 1. All last 4 years' VWAPs are ABOVE current year's VWAP
      // 2. Latest close price is ABOVE current year's VWAP
      const prevVWAPs = previousYears.map((y) => yearlyVWAP[y]);
      if (
        prevVWAPs.length === 4 &&
        prevVWAPs.every((v) => v > currentVWAP) &&
        lastClose > currentVWAP
      ) {
        const finalObj = {
          ...resultObj,
          trend: "4Y VWAPs > Current Year VWAP & Price > Current Year VWAP",
        };
        resultRise.push(finalObj);
        symbolEntry.latestResult = finalObj;
      }

      writeSymbol(symbol, symbolEntry);
    } catch (err) {
      console.error(`Error fetching ${symbol}:`, err.message || err);
    }
  }

  return NextResponse.json({
    rise: resultRise,
    decline: [],
  });
}
