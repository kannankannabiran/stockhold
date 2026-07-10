// app/api/trending-oi/history/route.js

import { NextResponse } from "next/server";
import {
  getTrendingOiHistory,
  clearTrendingOiHistory,
} from "../../../../lib/trendingOiBackground"; // matches instrumentation.js

import { INDEX_KEYS } from "../../../../lib/optionChainCore";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol || !INDEX_KEYS.includes(symbol)) {
    return NextResponse.json(
      { error: `Invalid or missing symbol. Valid: ${INDEX_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  const history = getTrendingOiHistory(symbol);

  // Return rows as-is — no field remapping, so spot (and anything else
  // stored on the row) reaches the frontend untouched.
  return NextResponse.json(history);
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol || !INDEX_KEYS.includes(symbol)) {
    return NextResponse.json(
      { error: `Invalid or missing symbol. Valid: ${INDEX_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  clearTrendingOiHistory(symbol);

  return NextResponse.json({ ok: true });
}