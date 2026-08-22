// lib/auth.js
import jwt from "jsonwebtoken";
import { getMemberByMobile } from "./membersStore";

const JWT_SECRET =
  process.env.SESSION_SECRET ||
  process.env.AUTH_JWT_SECRET ||
  "change_this_in_prod";
const JWT_EXPIRES = "7d";
const DESKTOP_JWT_EXPIRES = "12h";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function signDesktopToken(mobile, id) {
  return jwt.sign({ mobile, id, kind: "desktop" }, JWT_SECRET, {
    expiresIn: DESKTOP_JWT_EXPIRES,
  });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function parseAuthCookie(cookieHeader = "") {
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("auth="));
  if (!match) return null;
  return match.split("=")[1];
}

export function getBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

export function getSession(request) {
  const bearer = getBearerToken(request);
  if (bearer) {
    const payload = verifyToken(bearer);
    if (payload) return payload;
  }
  const cookie = parseAuthCookie(request.headers.get("cookie") || "");
  return cookie ? verifyToken(cookie) : null;
}

export function isAdminMobile(mobile) {
  const list = (process.env.ADMIN_MOBILES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return Boolean(mobile);
  return list.includes(mobile);
}

export function isAdminSession(session) {
  if (!session) return false;
  if (session.role === "admin" && session.verified) return true;
  return isAdminMobile(session.mobile);
}

/** Token is not enough — user must still exist (and id must match if present). */
export async function requireExistingMember(session) {
  if (!session?.mobile) return null;
  const member = await getMemberByMobile(session.mobile);
  if (!member) return null;
  if (session.id && session.id !== member.id) return null;
  return member;
}
