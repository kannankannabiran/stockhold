// src/app/api/test-auto-login/route.js
import { NextResponse } from "next/server";
import { autoLogin } from "../../../lib/kiteAutoLogin";
import { saveAccessToken } from "../../../lib/kiteTokenStore";

/**
 * Test-only endpoint: runs the exact same auto-login used by /api/login,
 * but returns a JSON result instead of redirecting — much easier to read
 * error messages from than watching browser redirects.
 *
 * GET  /api/test-auto-login          -> runs login, saves token if it succeeds
 * GET  /api/test-auto-login?dry=1    -> runs login but does NOT save the token
 *                                        (use this to test repeatedly without
 *                                        touching your real stored session)
 *
 * Consider removing or protecting this route once you're done testing —
 * it triggers a real login against Zerodha every time it's called.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";

  const startedAt = Date.now();

  try {
    const session = await autoLogin();
    const elapsedMs = Date.now() - startedAt;

    if (!dryRun) {
      saveAccessToken(session.access_token);
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      elapsed_ms: elapsedMs,
      saved: !dryRun,
      user_id: session.user_id,
      login_time: session.login_time,
      access_token_preview: session.access_token
        ? `${session.access_token.slice(0, 6)}...${session.access_token.slice(-4)}`
        : null,
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        success: false,
        dry_run: dryRun,
        elapsed_ms: elapsedMs,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}