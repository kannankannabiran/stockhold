// app/api/auth/route.js
import { NextResponse } from 'next/server';
import {
  signup,
  login as loginMember,
  setActive,
  setUrlAccess,
  getMemberByMobile,
} from '../../../lib/membersStore';
import { signToken, verifyToken } from '../../../lib/auth';

export async function POST(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const body = await request.json();

  try {
    if (action === 'signup') {
      const { name, mobile, password } = body;
      const member = await signup({ name, mobile, password });
      return NextResponse.json({ success: true, member }, { status: 201 });
    }

    if (action === 'login') {
      const { mobile, password } = body;
      await loginMember({ mobile, password }); // throws on failure
      const member = await getMemberByMobile(mobile);
      const token = signToken({ id: member.id, mobile: member.mobile, name: member.name });
      const res = NextResponse.json({
        success: true,
        member: { id: member.id, mobile: member.mobile, name: member.name },
      });
      // set httpOnly cookie
      res.headers.set(
        'Set-Cookie',
        `auth=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Strict`
      );
      return res;
    }

    if (action === 'toggle') {
      const { mobile, active } = body;
      const member = await setActive(mobile, active);
      return NextResponse.json({ success: true, member });
    }

    if (action === 'url-access') {
      const { mobile, url: targetUrl, allow } = body;
      const member = await setUrlAccess(mobile, targetUrl, allow);
      return NextResponse.json({ success: true, member });
    }

    if (action === 'me') {
      const cookieHeader = request.headers.get('cookie') || '';
      const token = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('auth='))?.split('=')[1];
      const payload = verifyToken(token);
      if (!payload) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      return NextResponse.json({ success: true, user: payload });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
