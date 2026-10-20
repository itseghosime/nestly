import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assertSameOrigin,
  deriveReceiptToken,
  getIdempotencyKey,
  guardPublicRequest,
  hashReceiptToken,
} from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import { createClient } from '@/lib/supabase/server';

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  message: z.string().trim().min(1).max(4000),
  propertyId: z.string().uuid().optional(),
}).refine((value) => value.email.length > 0 || value.phone.length >= 5);

const CONTACT_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Customer Care'] as const;
const contactStatusSchema = z.object({
  status: z.enum(['in_review', 'responded', 'closed']),
});

export async function GET() {
  const { context, response } = await requireStaff(CONTACT_STAFF_ROLES);
  if (response) return response;
  const { data, error } = await context.client.from('contact_enquiries')
    .select('id, customer_id, property_id, message, status, created_at, updated_at, customer:customers!contact_enquiries_customer_id_fkey(full_name, display_name, email, phone)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load contact enquiries' }, { status: 503 });
  return NextResponse.json({
    data: (data || []).map((enquiry) => {
      const customer = Array.isArray(enquiry.customer) ? enquiry.customer[0] : enquiry.customer;
      return {
        id: enquiry.id,
        customer_id: enquiry.customer_id,
        property_id: enquiry.property_id,
        name: customer?.display_name || customer?.full_name || null,
        email: customer?.email || null,
        phone: customer?.phone || null,
        message: enquiry.message,
        status: enquiry.status,
        created_at: enquiry.created_at,
        updated_at: enquiry.updated_at,
      };
    }),
  });
}

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'contact-enquiry', { maxRequests: 8, windowSeconds: 300 });
  if (rejected) return rejected;
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const receiptToken = deriveReceiptToken('contact-enquiry', idempotencyKey);
  if (!receiptToken) return NextResponse.json({ error: 'Contact receipts are not configured' }, { status: 503 });
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid enquiry details' }, { status: 400 });

  const client = await createClient();
  const { data, error } = await client.rpc('submit_contact_enquiry', {
    p_property_id: parsed.data.propertyId ?? null,
    p_name: parsed.data.name,
    p_email: parsed.data.email.toLowerCase(),
    p_phone: parsed.data.phone,
    p_message: parsed.data.message,
    p_receipt_hash: hashReceiptToken(receiptToken),
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Idempotency key was reused' }, { status: 409 });
    if (error.code === '22023') return NextResponse.json({ error: 'Property is unavailable or enquiry details are invalid' }, { status: 400 });
    console.error('Contact enquiry submission failed', error.code);
    return NextResponse.json({ error: 'Unable to receive enquiry' }, { status: 503 });
  }
  if (!data?.[0]) return NextResponse.json({ error: 'Contact receipt could not be created' }, { status: 503 });
  return NextResponse.json({ requestReceived: true, confirmed: false }, { status: 202 });
}

export async function PATCH(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(CONTACT_STAFF_ROLES);
  if (response) return response;
  const body = await request.json().catch(() => null);
  const parsed = z.object({ id: z.string().uuid(), ...contactStatusSchema.shape }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid enquiry update' }, { status: 400 });
  const { data, error } = await context.client.from('contact_enquiries')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .select('id, status, updated_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to update contact enquiry' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Enquiry not found or inaccessible' }, { status: 404 });
  return NextResponse.json({ data });
}
