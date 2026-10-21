import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/backend/staff-context';

const SLOT_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;

export async function GET() {
  const { context, response } = await requireStaff(SLOT_STAFF_ROLES);
  if (response) return response;

  const { data, error } = await context.client.from('properties')
    .select('id, title, neighborhood, city, state')
    .eq('publication_state', 'published')
    .eq('rental_availability', 'available')
    .order('title')
    .limit(100);
  if (error) {
    console.error('Inspection property options failed', error.code);
    return NextResponse.json({ error: 'Unable to load inspection properties' }, { status: 503 });
  }
  let availableProperties = data || [];
  if (context.role === 'Platform Admin' || context.role === 'Operations Lead') {
    const { data: neighborhoods, error: coverageError } = await context.client.from('neighborhoods')
      .select('name, city, state, active');
    if (coverageError) {
      console.error('Inspection coverage lookup failed', coverageError.code);
      return NextResponse.json({ error: 'Unable to verify inspection coverage' }, { status: 503 });
    }
    const normalize = (value: string | null) => value?.trim().toLocaleLowerCase('en') || '';
    availableProperties = availableProperties.filter((property) => {
      const matches = (neighborhoods || []).filter((area) => (
        normalize(area.name) === normalize(property.neighborhood)
        && normalize(area.city) === normalize(property.city)
        && normalize(area.state) === normalize(property.state)
      ));
      return matches.length === 0 || matches.some((area) => area.active);
    });
  }
  return NextResponse.json({ data: availableProperties }, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
