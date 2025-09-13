// app/api/load-backtest/route.js
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "backtest.json");
    if (!fs.existsSync(filePath)) {
      return Response.json({ results: [], lastRun: null });
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);
    return Response.json(json);
  } catch (err) {
    console.error("❌ Failed to load backtest.json:", err.message);
    return Response.json({ results: [], lastRun: null });
  }
}
