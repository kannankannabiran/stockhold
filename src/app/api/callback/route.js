import { NextResponse } from "next/server";
import { newClient, getApiSecret } from "../../../lib/kite";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const requestToken = searchParams.get("request_token");
  const status = searchParams.get("status");

  if (!requestToken || status !== "success") {
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent("Login was not completed. Please try again.")}`
    );
  }

  try {
    const kc = newClient();
    const session = await kc.generateSession(requestToken, getApiSecret());
    const res = NextResponse.redirect(`${origin}/?connected=1`);

    // Kite access tokens are valid until ~6am the next day.
    res.cookies.set("kite_access_token", session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 20, // 20 hours
    });

    return res;
  } catch (err) {
    console.error("[callback] generateSession failed:", err.message);
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(
        "Login failed: " + (err.message || "unknown error")
      )}`
    );
  }
}
