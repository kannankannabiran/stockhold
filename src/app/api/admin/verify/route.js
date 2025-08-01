// app/api/admin/verify/route.js
import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json();
  const { password } = body;
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!password) return NextResponse.json({ success: false, error: 'Missing password' }, { status: 400 });
  if (password !== expected) {
    return NextResponse.json({ success: false, error: 'Invalid admin password' }, { status: 401 });
  }
  // simple token you can store in sessionStorage for client (not JWT)
  return NextResponse.json({ success: true });
}
