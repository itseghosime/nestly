import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin, getIdempotencyKey, guardPublicRequest } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import { createClient } from '@/lib/supabase/server';

const landlordSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  propertyType: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1).max(120),
  neighborhood: z.string().trim().min(1).max(160),
  address: z.string().trim().min(1).max(300),
  bedrooms: z.number().int().min(0).max(30),
  expectedAnnualRent: z.number().finite().min(0).max(100_000_000_000),
  description: z.string().trim().max(4000).optional().default(''),
}).refine((value) => value.email.length > 0 || value.phone.length >= 5);

const LANDLORD_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance'] as const;

export async function GET() {
  const { context, response } = await requireStaff(LANDLORD_STAFF_ROLES);
  if (response) return response;
  const { data, error } = await context.client.from('landlord_submissions')
    .select('id, customer_id, name, email, phone, property_type, state, city, neighborhood, address, bedrooms, expected_annual_rent, description, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load landlord submissions' }, { status: 503 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'landlord-submission', { maxRequests: 4, windowSeconds: 3600 });
  if (rejected) return rejected;
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const parsed = landlordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid property submission details' }, { status: 400 });

  const client = await createClient();
  const { error } = await client.from('landlord_submissions').insert({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    phone: parsed.data.phone,
    property_type: parsed.data.propertyType,
    state: parsed.data.state,
    city: parsed.data.city,
    neighborhood: parsed.data.neighborhood,
    address: parsed.data.address,
    bedrooms: parsed.data.bedrooms,
    expected_annual_rent: parsed.data.expectedAnnualRent,
    description: parsed.data.description,
    idempotency_key: idempotencyKey,
  });
  if (error && error.code !== '23505') {
    console.error('Landlord submission failed', error.code);
    return NextResponse.json({ error: 'Unable to receive property submission' }, { status: 503 });
  }
  return NextResponse.json({ requestReceived: true, confirmed: false }, { status: 202 });
}

export async function PATCH(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(LANDLORD_STAFF_ROLES);
  if (response) return response;
  const parsed = z.object({
    id: z.string().uuid(),
    status: z.enum(['in_review', 'accepted', 'rejected']),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid landlord submission update' }, { status: 400 });
  const { data, error } = await context.client.from('landlord_submissions')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .select('id, status, updated_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to update landlord submission' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Submission not found or inaccessible' }, { status: 404 });
  return NextResponse.json({ data });
}
