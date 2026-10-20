import { NextResponse } from 'next/server';
import type { StaffContext } from '@/lib/backend/staff-context';
import { CONTACT_STATUSES, LANDLORD_STATUSES, leadUpdateSchema, type LeadKind } from '@/lib/lead-management';

export async function updateStaffLead(request: Request, context: StaffContext, kind: LeadKind) {
  const parsed = leadUpdateSchema.safeParse(await request.json().catch(() => null));
  const allowedStatuses: readonly string[] = kind === 'contact' ? CONTACT_STATUSES : LANDLORD_STATUSES;
  if (!parsed.success || !allowedStatuses.includes(parsed.data.status) || parsed.data.status === 'new') {
    return NextResponse.json({ error: 'A valid status and the last loaded revision are required' }, { status: 400 });
  }
  const table = kind === 'contact' ? 'contact_enquiries' : 'landlord_submissions';
  const fields = 'id, status, updated_at';
  // A staff-session query preserves the linked project's existing row/zone policies.
  const { data: current, error: readError } = await context.client.from(table)
    .select(fields).eq('id', parsed.data.id).maybeSingle();
  if (readError) return NextResponse.json({ error: 'Unable to verify the current lead status' }, { status: 503 });
  if (!current) return NextResponse.json({ error: 'Lead not found or inaccessible' }, { status: 404 });
  // Retrying a request after a lost response is safe when its desired state already persisted.
  if (current.status === parsed.data.status) {
    return NextResponse.json({ data: current }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (new Date(current.updated_at).getTime() !== new Date(parsed.data.expectedUpdatedAt).getTime()) {
    return NextResponse.json({ error: 'This lead changed. Refresh before updating its status.' }, { status: 409 });
  }
  const { data, error } = await context.client.from(table)
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id).eq('updated_at', current.updated_at)
    .select(fields).maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to save the lead status' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'The lead changed or your write access is unavailable. Refresh before retrying.' }, { status: 409 });
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}
