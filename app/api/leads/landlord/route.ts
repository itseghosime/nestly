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
    .select('id, customer_id, property_type, state, city, neighborhood, address, bedrooms, expected_annual_rent, description, status, created_at, updated_at, customer:customers!landlord_submissions_customer_id_fkey(full_name, display_name, email, phone)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load landlord submissions' }, { status: 503 });
  return NextResponse.json({
    data: (data || []).map((submission) => {
      const customer = Array.isArray(submission.customer) ? submission.customer[0] : submission.customer;
      return {
        id: submission.id,
        customer_id: submission.customer_id,
        name: customer?.display_name || customer?.full_name || null,
        email: customer?.email || null,
        phone: customer?.phone || null,
        property_type: submission.property_type,
        state: submission.state,
        city: submission.city,
        neighborhood: submission.neighborhood,
        address: submission.address,
        bedrooms: submission.bedrooms,
        expected_annual_rent: submission.expected_annual_rent,
        description: submission.description,
        status: submission.status,
        created_at: submission.created_at,
        updated_at: submission.updated_at,
      };
    }),
  });
}

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'landlord-submission', { maxRequests: 4, windowSeconds: 3600 });
  if (rejected) return rejected;
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const receiptToken = deriveReceiptToken('landlord-submission', idempotencyKey);
  if (!receiptToken) return NextResponse.json({ error: 'Property submission receipts are not configured' }, { status: 503 });
  const parsed = landlordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid property submission details' }, { status: 400 });

  const client = await createClient();
  const submission = await client.rpc('submit_landlord_submission', {
    p_name: parsed.data.name,
    p_email: parsed.data.email.toLowerCase(),
    p_phone: parsed.data.phone,
    p_property_type: parsed.data.propertyType,
    p_state: parsed.data.state,
    p_city: parsed.data.city,
    p_neighborhood: parsed.data.neighborhood,
    p_address: parsed.data.address,
    p_bedrooms: parsed.data.bedrooms,
    p_expected_annual_rent: parsed.data.expectedAnnualRent,
    p_description: parsed.data.description,
    p_receipt_hash: hashReceiptToken(receiptToken),
    p_idempotency_key: idempotencyKey,
  }).then(
    (result) => result,
    (submissionError: unknown) => {
      console.error(
        'Landlord submission failed before receipt confirmation',
        submissionError instanceof Error ? submissionError.name : 'unknown',
      );
      return null;
    },
  );
  if (!submission) {
    return NextResponse.json({
      error: 'Unable to confirm receipt. Retry with the unchanged form to avoid creating a duplicate.',
    }, { status: 503 });
  }
  const { data, error } = submission;
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Idempotency key was reused' }, { status: 409 });
    if (error.code === '22023') return NextResponse.json({ error: 'Property submission details are invalid' }, { status: 400 });
    console.error('Landlord submission failed', error.code);
    return NextResponse.json({ error: 'Unable to receive property submission' }, { status: 503 });
  }
  if (!data?.[0]) return NextResponse.json({ error: 'Property submission receipt could not be created' }, { status: 503 });
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
