import { corsJson, corsOptions } from "../../../../lib/cors";
import { getSession, isAdminSession } from "../../../../lib/auth";
import { getAllMembers, getMemberByMobile, deleteMember, setActive } from "../../../../lib/membersStore";
import { licensePayload, setDesktopLicense } from "../../../../lib/licensesStore";

export function OPTIONS() {
  return corsOptions();
}

function requireAdmin(request) {
  const session = getSession(request);
  if (!session || !isAdminSession(session)) return null;
  return session;
}

export async function GET(request) {
  if (!requireAdmin(request)) {
    return corsJson({ error: "Forbidden" }, { status: 403 });
  }

  const members = await getAllMembers();
  return corsJson({
    members: members.map((m) => ({
      mobile: m.mobile,
      name: m.name,
      createdAt: m.createdAt,
      websiteActive: !!m.active,
      urlAccess: m.urlAccess,
      ...licensePayload(m.mobile),
    })),
  });
}

export async function POST(request) {
  if (!requireAdmin(request)) {
    return corsJson({ error: "Forbidden" }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "Invalid body" }, { status: 400 });
  }

  const mobile = String(body.mobile || "").trim();
  const action = body.action;
  if (!mobile || !["activate", "revoke", "delete", "account-activate", "account-deactivate"].includes(action)) {
    return corsJson({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await getMemberByMobile(mobile);
  if (!existing) {
    return corsJson({ error: "Member not found" }, { status: 404 });
  }

  if (action === "delete") {
    await deleteMember(mobile);
    return corsJson({ ok: true, mobile, deleted: true });
  }

  if (action === "account-activate" || action === "account-deactivate") {
    const on = action === "account-activate";
    await setActive(mobile, on);
    const result = setDesktopLicense(mobile, on ? "activate" : "revoke");
    return corsJson({
      ok: true,
      mobile,
      websiteActive: on,
      ...result,
    });
  }

  const result = setDesktopLicense(mobile, action);
  return corsJson({ ok: true, ...result });
}
