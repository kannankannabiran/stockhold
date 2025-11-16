// app/api/admin/verify/route.js
import { NextResponse } from 'next/server';
import { signToken } from '../../../../lib/auth';

async function adminVerifyHandler(request) {
  const body = await request.json();
  const { password } = body;
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!password) return NextResponse.json({ success: false, error: 'Missing password' }, { status: 400 });
  if (password !== expected) {
    return NextResponse.json({ success: false, error: 'Invalid admin password' }, { status: 401 });
  }
  
  const token = signToken({ role: 'admin', verified: true });
  
  const res = NextResponse.json({ success: true, token });
  res.headers.set(
    'Set-Cookie',
    `auth=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`
  );
  
  return res;
}

export const POST = adminVerifyHandler;
