import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const NOTE_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance', 'Customer Care'] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(NOTE_STAFF_ROLES);
  if (response) return response;
  const parsed = z.object({ deleted: z.literal(true) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid staff note update' }, { status: 400 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid staff note ID' }, { status: 400 });
  }
  const { data, error } = await context.client.from('staff_notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, deleted_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to delete staff note' }, { status: 403 });
  if (!data) return NextResponse.json({ error: 'Note not found or inaccessible' }, { status: 404 });
  return NextResponse.json({ data });
}
