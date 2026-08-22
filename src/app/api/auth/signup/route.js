import { corsJson, corsOptions } from "../../../../lib/cors";
import { signup } from "../../../../lib/membersStore";
import { licensePayload } from "../../../../lib/licensesStore";

export function OPTIONS() {
  return corsOptions();
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "Missing fields" }, { status: 400 });
  }

  const mobile = String(body.mobile || "").trim();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();

  try {
    const member = await signup({ name, mobile, password });
    return corsJson(
      {
        ok: true,
        mobile: member.mobile,
        ...licensePayload(member.mobile),
        id: member.id,
        name: member.name,
      },
      { status: 201 }
    );
  } catch (e) {
    return corsJson({ error: e.message || "Signup failed" }, { status: 400 });
  }
}
