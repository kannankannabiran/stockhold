import { NextResponse } from "next/server";
import {
  getTrendingOiHistory,
  clearTrendingOiHistory,
} from "../../../../lib/trendingOiBackground";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "NIFTY").toUpperCase();
  return NextResponse.json(getTrendingOiHistory(symbol));
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "NIFTY").toUpperCase();
  clearTrendingOiHistory(symbol);
  return NextResponse.json({ ok: true });
}