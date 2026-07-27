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
  }
}