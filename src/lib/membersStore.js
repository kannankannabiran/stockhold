import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import db from "./db";

// ---- Row <-> API shape helpers ----

function rowToMember(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    password: row.password,
    createdAt: row.created_at,
    active: !!row.active,
    urlAccess: JSON.parse(row.url_access || "[]"),
  };
}

function stripPassword(member) {
  const { password: _, ...rest } = member;
  return rest;
}

// ---- Prepared statements ----

const stmts = {
  byMobile: db.prepare("SELECT * FROM members WHERE mobile = ?"),
  byId: db.prepare("SELECT * FROM members WHERE id = ?"),
  all: db.prepare("SELECT * FROM members"),
  insert: db.prepare(`
    INSERT INTO members (id, name, mobile, password, active, url_access, created_at)
    VALUES (@id, @name, @mobile, @password, @active, @url_access, @created_at)
  `),
  setActive: db.prepare("UPDATE members SET active = ? WHERE mobile = ?"),
  setUrlAccess: db.prepare("UPDATE members SET url_access = ? WHERE mobile = ?"),
  deleteByMobile: db.prepare("DELETE FROM members WHERE mobile = ?"),
  deleteLicensesByMobile: db.prepare("DELETE FROM licenses WHERE mobile = ?"),
};

// ---- Public API (same signatures as before) ----

export async function getMemberByMobile(mobile) {
  return rowToMember(stmts.byMobile.get(mobile));
}

export async function getMemberById(id) {
  return rowToMember(stmts.byId.get(id));
}

export async function getAllMembers() {
  return stmts.all.all().map((row) => stripPassword(rowToMember(row)));
}

export async function signup({ name, mobile, password }) {
  if (!mobile || !password) throw new Error("Missing fields");

  const exists = stmts.byMobile.get(mobile);
  if (exists) throw new Error("Mobile already registered");

  const hashed = await bcrypt.hash(password, 10);
  const member = {
    id: nanoid(),
    name: name || mobile,
    mobile,
    password: hashed,
    createdAt: new Date().toISOString(),
    active: false,
    urlAccess: [],
  };

  stmts.insert.run({
    id: member.id,
    name: member.name,
    mobile: member.mobile,
    password: member.password,
    active: 0,
    url_access: JSON.stringify(member.urlAccess),
    created_at: member.createdAt,
  });

  return stripPassword(member);
}

export async function login({ mobile, password }) {
  if (!mobile || !password) throw new Error("Missing fields");
  const member = rowToMember(stmts.byMobile.get(mobile));
  if (!member) throw new Error("Invalid credentials");
  if (!member.active) throw new Error("Account not activated");

  const ok = await bcrypt.compare(password, member.password);
  if (!ok) throw new Error("Invalid credentials");

  return stripPassword(member);
}

/** Same bcrypt check as website login. Does not require activation or create a user. */
export async function verifyPassword({ mobile, password }) {
  if (!mobile || !password) throw new Error("Invalid credentials");
  const member = rowToMember(stmts.byMobile.get(mobile));
  if (!member) throw new Error("Invalid credentials");

  const ok = await bcrypt.compare(password, member.password);
  if (!ok) throw new Error("Invalid credentials");

  return stripPassword(member);
}

export async function setActive(mobile, isActive) {
  const existing = stmts.byMobile.get(mobile);
  if (!existing) throw new Error("Member not found");

  stmts.setActive.run(isActive ? 1 : 0, mobile);

  const member = rowToMember(stmts.byMobile.get(mobile));
  return stripPassword(member);
}

export async function setUrlAccess(mobile, url, allow) {
  const existing = stmts.byMobile.get(mobile);
  if (!existing) throw new Error("Member not found");

  const member = rowToMember(existing);
  const normalized = url.trim();

  let urlAccess = Array.isArray(member.urlAccess) ? member.urlAccess : [];
  if (allow) {
    if (!urlAccess.includes(normalized)) urlAccess = [...urlAccess, normalized];
  } else {
    urlAccess = urlAccess.filter((u) => u !== normalized);
  }

  stmts.setUrlAccess.run(JSON.stringify(urlAccess), mobile);

  const updated = rowToMember(stmts.byMobile.get(mobile));
  return stripPassword(updated);
}

export async function checkUrlAllowed(memberId, url) {
  const member = rowToMember(stmts.byId.get(memberId));
  if (!member) return false;
  if (!member.active) return false;
  if (!Array.isArray(member.urlAccess) || member.urlAccess.length === 0) return true;
  return member.urlAccess.includes(url);
}

// ---- Delete Member ----
export async function deleteMember(mobile) {
  const existing = stmts.byMobile.get(mobile);
  if (!existing) throw new Error("Member not found");

  stmts.deleteLicensesByMobile.run(mobile);
  stmts.deleteByMobile.run(mobile);

  return { success: true };
}