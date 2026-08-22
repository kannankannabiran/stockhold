import { corsJson, corsOptions } from "../../../../lib/cors";
import { getBearerToken, verifyToken, requireExistingMember } from "../../../../lib/auth";
import { licensePayload } from "../../../../lib/licensesStore";

export function OPTIONS() {
  return corsOptions();
}

export async function GET(request) {
  const token = getBearerToken(request);
  const session = token ? verifyToken(token) : null;
  const member = await requireExistingMember(session);

  if (!member) {
    return corsJson(
      {
        ok: false,
        active: false,
        message: "Purchase product",
        authenticated: false,
      },
      { status: 401 }
    );
  }

  return corsJson({
    ok: true,
    authenticated: true,
    user: { mobile: member.mobile },
    ...licensePayload(member.mobile),
  });
}
