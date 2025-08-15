// lib/membersStore.js
import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const DATA_FILE = path.join(process.cwd(), 'data', 'members.json');

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
    console.log('DATA_FILE path:', DATA_FILE);
    await ensureDataFile();
    console.log('File exists, attempting to read...');
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    console.log('Raw file content:', raw.substring(0, 100) + '...');
    const parsed = JSON.parse(raw);
    console.log('Parsed data:', parsed);
    return parsed;
  } catch (error) {
    console.error('Error reading members data:', error);
    console.error('Error stack:', error.stack);
    return { members: [] };
  }
}

async function writeData(obj) {
  await fs.writeFile(DATA_FILE, JSON.stringify(obj, null, 2));
}

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
  if (!name || !mobile || !password) throw new Error('Missing fields');
  const data = await readData();
  const exists = data.members.find((m) => m.mobile === mobile);
  if (exists) throw new Error('Mobile already registered');
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
  if (!mobile || !password) throw new Error('Missing fields');
  const data = await readData();
  const member = data.members.find((m) => m.mobile === mobile);
  if (!member) throw new Error('Invalid credentials');
  if (!member.active) throw new Error('Account not activated');
  const ok = await bcrypt.compare(password, member.password);
  if (!ok) throw new Error('Invalid credentials');
  const { password: _, ...sanitized } = member;
  return sanitized;
}

export async function setActive(mobile, isActive) {
  const data = await readData();
  const member = data.members.find((m) => m.mobile === mobile);
  if (!member) throw new Error('Member not found');
  member.active = !!isActive;
  await writeData(data);
  const { password: _, ...sanitized } = member;
  return sanitized;
}

export async function setUrlAccess(mobile, url, allow) {
  const data = await readData();
  const member = data.members.find((m) => m.mobile === mobile);
  if (!member) throw new Error('Member not found');
  const normalized = url.trim();
  if (allow) {
    if (!member.urlAccess.includes(normalized)) member.urlAccess.push(normalized);
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