import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../lib/kite";
import { getOptionChainData, INDEX_CONFIG } from "../../../lib/optionChainCore";
import {
  getSnapshotByTimestamp,
  getLatestSnapshotForDate,
  getSnapshotNearTimestamp,
} from "../../../lib/optionChainHistoryDb";

function todayIstKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// Rebuild OI-change / LTP-change fields on `rows` using `baseline.rows` (same
// shape, captured N minutes ago) as the reference point instead of previous
// day's close.
function applyIntervalBaseline(rows, baseline) {
  const baselineByStrike = {};
  for (const r of baseline.rows) baselineByStrike[r.strike] = r;

  return rows.map((r) => {
    const b = baselineByStrike[r.strike];
    return {
      ...r,
      CE_oiChange: b && b.CE_oi != null && r.CE_oi != null ? r.CE_oi - b.CE_oi : null,
      PE_oiChange: b && b.PE_oi != null && r.PE_oi != null ? r.PE_oi - b.PE_oi : null,
      CE_chg: b && b.CE_ltp != null && r.CE_ltp != null ? Number((r.CE_ltp - b.CE_ltp).toFixed(2)) : null,
      PE_chg: b && b.PE_ltp != null && r.PE_ltp != null ? Number((r.PE_ltp - b.PE_ltp).toFixed(2)) : null,
    };
  });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedExpiry = searchParams.get("expiry");
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();
  const date = searchParams.get("date"); // YYYY-MM-DD, optional
  const time = searchParams.get("time"); // timestamp (ms), optional — historical browsing
  const timeframeParam = searchParams.get("timeframe"); // "1" | "3" | "5" | "15" | "30" | "60" | "day" | null

  if (!INDEX_CONFIG[indexKey]) {
    return NextResponse.json(
      { error: "bad_request", message: `Unknown index "${indexKey}". Valid: ${Object.keys(INDEX_CONFIG).join(", ")}` },
      { status: 400 }
    );
  }

  // Historical read — served straight from SQLite, no Kite session needed.
  if (date && date !== todayIstKey()) {
    const snap = time
      ? getSnapshotByTimestamp(indexKey, Number(time))
      : getLatestSnapshotForDate(indexKey, date);

    if (!snap) {
      return NextResponse.json(
        { error: "no_history", message: `No saved snapshots for ${indexKey} on ${date}.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      index: indexKey,
      label: INDEX_CONFIG[indexKey].label,
      spot: snap.spot,
      expiry: snap.expiry,
      expiries: [snap.expiry],
      rows: snap.rows,
      updatedAt: snap.timestamp,
      historical: true,
      capturedDate: snap.date,
      capturedTime: snap.time,
      capturedTimestamp: snap.timestamp,
    });
  }

  // Live read.
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("kite_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }
  const kc = newClient(accessToken);

  try {
    const result = await getOptionChainData(kc, indexKey, requestedExpiry);

    let rows = result.rows;
    let timeframeApplied = null;
    const timeframe = timeframeParam === "day" || !timeframeParam ? "day" : Number(timeframeParam) || 1;

    if (timeframe !== "day") {
      const targetTs = Date.now() - timeframe * 60 * 1000;
      const tolerance = Math.max(90 * 1000, timeframe * 60 * 1000 * 0.5);
      const baseline = getSnapshotNearTimestamp(indexKey, targetTs, tolerance);
      if (baseline) {
        rows = applyIntervalBaseline(result.rows, baseline);
        timeframeApplied = {
          minutes: timeframe,
          baselineTimestamp: baseline.timestamp,
          baselineTime: baseline.time,
        };
      }
      // If no baseline is available yet (e.g. market just opened), fall back
      // to the original day-vs-prev-close numbers rather than showing nulls.
    }

    return NextResponse.json({ ...result, rows, historical: false, timeframe, timeframeApplied });
  } catch (err) {
    console.error("[optionchain] error:", err);
    const message = err?.message || "Unknown error fetching option chain";
    const isAuthError = /token|session|forbidden/i.test(message);
    const isRateLimit = /429|too many requests/i.test(message);
    return NextResponse.json(
      {
        error: isAuthError ? "not_connected" : isRateLimit ? "rate_limited" : "fetch_failed",
        message: isRateLimit ? "Kite API rate limit hit — try again in a moment." : message,
      },
      { status: isAuthError ? 401 : isRateLimit ? 429 : 500 }
    );
  }
}