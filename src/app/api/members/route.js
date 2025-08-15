// app/api/members/route.js
import { NextResponse } from 'next/server';
import { getAllMembers } from '../../../lib/membersStore';

export async function GET() {
  try {
    const members = await getAllMembers();
    return NextResponse.json({ success: true, members });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
