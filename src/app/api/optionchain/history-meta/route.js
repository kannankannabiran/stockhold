import { NextResponse } from "next/server";
import { INDEX_CONFIG } from "../../../../lib/optionChainCore";
import { listSnapshotDates, listSnapshotTimes } from "../../../../lib/optionChainHistoryDb";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();
  const date = searchParams.get("date");
  const timeframeParam = searchParams.get("timeframe"); // "1" | "3" | "5" | "15" | "30" | "60" | "day"

  if (!INDEX_CONFIG[indexKey]) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (date) {
    const timeframe = timeframeParam === "day" ? "day" : Number(timeframeParam) || 1;
    return NextResponse.json({
      index: indexKey,
      date,
      timeframe,
      times: listSnapshotTimes(indexKey, date, timeframe),
    });
  }
  return NextResponse.json({ index: indexKey, dates: listSnapshotDates(indexKey) });
}