const symbols = ["NIFTY", "BANKNIFTY"];

function isWithinMarketHours() {
  if (process.env.CHECK_MARKET_HOURS === "false") {
    return true;
  }
  const now = new Date();
  const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const hour = istNow.getHours();
  const minute = istNow.getMinutes();

  const minutesSinceOpen = (hour - 9) * 60 + minute - 15;
  return minutesSinceOpen >= 0 && minutesSinceOpen <= (6 * 60 + 15); // 9:15–15:30
}

export async function startCron() {
  console.log("⏳ Trending OI Cron started");

  const fetchData = async () => {
    if (!isWithinMarketHours()) {
      console.log("🕒 Outside market hours. Skipping fetch.");
      return;
    }

    for (const symbol of symbols) {
      try {
        const res = await fetch(`http://localhost:3000/api/trending-oi/save?symbol=${symbol}`);
        const json = await res.json();
        console.log(`[${new Date().toLocaleTimeString()}] ${symbol} =>`, json);
      } catch (err) {
        console.error("❌ Fetch error for", symbol, err.message);
      }
    }
  };

  fetchData(); // run once immediately
  setInterval(fetchData, 60_000); // then every minute
}
