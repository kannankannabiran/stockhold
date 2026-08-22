import { corsJson, corsOptions } from "../../../../lib/cors";
import { getSession, requireExistingMember } from "../../../../lib/auth";
import { licensePayload } from "../../../../lib/licensesStore";

export function OPTIONS() {
  return corsOptions();
}

export async function GET(request) {
  const session = getSession(request);
  const member = await requireExistingMember(session);

  if (!member) {
    return corsJson({ authenticated: false }, { status: 401 });
  }

  return corsJson({
    ok: true,
    authenticated: true,
    user: { mobile: member.mobile },
    ...licensePayload(member.mobile),
  });
}
