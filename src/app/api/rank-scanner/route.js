// app/api/rank-scanner/route.js
import { NextResponse } from 'next/server';
import { startRankScan, getRankScannerResults } from '@/lib/rankScannerCore';
import { NIFTY_500_SYMBOLS } from '@/lib/nifty500Symbols';

export async function POST() {
  try {
    const { alreadyRunning } = await startRankScan(NIFTY_500_SYMBOLS);
    return NextResponse.json({ started: !alreadyRunning, alreadyRunning });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ results: getRankScannerResults() });
}