import { NextResponse } from "next/server";
import {
  getTrendingOiHistory,
  clearTrendingOiHistory,
} from "../../../../lib/trendingOiBackground";
import { INDEX_KEYS } from "../../../../lib/optionChainCore";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const date = searchParams.get("date");

  if (!symbol || !INDEX_KEYS.includes(symbol)) {
    return NextResponse.json(
      { error: `Invalid or missing symbol. Valid: ${INDEX_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  const history = getTrendingOiHistory(symbol, date);
  return NextResponse.json(history);
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const date = searchParams.get("date");

  if (!symbol || !INDEX_KEYS.includes(symbol)) {
    return NextResponse.json(
      { error: `Invalid or missing symbol. Valid: ${INDEX_KEYS.join(", ")}` },
      { status: 400 }
    );
  }

  clearTrendingOiHistory(symbol, date);
  return NextResponse.json({ ok: true });
}