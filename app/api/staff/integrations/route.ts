import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/backend/staff-context';
import { inspectStaffIntegrations } from '@/lib/backend/staff-integrations';

export const runtime = 'nodejs';
export async function GET() {
  const { context, response } = await requireStaff(['Platform Admin', 'Operations Lead']);
  if (response) return response;
  const { error } = await context.client.from('profiles').select('id').eq('id', context.userId).maybeSingle();
  const data = await inspectStaffIntegrations(!error);
  return NextResponse.json({ data, checkedAt: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
