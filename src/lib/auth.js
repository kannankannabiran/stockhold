// lib/auth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'change_this_in_prod';
const JWT_EXPIRES = '7d';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function parseAuthCookie(cookieHeader = '') {
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('auth='));
  if (!match) return null;
  return match.split('=')[1];
}