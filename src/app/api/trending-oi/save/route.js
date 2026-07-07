import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("./data");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return new Response(JSON.stringify({ error: "Missing symbol" }), {
      status: 400,
    });
  }

  const now = new Date();
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hour = istNow.getHours();
  const minute = istNow.getMinutes();

  const isMarketTime =
    process.env.CHECK_MARKET_HOURS === "false" ||
    (hour === 9 && minute >= 15) ||
    (hour > 9 && hour < 15) ||
    (hour === 15 && minute <= 30);

  if (!isMarketTime) {
    return new Response(JSON.stringify({ message: "Outside market hours" }), {
      status: 200,
    });
  }

  try {
    const apiUrl = `http://localhost:3000/api/optionchain?symbol=${symbol}`;
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!Array.isArray(data)) {
      return new Response(JSON.stringify({ error: "Invalid data" }), { status: 200 });
    }

    const atmStrike = data[Math.floor(data.length / 2)]?.strikePrice;
    const atmIndex = data.findIndex((r) => r.strikePrice === atmStrike);
    const selected = data.slice(Math.max(0, atmIndex - 7), atmIndex + 8);

    let callChange = 0,
      putChange = 0;

    selected.forEach((r) => {
      callChange += r.changeinOpenInterest || 0;
      putChange += r.changeinOpenInterest_PE || 0;
    });

    const diffOi = putChange - callChange;
    const sentiment = diffOi > 0 ? "Bullish" : diffOi < 0 ? "Bearish" : "Neutral";

    const date = istNow.toLocaleDateString("en-IN"); // e.g., 25/07/2025
    const time = istNow.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const newRow = {
      id: Date.now(),
      date,
      time,
      callChange,
      putChange,
      diffOi,
      sentiment,
    };

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

    const filePath = path.join(DATA_DIR, `${symbol}.json`);
    let history = [];

    if (fs.existsSync(filePath)) {
      history = JSON.parse(fs.readFileSync(filePath, "utf8"));
    }

    const updatedHistory = [newRow, ...history].slice(0, 10000);
    fs.writeFileSync(filePath, JSON.stringify(updatedHistory, null, 2));

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("Error saving data:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch/save" }), {
      status: 500,
    });
  }
}
