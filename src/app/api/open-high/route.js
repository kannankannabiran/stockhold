import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { newClient } from "../../../lib/kite";
import {
  INDEX_CONFIG,
  todayKey,
  fetchLiveOpenHighData,
  getHistoricalOpenHighData,
} from "../../../lib/openHighCore";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedExpiry = searchParams.get("expiry");
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();
  const requestedDate = searchParams.get("date");

  if (!INDEX_CONFIG[indexKey]) {
    return NextResponse.json(
      { error: "bad_request", message: `Unknown index "${indexKey}". Valid: ${Object.keys(INDEX_CONFIG).join(", ")}` },
      { status: 400 }
    );
  }

  const cfg = INDEX_CONFIG[indexKey];
  const today = todayKey();
  const isHistorical = requestedDate && requestedDate !== today;

  if (isHistorical) {
    const { expiry, expiries, spot, rows } = getHistoricalOpenHighData(indexKey, requestedDate, requestedExpiry);

    const matchedRows = rows.filter(
      (r) => r.CE_status === "OPEN_HIGH" || r.PE_status === "OPEN_HIGH"
    );

    return NextResponse.json({
      index: indexKey,
      label: cfg.label,
      spot,
      expiry,
      expiries,
      rows: matchedRows,
      date: requestedDate,
      historical: true,
      updatedAt: new Date().toISOString(),
    });
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("kite_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  try {
    const kc = newClient(accessToken);
    const { expiry, expiries, spot, rows, date } = await fetchLiveOpenHighData(kc, indexKey, requestedExpiry);

    const matchedRows = rows.filter(
      (r) => r.CE_status === "OPEN_HIGH" || r.PE_status === "OPEN_HIGH"
    );

    return NextResponse.json({
      index: indexKey,
      label: cfg.label,
      spot,
      expiry,
      expiries,
      rows: matchedRows,
      date,
      historical: false,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[open-high] error:", err);
    const message = err?.message || "Unknown error fetching open/high/low/ltp data";
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

export const INDEX_KEYS = Object.keys(INDEX_CONFIG);