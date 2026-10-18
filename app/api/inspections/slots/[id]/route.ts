import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const SLOT_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;
const patchSchema = z.object({
  propertyId: z.string().uuid().optional(),
  fieldAgentId: z.string().uuid().nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  status: z.enum(['available', 'unavailable', 'cancelled']).optional(),
  transitBufferMins: z.number().int().min(0).max(240).optional(),
}).refine((value) => Object.keys(value).length > 0)
  .refine((value) => !value.startsAt || !value.endsAt || Date.parse(value.endsAt) > Date.parse(value.startsAt));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(SLOT_STAFF_ROLES);
  if (response) return response;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid inspection slot update' }, { status: 400 });
  const patch = Object.fromEntries(Object.entries({
    property_id: parsed.data.propertyId,
    agent_id: parsed.data.fieldAgentId,
    starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt,
    capacity: parsed.data.capacity,
    is_active: parsed.data.status === undefined
      ? undefined
      : parsed.data.status === 'available',
    transit_buffer_mins: parsed.data.transitBufferMins,
  }).filter(([, value]) => value !== undefined));
  const { id } = await params;
  const { data, error } = await context.client.from('inspection_slots')
    .update(patch)
    .eq('id', id)
    .select('id, property_id, agent_id, starts_at, ends_at, capacity, is_active, transit_buffer_mins')
    .maybeSingle();
  if (error) {
    if (error.code === '23P01') return NextResponse.json({ error: 'The property or agent already has an overlapping slot' }, { status: 409 });
    if (error.code === 'P0001') return NextResponse.json({ error: 'A slot with active reservations cannot be changed' }, { status: 409 });
    if (error.code === '23514') return NextResponse.json({ error: 'The slot violates capacity, reservation, or configured daylight policy' }, { status: 409 });
    console.error('Inspection slot update failed', error.code);
    return NextResponse.json({ error: 'Unable to update inspection slot' }, { status: 503 });
  }
  if (!data) return NextResponse.json({ error: 'Inspection slot not found or inaccessible' }, { status: 404 });
  return NextResponse.json({ data });
}
