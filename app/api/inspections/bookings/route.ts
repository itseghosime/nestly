import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deriveReceiptToken,
  getIdempotencyKey,
  guardPublicRequest,
  hashReceiptToken,
} from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
  normalizeInspectionResponse,
  type InspectionResponseRow,
} from '@/lib/backend/inspection-response';

const BOOKING_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;
const bookingStatus = z.enum(['pending', 'approved', 'rejected', 'rescheduled', 'cancelled', 'completed', 'no_show', 'expired']);

const bookingSchema = z.object({
  slotId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
}).refine((value) => value.email.length > 0 || value.phone.length >= 5);

export async function GET(request: Request) {
  const { context, response } = await requireStaff(BOOKING_STAFF_ROLES);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const pageValue = Number(params.get('page') || '1');
  const status = params.get('status');
  if (!Number.isInteger(pageValue) || pageValue < 1 || pageValue > 1000) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }
  if (status && !bookingStatus.safeParse(status).success) {
    return NextResponse.json({ error: 'Invalid booking status' }, { status: 400 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Inspection hold maintenance is not configured' }, { status: 503 });
  }

  const admin = createAdminClient();
  const { error: expiryError } = await admin.rpc('expire_pending_inspection_bookings');
  if (expiryError) {
    console.error('Inspection hold expiry failed', expiryError.code);
    return NextResponse.json({ error: 'Unable to refresh pending inspection holds' }, { status: 503 });
  }
  let query = context.client.from('inspections')
    .select('id, property_id, customer_id, slot_id, status, outcome, public_reference, reservation_expires_at, gate_details, confirmed_at, customer_message, created_at, updated_at, customer:customers!inspections_customer_id_fkey(display_name, email, phone), slot:inspection_slots!inspections_slot_id_fkey(id, property_id, agent_id, starts_at, ends_at, capacity, agent:staff_profiles!inspection_slots_agent_id_fkey(full_name)), property:properties!inspections_property_id_fkey(title, reference, location)')
    .order('created_at', { ascending: false });
  if (status === 'expired') {
    query = query.eq('status', 'CANCELLED').eq('outcome', 'reservation_expired');
  } else if (status) {
    const databaseStatus = status === 'approved'
      ? 'CONFIRMED'
      : status === 'pending'
        ? 'PENDING_CONFIRMATION'
        : status.toUpperCase();
    query = query.eq('status', databaseStatus);
  }
  const { data, error } = await query.range((pageValue - 1) * 100, pageValue * 100 - 1);
  if (error) return NextResponse.json({ error: 'Unable to load inspection queue' }, { status: 503 });
  return NextResponse.json({
    data: (data || []).map((row) => normalizeInspectionResponse(row as InspectionResponseRow)),
    page: pageValue,
    pageSize: 100,
  });
}

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'inspection-request', { maxRequests: 5, windowSeconds: 3600 });
  if (rejected) return rejected;
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const receiptToken = deriveReceiptToken('inspection', idempotencyKey);
  if (!receiptToken) return NextResponse.json({ error: 'Inspection receipts are not configured' }, { status: 503 });
  const parsed = bookingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid inspection request' }, { status: 400 });

  const client = await createClient();
  const { data, error } = await client.rpc('submit_inspection_request', {
    p_slot_id: parsed.data.slotId,
    p_name: parsed.data.name,
    p_email: parsed.data.email.toLowerCase(),
    p_phone: parsed.data.phone,
    p_message: parsed.data.message,
    p_receipt_hash: hashReceiptToken(receiptToken),
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Idempotency key was reused' }, { status: 409 });
    if (error.code === '23P01') return NextResponse.json({ error: 'The inspection slot is full' }, { status: 409 });
    if (error.code === '22023') return NextResponse.json({ error: 'Inspection slot is unavailable or request details are invalid' }, { status: 409 });
    console.error('Inspection request failed', error.code);
    return NextResponse.json({ error: 'Unable to receive inspection request' }, { status: 503 });
  }
  const result = data?.[0];
  if (!result) return NextResponse.json({ error: 'Inspection receipt could not be created' }, { status: 503 });
  return NextResponse.json({
    requestReceived: true,
    confirmed: false,
    status: result.status,
    reference: result.public_reference,
    reservationExpiresAt: result.reservation_expires_at,
    receiptToken,
  }, { status: 202 });
}
