import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, getIdempotencyKey } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import {
  normalizeInspectionResponse,
  type InspectionResponseRow,
} from '@/lib/backend/inspection-response';

const BOOKING_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;
const transitionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'rescheduled', 'cancelled', 'completed', 'no_show']),
  newSlotId: z.string().uuid().optional(),
  outcome: z.enum(['attended', 'landlord_unavailable', 'customer_no_show', 'property_unavailable', 'other']).optional(),
}).refine((value) => (value.status === 'rescheduled') === Boolean(value.newSlotId))
  .refine((value) => ['completed', 'no_show'].includes(value.status) === Boolean(value.outcome));

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { context, response } = await requireStaff(BOOKING_STAFF_ROLES);
  if (response) return response;
  const { id } = await params;
  const { data, error } = await context.client.from('inspections')
    .select('id, property_id, customer_id, slot_id, status, outcome, public_reference, reservation_expires_at, gate_details, confirmed_at, customer_message, created_at, updated_at, customer:customers!inspections_customer_id_fkey(display_name, email, phone), slot:inspection_slots!inspections_slot_id_fkey(id, property_id, agent_id, starts_at, ends_at, capacity, agent:staff_profiles!inspection_slots_agent_id_fkey(full_name)), property:properties!inspections_property_id_fkey(title, reference, location)')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load inspection request' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Inspection request not found' }, { status: 404 });
  return NextResponse.json({
    booking: normalizeInspectionResponse(data as InspectionResponseRow),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(BOOKING_STAFF_ROLES);
  if (response) return response;
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const parsed = transitionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid booking transition' }, { status: 400 });
  const { id } = await params;
  const { data, error } = await context.client.rpc('transition_inspection_booking', {
    p_booking_id: id,
    p_status: parsed.data.status,
    p_new_slot_id: parsed.data.newSlotId ?? null,
    p_outcome: parsed.data.outcome ?? null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden or invalid transition' }, { status: 403 });
    if (error.code === 'P0002') return NextResponse.json({ error: 'Inspection request not found' }, { status: 404 });
    if (error.code === '23P01') return NextResponse.json({ error: 'Replacement slot is full' }, { status: 409 });
    if (error.code === '23505') return NextResponse.json({ error: 'Idempotency key was reused' }, { status: 409 });
    if (error.code === '22023') return NextResponse.json({ error: 'The booking state or replacement slot is no longer valid' }, { status: 409 });
    if (error.code === '40001') return NextResponse.json({ error: 'The booking changed concurrently; reload and retry with a new Idempotency-Key' }, { status: 409 });
    console.error('Inspection decision failed', error.code);
    return NextResponse.json({ error: 'Unable to update inspection request' }, { status: 503 });
  }
  const booking = data?.[0];
  if (!booking) return NextResponse.json({ error: 'Inspection request not found' }, { status: 404 });
  return NextResponse.json({ booking });
}
