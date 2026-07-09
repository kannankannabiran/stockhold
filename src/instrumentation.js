export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTrendingOiPoller } = await import("./lib/trendingOiBackground");
    startTrendingOiPoller();
  }
}