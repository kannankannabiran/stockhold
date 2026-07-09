import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { KiteConnect } from "kiteconnect";
import { saveAccessToken } from "../../../lib/kiteTokenStore";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestToken = searchParams.get("request_token");

  if (!requestToken) {
    return NextResponse.json({ error: "missing_request_token" }, { status: 400 });
  }

  const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });

  try {
    const session = await kc.generateSession(
      requestToken,
      process.env.KITE_API_SECRET
    );

    // Set cookie for the logged-in browser session
    const cookieStore = await cookies();
    cookieStore.set("kite_access_token", session.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 1 day - Kite tokens expire daily anyway
    });

    // Save to file so the background poller (no cookies available) can use it
    saveAccessToken(session.access_token);

    return NextResponse.redirect(new URL("/", request.url));
  } catch (err) {
    console.error("[kite/callback] session generation failed:", err.message);
    return NextResponse.json(
      { error: "session_failed", message: err.message },
      { status: 500 }
    );
  }
}