import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../lib/kite";
import { getOptionChainData, INDEX_CONFIG } from "../../../lib/optionChainCore";
import { getSnapshotByTimestamp, getLatestSnapshotForDate } from "../../../lib/optionChainHistoryDb";

function todayIstKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedExpiry = searchParams.get("expiry");
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();
  const date = searchParams.get("date"); // YYYY-MM-DD, optional
  const time = searchParams.get("time"); // timestamp (ms), optional

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
    return NextResponse.json({ ...result, historical: false });
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