import { corsJson, corsOptions } from "../../../../lib/cors";
import { getSession, isAdminSession, requireExistingMember } from "../../../../lib/auth";
import { licensePayload } from "../../../../lib/licensesStore";

export function OPTIONS() {
  return corsOptions();
}

export async function GET(request) {
  const session = getSession(request);
  if (!session) {
    return corsJson({ authenticated: false }, { status: 401 });
  }

  if (session.mobile) {
    const member = await requireExistingMember(session);
    if (!member) {
      return corsJson({ authenticated: false }, { status: 401 });
    }
    return corsJson({
      authenticated: true,
      mobile: member.mobile,
      admin: isAdminSession(session),
      ...licensePayload(member.mobile),
    });
  }

  if (session.role === "admin" && session.verified) {
    return corsJson({
      authenticated: true,
      mobile: "",
      admin: true,
      active: false,
      status: "none",
      message: "Purchase product",
      product: "desktop",
    });
  }

  return corsJson({ authenticated: false }, { status: 401 });
}
