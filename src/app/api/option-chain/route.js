// app/api/options/option-chain/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol') || 'NIFTY';
  const isIndex = ["NIFTY", "BANKNIFTY"].includes(symbol);

  const url = `https://www.nseindia.com/api/option-chain-${isIndex ? 'indices' : 'equities'}?symbol=${symbol}`;
  const headers = {
    "User-Agent": "Mozilla/5.0",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/option-chain",
  };

  try {
    const session = axios.create({ headers, withCredentials: true });
    await session.get("https://www.nseindia.com");
    const response = await session.get(url);
    const data = response.data;

    const spot = data.records.underlyingValue;
    const step = symbol === "BANKNIFTY" ? 100 : 50;
    const atm = Math.round(spot / step) * step;
    const lower = atm - step * 7;
    const upper = atm + step * 7;
    const expiry = data.records.expiryDates[0];

    const ce = [], pe = [];

    for (const row of data.records.data) {
      const strike = row.strikePrice;
      if (row.expiryDate !== expiry || strike < lower || strike > upper) continue;
      if (row.CE?.expiryDate === expiry) ce.push(row.CE);
      if (row.PE?.expiryDate === expiry) pe.push(row.PE);
    }

    const ceMap = new Map(ce.map(i => [i.strikePrice, i]));
    const peMap = new Map(pe.map(i => [i.strikePrice, i]));
    const result = [];

    for (let strike of ceMap.keys()) {
      if (peMap.has(strike)) {
        result.push({
          strikePrice: strike,
          ...ceMap.get(strike),
          ...Object.fromEntries(Object.entries(peMap.get(strike)).map(([k, v]) => [k + '_PE', v])),
        });
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch option chain" }, { status: 500 });
  }
}
