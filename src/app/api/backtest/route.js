// app/api/backtest/route.js
import yahooFinance from "yahoo-finance2";
import stocklist from "@/app/symbol/data";
import fs from "fs";
import path from "path";

export async function GET() {
  const symbols = stocklist.map((s) => s.value);
  const results = [];

  for (const symbol of symbols) {
    try {
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - 15;
      const yearlyData = {};

      for (let y = startYear; y <= currentYear; y++) {
        try {
          const from = `${y}-01-01`;
          const to = `${y}-12-31`;

          const rows = await yahooFinance.historical(symbol, {
            period1: new Date(from),
            period2: new Date(to),
            interval: "1d",
          });

          if (!rows || rows.length === 0) continue;

          const clean = rows.filter((row) => row.close && row.volume);
          const tpv = clean.reduce(
            (sum, r) => sum + ((r.high + r.low + r.close) / 3) * r.volume,
            0
          );
          const vol = clean.reduce((sum, r) => sum + r.volume, 0);

          if (vol === 0) continue;

          const vwap = tpv / vol;
          yearlyData[y] = {
            vwap,
            lastClose: clean[clean.length - 1].close,
            data: clean,
          };
        } catch (err) {
          console.warn(`Skipping ${symbol} year ${y}:`, err.message);
          continue;
        }
      }

      if (Object.keys(yearlyData).length < 5) continue;

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
          (row) =>
            row.close > currentVWAP &&
            prevCloses.every((p) => currentVWAP > p)
        );

        if (!breakout) continue;

        const end = current.data[current.data.length - 1];
        const pct = ((end.close - breakout.close) / breakout.close) * 100;

        backtest.push({
          year,
          start_date: breakout.date.toISOString().split("T")[0],
          end_date: end.date.toISOString().split("T")[0],
          start_price: Number(breakout.close.toFixed(2)),
          end_price: Number(end.close.toFixed(2)),
          percent_change: Number(pct.toFixed(2)),
          trend: "rise",
        });
      }

      if (backtest.length > 0) {
        results.push({
          symbol,
          occurrences: backtest.length,
          details: backtest,
        });
      }
    } catch (e) {
      console.error(`Error processing ${symbol}:`, e.message);
    }
  }

  // ✅ Save result to backtest.json
  try {
    const dirPath = path.join(process.cwd(), "data");
    const filePath = path.join(dirPath, "backtest.json");

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify({ results }, null, 2), "utf8");
    console.log("✅ Saved backtest.json to", filePath);
  } catch (err) {
    console.error("❌ Failed to save JSON:", err.message);
  }

  return Response.json({ results });
}
