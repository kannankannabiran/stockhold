// app/api/members/route.js
import { NextResponse } from 'next/server';
import { getAllMembers } from '../../../lib/membersStore';
import { withAuth } from '../../../lib/middleware';
import { cookies } from 'next/headers';
import { parseAuthCookie, verifyToken } from '@/lib/auth';

async function getMembersHandler(request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const cookieStore = await cookies();
    const token = cookieStore.get('auth')?.value;
    const verifyAccess = verifyToken(token);
    //console.log('verifyAccess in members route:', verifyAccess);
    const members = await getAllMembers();
    if (!userId && verifyAccess.role == 'member') return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (userId) {
      const filteredMembers = members.filter(member => member.id === userId);
      return NextResponse.json({ success: true, members: filteredMembers });
    }
    
    return NextResponse.json({ success: true, members });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = withAuth(getMembersHandler);
