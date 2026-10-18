import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/backend/staff-context';

const SLOT_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;

export async function GET() {
  const { context, response } = await requireStaff(SLOT_STAFF_ROLES);
  if (response) return response;

  const { data, error } = await context.client.from('properties')
    .select('id, title, neighborhood')
    .eq('publication_state', 'published')
    .eq('rental_availability', 'available')
    .order('title')
    .limit(100);
  if (error) {
    console.error('Inspection property options failed', error.code);
    return NextResponse.json({ error: 'Unable to load inspection properties' }, { status: 503 });
  }
  return NextResponse.json({ data }, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
