import { NextResponse } from "next/server";
import { INDEX_CONFIG } from "../../../../lib/optionChainCore";
import { listSnapshotDates, listSnapshotTimes } from "../../../../lib/optionChainHistoryDb";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const indexKey = (searchParams.get("index") || "NIFTY").toUpperCase();
  const date = searchParams.get("date");

  if (!INDEX_CONFIG[indexKey]) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (date) {
    // [{ time: "09:31:05", timestamp: 1753... }, ...]
    return NextResponse.json({ index: indexKey, date, times: listSnapshotTimes(indexKey, date) });
  }
  return NextResponse.json({ index: indexKey, dates: listSnapshotDates(indexKey) });
}