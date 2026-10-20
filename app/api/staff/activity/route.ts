import { NextResponse } from 'next/server';
import { STAFF_ROLES } from '@/lib/backend/authorization';
import { requireStaff } from '@/lib/backend/staff-context';

export async function GET() {
  const { context, response } = await requireStaff(STAFF_ROLES);
  if (response) return response;
  const { data, error } = await context.client.rpc('staff_activity_counts');
  if (error || !data?.[0]) {
    return NextResponse.json({ error: 'Unable to load staff activity' }, { status: 503 });
  }
  return NextResponse.json({ data: {
    attentionCount: Number(data[0].attention_count),
    unreadNotifications: Number(data[0].unread_notifications),
    checkedAt: new Date().toISOString(),
  } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
