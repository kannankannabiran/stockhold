import cron from "node-cron";
import fetch from "node-fetch";

// IST = UTC+5:30 → cron runs in server timezone (adjust if needed)

// 9:20 AM IST
cron.schedule("50 3 * * *", async () => {
  console.log("⏰ Running auto scan 9:20 AM IST");
  await fetch("http://localhost:3000/api/vwap-scan");
});

// 6:30 PM IST
cron.schedule("0 13 * * *", async () => {
  console.log("⏰ Running auto scan 6:30 PM IST");
  await fetch("http://localhost:3000/api/vwap-scan");
});
