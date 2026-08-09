// src/app/api/test-totp/route.js
import { NextResponse } from "next/server";
import { authenticator } from "otplib";

/**
 * Safe, offline test: generates a TOTP code from KITE_TOTP_SECRET the same
 * way the real auto-login does, without touching Kite at all.
 *
 * Use this FIRST when debugging — open this URL and, within the same
 * second, check your authenticator app. The 6-digit code here should
 * match exactly. If it doesn't, KITE_TOTP_SECRET is wrong (or it's a
 * 6-digit code instead of the base32 secret) — fix that before testing
 * anything else.
 */
export async function GET() {
  const secret = process.env.KITE_TOTP_SECRET;

  if (!secret) {
    return NextResponse.json(
      { success: false, error: "KITE_TOTP_SECRET is missing from .env.local" },
      { status: 500 }
    );
  }

  try {
    const code = authenticator.generate(secret);
    const timeRemaining = authenticator.timeRemaining();

    return NextResponse.json({
      success: true,
      code,
      valid_for_seconds: timeRemaining,
      note: "Compare this code against your authenticator app right now — they should match.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to generate TOTP code" },
      { status: 500 }
    );
  }
}