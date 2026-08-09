// app/api/rank-scanner/status/route.js
import { NextResponse } from 'next/server';
import { getRankScannerStatus } from '@/lib/rankScannerCore';

export async function GET() {
  return NextResponse.json(getRankScannerStatus());
}