export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTrendingOiPoller } = await import("./lib/trendingOiBackground");
    startTrendingOiPoller();
    const { startOpenHighPoller } = await import("./lib/openHighBackground");
    startOpenHighPoller();
    const { startOiTrendPoller } = await import("./lib/Oitrendbackground");
    startOiTrendPoller();
    const { startOptionChainSnapshotBackground } = await import("./lib/optionChainSnapshotBackground");
    startOptionChainSnapshotBackground();

    // Kite TOTP auto-login — runs automatically at 8:00 AM IST, Mon–Fri,
    // with no browser tab or manual click needed. Requires: npm install node-cron
    if (!globalThis.__kiteAutoConnectCronStarted) {
      globalThis.__kiteAutoConnectCronStarted = true;

      const cron = await import("node-cron");
      const { autoLogin } = await import("./lib/kiteAutoLogin");
      const { saveAccessToken } = await import("./lib/kiteTokenStore");

      // "0 8 * * 1-5" = 8:00 AM, Monday-Friday. Use "0 8 * * *" for every day.
      cron.default.schedule(
        "0 8 * * 1-5",
        async () => {
          console.log("[cron] Running scheduled Kite auto-login (8:00 AM IST)");
          try {
            const session = await autoLogin();
            saveAccessToken(session.access_token);
            console.log(
              `[cron] Auto-login succeeded for ${session.user_id}, token saved`
            );
          } catch (error) {
            console.error("[cron] Scheduled auto-login failed:", error.message);
          }
        },
        { timezone: "Asia/Kolkata" }
      );

      console.log("[cron] Kite auto-login scheduled for 8:00 AM IST, Mon-Fri");
    }
  }
}