import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/backend/staff-context';

const SLOT_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;

export async function GET() {
  const { context, response } = await requireStaff(SLOT_STAFF_ROLES);
  if (response) return response;
  const { data, error } = await context.client
    .from('profiles')
    .select('id, display_name, assigned_zone')
    .eq('role', 'Field Vetting Agent')
    .order('display_name');
  if (error) return NextResponse.json({ error: 'Unable to load authorized field agents' }, { status: 503 });
  return NextResponse.json({ data });
}
