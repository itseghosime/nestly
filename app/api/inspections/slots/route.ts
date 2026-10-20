import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isUnauthenticatedAuthError } from '@/lib/backend/auth-errors';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import { createClient } from '@/lib/supabase/server';

const SLOT_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;
const slotSchema = z.object({
  propertyId: z.string().uuid(),
  fieldAgentId: z.string().uuid().nullable().optional().default(null),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  capacity: z.number().int().min(1).max(50).default(1),
  transitBufferMins: z.number().int().min(0).max(240).optional(),
})
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: 'The slot end time must be after its start time',
  })
  .refine((value) => Date.parse(value.startsAt) > Date.now(), {
    message: 'Inspection slots must be scheduled in the future',
  });

export async function GET(request: Request) {
  const propertyId = new URL(request.url).searchParams.get('property_id');
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError && !isUnauthenticatedAuthError(authError)) {
    return NextResponse.json({ error: 'Unable to verify session' }, { status: 503 });
  }
  if (user) {
    const { data: profile, error } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (error) return NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 503 });
    if (profile && SLOT_STAFF_ROLES.some((role) => role === profile.role)) {
      let query = client.from('inspection_slots')
        .select('id, property_id, agent_id, starts_at, ends_at, capacity, is_active, transit_buffer_mins, created_at, inspections(id, status, reservation_expires_at)')
        .order('starts_at');
      if (propertyId) query = query.eq('property_id', propertyId);
      const { data, error: queryError } = await query;
      if (queryError) return NextResponse.json({ error: 'Unable to load inspection slots' }, { status: 503 });
      const now = Date.now();
      return NextResponse.json({
        data: (data || []).map((slot) => {
          const reservations = slot.inspections.filter((inspection) => (
            inspection.status === 'CONFIRMED'
            || (
              inspection.status === 'PENDING_CONFIRMATION'
              && inspection.reservation_expires_at
              && Date.parse(inspection.reservation_expires_at) > now
            )
          )).length;
          return {
            ...slot,
            field_agent_id: slot.agent_id,
            reserved_count: reservations,
            status: slot.is_active ? 'available' : 'unavailable',
          };
        }),
      });
    }
  }

  if (!propertyId || !z.string().uuid().safeParse(propertyId).success) {
    return NextResponse.json({ error: 'A valid property_id is required' }, { status: 400 });
  }
  const { data, error } = await client.from('public_inspection_slots')
    .select('id, property_id, starts_at, ends_at, spaces_remaining')
    .eq('property_id', propertyId)
    .order('starts_at');
  if (error) return NextResponse.json({ error: 'Unable to load inspection availability' }, { status: 503 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(SLOT_STAFF_ROLES);
  if (response) return response;
  const parsed = slotSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid inspection slot' }, { status: 400 });
  const { data, error } = await context.client.from('inspection_slots').insert({
    property_id: parsed.data.propertyId,
    agent_id: parsed.data.fieldAgentId,
    starts_at: parsed.data.startsAt,
    ends_at: parsed.data.endsAt,
    capacity: parsed.data.capacity,
    is_active: true,
    ...(parsed.data.transitBufferMins !== undefined
      ? { transit_buffer_mins: parsed.data.transitBufferMins }
      : {}),
  }).select('id, property_id, agent_id, starts_at, ends_at, capacity, is_active, transit_buffer_mins').single();
  if (error) {
    if (error.code === '23P01') return NextResponse.json({ error: 'The property or agent already has an overlapping slot' }, { status: 409 });
    if (error.code === '42501') return NextResponse.json({ error: 'The selected agent is outside the property zone' }, { status: 403 });
    if (error.code === '23514') return NextResponse.json({ error: 'The slot violates future-time or configured daylight policy' }, { status: 400 });
    console.error('Inspection slot creation failed', error.code);
    return NextResponse.json({ error: 'Unable to create inspection slot' }, { status: 503 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
