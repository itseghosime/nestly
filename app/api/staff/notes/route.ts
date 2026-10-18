import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const NOTE_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance', 'Customer Care'] as const;
const entityType = z.enum(['property', 'customer', 'enquiry', 'landlord_submission', 'offer', 'booking', 'inspection', 'conversation']);

export async function GET(request: Request) {
  const { context, response } = await requireStaff(NOTE_STAFF_ROLES);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const type = entityType.safeParse(params.get('entity_type'));
  const id = z.string().uuid().safeParse(params.get('entity_id'));
  if (!type.success || !id.success) {
    return NextResponse.json({ error: 'entity_type and entity_id are required' }, { status: 400 });
  }
  const { data, error } = await context.client.from('staff_notes')
    .select('id, entity_type, entity_id, author_id, note, created_at')
    .eq('entity_type', type.data)
    .eq('entity_id', id.data)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to load staff notes' }, { status: 503 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(NOTE_STAFF_ROLES);
  if (response) return response;
  const parsed = z.object({
    entityType,
    entityId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid staff note' }, { status: 400 });
  const { data, error } = await context.client.from('staff_notes').insert({
    entity_type: parsed.data.entityType,
    entity_id: parsed.data.entityId,
    author_id: context.userId,
    note: parsed.data.body,
  }).select('id, entity_type, entity_id, author_id, note, created_at').single();
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('Staff note creation failed', error.code);
    return NextResponse.json({ error: 'Unable to create staff note' }, { status: 503 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
