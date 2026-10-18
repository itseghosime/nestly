import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  deriveReceiptToken,
  getIdempotencyKey,
  guardPublicRequest,
  hashReceiptToken,
} from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';
import { createClient } from '@/lib/supabase/server';

const offerSchema = z.object({
  propertyId: z.string().uuid(),
  amount: z.number().finite().min(0.01).max(100_000_000_000),
  currency: z.literal('NGN'),
  name: z.string().trim().min(1).max(120),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
}).refine((value) => value.email.length > 0 || value.phone.length >= 5);

const OFFER_READ_ROLES = ['Platform Admin', 'Operations Lead', 'Legal & Compliance', 'Customer Care'] as const;

export async function GET(request: Request) {
  const { context, response } = await requireStaff(OFFER_READ_ROLES);
  if (response) return response;
  const pageValue = Number(new URL(request.url).searchParams.get('page') || '1');
  if (!Number.isInteger(pageValue) || pageValue < 1 || pageValue > 1000) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 });
  }
  const { data, error } = await context.client.from('offers')
    .select('id, customer_id, property_id, amount, currency, message, status, counter_amount_ngn, public_reference, decided_by, decided_at, created_at, updated_at, customer:customers(display_name, email, phone)')
    .order('created_at', { ascending: false })
    .range((pageValue - 1) * 100, pageValue * 100 - 1);
  if (error) return NextResponse.json({ error: 'Unable to load offer queue' }, { status: 503 });
  return NextResponse.json({
    canDecide: ['Platform Admin', 'Operations Lead', 'Legal & Compliance'].includes(context.role),
    data: (data || []).map((offer) => ({
      ...offer,
      status: offer.status === 'accepted' ? 'approved' : offer.status,
      counter_amount: offer.counter_amount_ngn,
    })),
    page: pageValue,
    pageSize: 100,
  });
}

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'offer-intake', { maxRequests: 6, windowSeconds: 3600 });
  if (rejected) return rejected;
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const receiptToken = deriveReceiptToken('offer', idempotencyKey);
  if (!receiptToken) return NextResponse.json({ error: 'Offer receipts are not configured' }, { status: 503 });
  const parsed = offerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid offer details' }, { status: 400 });

  const client = await createClient();
  const { data, error } = await client.rpc('submit_offer', {
    p_property_id: parsed.data.propertyId,
    p_amount: parsed.data.amount,
    p_currency: parsed.data.currency,
    p_name: parsed.data.name,
    p_email: parsed.data.email.toLowerCase(),
    p_phone: parsed.data.phone,
    p_message: parsed.data.message,
    p_receipt_hash: hashReceiptToken(receiptToken),
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Idempotency key was reused' }, { status: 409 });
    if (error.code === '22023') return NextResponse.json({ error: 'Property is unavailable or offer details are invalid' }, { status: 400 });
    console.error('Offer submission failed', error.code);
    return NextResponse.json({ error: 'Unable to receive offer' }, { status: 503 });
  }
  const result = data?.[0];
  if (!result) return NextResponse.json({ error: 'Offer receipt could not be created' }, { status: 503 });
  return NextResponse.json({
    requestReceived: true,
    confirmed: false,
    status: result.status,
    reference: result.public_reference,
    receiptToken,
  }, { status: 202 });
}
