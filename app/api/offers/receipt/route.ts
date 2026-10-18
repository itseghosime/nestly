import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardPublicRequest, hashReceiptToken } from '@/lib/backend/public-request';
import { createClient } from '@/lib/supabase/server';

const receiptSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'offer-receipt', { maxRequests: 20, windowSeconds: 300 });
  if (rejected) return rejected;
  const parsed = receiptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid receipt token' }, { status: 400 });
  const client = await createClient();
  const { data, error } = await client.rpc('get_offer_receipt', {
    p_receipt_hash: hashReceiptToken(parsed.data.token),
  });
  if (error) {
    console.error('Offer receipt lookup failed', error.code);
    return NextResponse.json({ error: 'Unable to retrieve offer status' }, { status: 503 });
  }
  const receipt = data?.[0];
  if (!receipt) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  return NextResponse.json({ receipt }, {
    headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' },
  });
}
