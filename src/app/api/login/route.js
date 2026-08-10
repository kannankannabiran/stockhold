// src/app/api/login/route.js
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { autoLogin } from "../../../lib/kiteAutoLogin";
import { saveAccessToken } from "../../../lib/kiteTokenStore";

/**
 * Hitting this route now tries the TOTP auto-login first (no manual
 * Zerodha login page, no clicking through 2FA by hand). If that fails
 * for any reason — TOTP secret wrong, Kite changed something, etc — it
 * falls back to the original manual flow so you're never fully locked
 * out: redirecting to Zerodha's login page, which still completes via
 * /api/callback exactly as before.
 *
 * Pass ?manual=1 to skip auto-login and go straight to the manual flow.
 */
export async function GET(request) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: "KITE_API_KEY is missing",
      },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const forceManual = url.searchParams.get("manual") === "1";

  if (!forceManual) {
    try {
      console.log("[kite/login] Attempting TOTP auto-login");
      const session = await autoLogin();

      if (!session?.access_token) {
        throw new Error("Auto-login did not return an access token");
      }

      saveAccessToken(session.access_token);

      const cookieStore = await cookies();
      cookieStore.set("kite_access_token", session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });

      console.log("[kite/login] Auto-login succeeded, token saved");
      return NextResponse.redirect(new URL("/connect", request.url));
    } catch (error) {
      console.error(
        "[kite/login] Auto-login failed, falling back to manual login:",
        error?.message
      );
      // fall through to manual redirect below
    }
  }

  const loginUrl = new URL("https://kite.zerodha.com/connect/login");
  loginUrl.searchParams.set("v", "3");
  loginUrl.searchParams.set("api_key", apiKey);

  console.log("[kite/login] Redirecting to Zerodha (manual login)");
  return NextResponse.redirect(loginUrl);
}