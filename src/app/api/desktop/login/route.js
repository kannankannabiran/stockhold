import { corsJson, corsOptions } from "../../../../lib/cors";
import { verifyPassword } from "../../../../lib/membersStore";
import { signDesktopToken } from "../../../../lib/auth";
import { licensePayload } from "../../../../lib/licensesStore";

export function OPTIONS() {
  return corsOptions();
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return corsJson(
      { error: "Mobile number or password is incorrect." },
      { status: 400 }
    );
  }

  const mobile = String(body.mobile || "").trim();
  const password = String(body.password || "");

  try {
    const user = await verifyPassword({ mobile, password });
    if (!user.active) {
      return corsJson(
        { error: "Mobile number or password is incorrect." },
        { status: 400 }
      );
    }
    const license = licensePayload(user.mobile);
    return corsJson({
      ok: true,
      token: signDesktopToken(user.mobile, user.id),
      user: { mobile: user.mobile },
      ...license,
    });
  } catch {
    return corsJson(
      { error: "Mobile number or password is incorrect." },
      { status: 400 }
    );
  }
}
