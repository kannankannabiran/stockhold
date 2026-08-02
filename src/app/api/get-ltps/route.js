import { NextResponse } from 'next/server';
import { getKiteClient } from '@/lib/kiteClient'; // using the same client as your spot-ltp file

export async function POST(request) {
  try {
    // Read the body sent by the frontend: { symbols: ["RELIANCE"] }
    const { symbols } = await request.json();

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "Missing or invalid symbols array" }, { status: 400 });
    }

    const kite = await getKiteClient();

    // Kite requires the exchange prefix (e.g., "NSE:RELIANCE")
    const formattedSymbols = symbols.map(sym =>
      sym.includes(":") ? sym : `NSE:${sym}`
    );

    // Fetch the LTPs from Kite
    const ltpData = await kite.getLTP(formattedSymbols);

    // Reformat the response so the frontend gets exactly what it expects
    // Frontend expects: { "RELIANCE": 2500.50 }
    const result = {};
    for (const [instrumentToken, data] of Object.entries(ltpData)) {
      // Remove the "NSE:" part before sending it back to the frontend
      const cleanSymbol = instrumentToken.split(":")[1] || instrumentToken;
      result[cleanSymbol] = data.last_price;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching LTPs:", error.message);
    return NextResponse.json({ error: "Failed to fetch LTPs" }, { status: 500 });
  }
}