import { NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";

export async function GET() {
  const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
  const loginUrl = kc.getLoginURL();
  return NextResponse.redirect(loginUrl);
}