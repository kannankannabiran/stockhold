import { NextResponse } from "next/server";
import { getTokenInfo } from "../../../../lib/kiteTokenStore";

export async function GET() {
  try {
    const tokenInfo = getTokenInfo();

    return NextResponse.json(
      {
        success: true,
        connected: tokenInfo.connected,
        shouldLogin: !tokenInfo.connected,
        tokenDate: tokenInfo.tokenDate,
        updatedAt: tokenInfo.updatedAt,
        checkedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[kite/status] Error:", error);

    return NextResponse.json(
      {
        success: false,
        connected: false,
        shouldLogin: true,
        error: error.message || "Unable to check Kite token",
      },
      { status: 500 }
    );
  }
}