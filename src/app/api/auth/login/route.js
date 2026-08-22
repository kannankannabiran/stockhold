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
    const token = signDesktopToken(user.mobile, user.id);
    const res = corsJson({
      ok: true,
      mobile: user.mobile,
      token,
      ...license,
      id: user.id,
    });
    res.headers.set(
      "Set-Cookie",
      `auth=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`
    );
    return res;
  } catch {
    return corsJson(
      { error: "Mobile number or password is incorrect." },
      { status: 400 }
    );
  }
}
