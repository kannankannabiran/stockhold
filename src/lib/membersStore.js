import fs from "fs/promises";
import path from "path";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const DATA_FILE = path.join(process.cwd(), "data", "members.json");

async function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const base = { members: [] };
    await fs.writeFile(DATA_FILE, JSON.stringify(base, null, 2));
  }
}

async function readData() {
  try {
    await ensureDataFile();
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("Error reading members data:", error);
    return { members: [] };
  }
}

// ---- Safe Write with Lock + Atomic Replace ----
let writing = Promise.resolve();

async function writeData(obj) {
  writing = writing.then(async () => {
    const tmpFile = DATA_FILE + ".tmp";
    await fs.writeFile(tmpFile, JSON.stringify(obj, null, 2));
    await fs.rename(tmpFile, DATA_FILE); // atomic replace
  });
  return writing;
}

// ---- Public API ----

export async function getMemberByMobile(mobile) {
  const data = await readData();
  return data.members.find((m) => m.mobile === mobile);
}

export async function getMemberById(id) {
  const data = await readData();
  return data.members.find((m) => m.id === id);
}

export async function getAllMembers() {
  const data = await readData();
  return data.members.map(({ password, ...rest }) => rest);
}

export async function signup({ name, mobile, password }) {
  if (!name || !mobile || !password) throw new Error("Missing fields");
  const data = await readData();
  const exists = data.members.find((m) => m.mobile === mobile);
  if (exists) throw new Error("Mobile already registered");

  const hashed = await bcrypt.hash(password, 10);
  const member = {
    id: nanoid(),
    name,
    mobile,
    password: hashed,
    createdAt: new Date().toISOString(),
    active: false,
    urlAccess: [],
  };

  data.members.push(member);
  await writeData(data);

  const { password: _, ...sanitized } = member;
  return sanitized;
}

export async function login({ mobile, password }) {
  if (!mobile || !password) throw new Error("Missing fields");
  const data = await readData();
  const member = data.members.find((m) => m.mobile === mobile);
  if (!member) throw new Error("Invalid credentials");
  if (!member.active) throw new Error("Account not activated");

  const ok = await bcrypt.compare(password, member.password);
  if (!ok) throw new Error("Invalid credentials");

  const { password: _, ...sanitized } = member;
  return sanitized;
}

export async function setActive(mobile, isActive) {
  const data = await readData();
  const member = data.members.find((m) => m.mobile === mobile);
  if (!member) throw new Error("Member not found");
  member.active = !!isActive;

  await writeData(data);
  const { password: _, ...sanitized } = member;
  return sanitized;
}

export async function setUrlAccess(mobile, url, allow) {
  const data = await readData();
  const member = data.members.find((m) => m.mobile === mobile);
  if (!member) throw new Error("Member not found");

  const normalized = url.trim();
  if (allow) {
    if (!member.urlAccess.includes(normalized)) {
      member.urlAccess.push(normalized);
    }
  } else {
    member.urlAccess = member.urlAccess.filter((u) => u !== normalized);
  }

  await writeData(data);
  const { password: _, ...sanitized } = member;
  return sanitized;
}

export async function checkUrlAllowed(memberId, url) {
  const data = await readData();
  const member = data.members.find((m) => m.id === memberId);
  if (!member) return false;
  if (!member.active) return false;
  if (member.urlAccess.length === 0) return true;
  return member.urlAccess.includes(url);
}

// ---- Delete Member ----
export async function deleteMember(mobile) {
  const data = await readData();
  const index = data.members.findIndex((m) => m.mobile === mobile);
  if (index === -1) throw new Error("Member not found");

  data.members.splice(index, 1);
  await writeData(data);

  return { success: true };
}
