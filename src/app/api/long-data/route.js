import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";
import stocklist from "@/app/symbol/data";

const symbols = stocklist.map((s) => s.value);

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

async function processSymbol(symbol) {
  try {
    const rawData = await yahooFinance.historical(symbol, {
      period1: new Date(new Date().setFullYear(new Date().getFullYear() - 5)),
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
      return { ...resultObj, trend: "rise", type: "decline" };
    }

    if (prevVWAPs.every((v) => v > currentVWAP) && lastClose > currentVWAP) {
      return { ...resultObj, trend: "decline", type: "rise" };
    }

    return null;
  } catch (err) {
    console.error(`Error fetching ${symbol}:`, err);
    return null;
  }
}

export async function GET() {
  const resultRise = [];
  const resultDecline = [];
  const batchSize = 50;
  
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(symbol => processSymbol(symbol));
    
    const results = await Promise.allSettled(promises);
    
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        if (result.value.type === 'rise') {
          resultRise.push(result.value);
        } else if (result.value.type === 'decline') {
          resultDecline.push(result.value);
        }
      }
    });
  }

  return NextResponse.json({
    rise: resultRise,
    decline: resultDecline,
  });
}
