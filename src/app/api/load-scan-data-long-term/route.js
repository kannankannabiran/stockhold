import { NextResponse } from "next/server";
import { readIndex } from "../utils/store"; // adjust path if needed

export async function GET() {
  const index = readIndex(); // { symbol: latestResult }
  const rise = Object.values(index)
    .filter(Boolean)
    .filter((r) => r.trend);

  return NextResponse.json({ rise, decline: [] });
}
