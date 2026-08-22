import cron from "node-cron";
import fetch from "node-fetch";
import { siteUrl } from "../../lib/siteUrl";

const origin = siteUrl();

// ⏰ VWAP Scan Schedules

// 9:20 AM IST → 03:50 UTC
cron.schedule("50 3 * * *", async () => {
  console.log("⏰ Running auto VWAP scan 9:20 AM IST");
  try {
    await fetch(`${origin}/api/vwap-scan`);
    console.log("✅ VWAP scan completed (9:20 AM)");
  } catch (err) {
    console.error("❌ VWAP scan failed (9:20 AM):", err.message);
  }
});

// 6:30 PM IST → 13:00 UTC
cron.schedule("0 13 * * *", async () => {
  console.log("⏰ Running auto VWAP scan 6:30 PM IST");
  try {
    await fetch(`${origin}/api/vwap-scan`);
    console.log("✅ VWAP scan completed (6:30 PM)");
  } catch (err) {
    console.error("❌ VWAP scan failed (6:30 PM):", err.message);
  }
});

// ⏰ Backtest Schedule
// 9:30 AM IST → 04:00 UTC
cron.schedule("0 4 * * *", async () => {
  console.log("⏰ Running daily backtest at 9:30 AM IST");
  try {
    await fetch(`${origin}/api/backtest`);
    console.log("✅ Backtest completed and JSON saved");
  } catch (err) {
    console.error("❌ Backtest failed:", err.message);
  }
});
