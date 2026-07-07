import { NextResponse } from "next/server";
import { newClient } from "../../../lib/kite";

export async function GET() {
  const kc = newClient();
  const loginUrl = kc.getLoginURL();
  return NextResponse.redirect(loginUrl);
}
