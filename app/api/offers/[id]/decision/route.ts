import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const decisionSchema = z.object({
  status: z.enum(['approved', 'rejected', 'countered']),
  counterAmount: z.number().finite().min(0).max(100_000_000_000).optional(),
}).refine((value) => value.status !== 'countered' || value.counterAmount !== undefined);

const DECISION_ROLES = ['Platform Admin', 'Operations Lead', 'Legal & Compliance'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(DECISION_ROLES);
  if (response) return response;
  const { id } = await params;
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid offer decision' }, { status: 400 });

  const databaseStatus = parsed.data.status === 'approved' ? 'accepted' : parsed.data.status;
  const { data, error } = await context.client.from('offers')
    .update({
      status: databaseStatus,
      counter_amount_ngn: parsed.data.status === 'countered' ? parsed.data.counterAmount : null,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, status, counter_amount_ngn, decided_by, updated_at')
    .maybeSingle();
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('Offer decision failed', error.code);
    return NextResponse.json({ error: 'Unable to record offer decision' }, { status: 503 });
  }
  if (data) {
    return NextResponse.json({
      decision: {
        ...data,
        status: data.status === 'accepted' ? 'approved' : data.status,
        counter_amount: data.counter_amount_ngn,
      },
    });
  }

  const { data: current, error: lookupError } = await context.client.from('offers')
    .select('id, status, counter_amount_ngn, decided_by, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'Unable to verify offer state' }, { status: 503 });
  if (
    current?.status === databaseStatus
    && current.decided_by === context.userId
    && (
      parsed.data.status !== 'countered'
      || Number(current.counter_amount_ngn) === parsed.data.counterAmount
    )
  ) {
    return NextResponse.json({
      decision: {
        ...current,
        status: current.status === 'accepted' ? 'approved' : current.status,
        counter_amount: current.counter_amount_ngn,
      },
    });
  }
  return NextResponse.json({ error: 'Offer not found or already decided' }, { status: current ? 409 : 404 });
}
