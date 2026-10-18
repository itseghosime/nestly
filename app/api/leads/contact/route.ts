import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, getIdempotencyKey, guardPublicRequest } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import { createClient } from '@/lib/supabase/server';

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  message: z.string().trim().min(1).max(4000),
  propertyId: z.string().trim().min(1).max(80).optional(),
}).refine((value) => value.email.length > 0 || value.phone.length >= 5);

const CONTACT_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Customer Care'] as const;
const contactStatusSchema = z.object({
  status: z.enum(['in_review', 'responded', 'closed']),
});

export async function GET() {
  const { context, response } = await requireStaff(CONTACT_STAFF_ROLES);
  if (response) return response;
  const { data, error } = await context.client.from('contact_enquiries')
    .select('id, customer_id, property_id, name, email, phone, message, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load contact enquiries' }, { status: 503 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'contact-enquiry', { maxRequests: 8, windowSeconds: 300 });
  if (rejected) return rejected;
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const parsed = contactSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid enquiry details' }, { status: 400 });

  const client = await createClient();
  const { error } = await client.from('contact_enquiries').insert({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone,
    message: parsed.data.message,
    property_id: parsed.data.propertyId ?? null,
    idempotency_key: idempotencyKey,
  });
  if (error && error.code !== '23505') {
    console.error('Contact enquiry submission failed', error.code);
    return NextResponse.json({ error: 'Unable to receive enquiry' }, { status: 503 });
  }
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
