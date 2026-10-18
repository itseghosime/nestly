import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin } from '@/lib/backend/public-request';

const FEE_EDIT_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance'];

async function canEditFees(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { authorized: false, error: true };
  return { authorized: Boolean(profile && FEE_EDIT_ROLES.includes(profile.role)), error: false };
}

function validFee(body: Record<string, unknown>): boolean {
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  return (
    typeof body.fee_key === 'string'
    && /^[a-z0-9_-]{1,64}$/i.test(body.fee_key)
    && (body.kind === 'fixed' || body.kind === 'percent')
    && body.amount != null
    && body.amount !== ''
    && Number.isFinite(amount)
    && amount >= 0
    && (body.base === 'rent' || body.base === 'subtotal')
    && typeof body.required === 'boolean'
    && Number.isInteger(body.sort_order)
    && Number(body.sort_order) >= 0
    && (body.confirmed_at == null || typeof body.confirmed_at === 'string')
  );
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('property_fees')
    .select('*')
    .eq('property_id', id)
    .order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const authority = await canEditFees(supabase, user.id);
  if (authority.error) return NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 500 });
  if (!authority.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || !validFee(body)) return NextResponse.json({ error: 'Invalid fee details' }, { status: 400 });
  const { data, error } = await supabase.from('property_fees').insert({
    property_id: id,
    fee_key: body.fee_key,
    kind: body.kind,
    amount: body.amount,
    base: body.base,
    required: body.required,
    sort_order: body.sort_order,
    confirmed_at: body.confirmed_at ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const authority = await canEditFees(supabase, user.id);
  if (authority.error) return NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 500 });
  if (!authority.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== 'string') return NextResponse.json({ error: 'fee id required' }, { status: 400 });
  const fields = ['fee_key', 'kind', 'amount', 'base', 'required', 'sort_order', 'confirmed_at'] as const;
  const patch = Object.fromEntries(fields
    .filter((field) => body[field] !== undefined)
    .map((field) => [field, body[field]]));
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'No fee fields supplied' }, { status: 400 });
  const { data: current, error: currentError } = await supabase
    .from('property_fees')
    .select('fee_key, kind, amount, base, required, sort_order, confirmed_at')
    .eq('id', body.id)
    .eq('property_id', id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: 'Unable to load fee' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Fee not found' }, { status: 404 });
  if (!validFee({ ...current, ...patch })) {
    return NextResponse.json({ error: 'Invalid fee details' }, { status: 400 });
  }

  const { data, error } = await supabase.from('property_fees')
    .update(patch)
    .eq('id', body.id)
    .eq('property_id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
