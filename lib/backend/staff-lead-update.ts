import { NextResponse } from 'next/server';
import type { StaffContext } from '@/lib/backend/staff-context';
import { CONTACT_STATUSES, LANDLORD_STATUSES, leadUpdateSchema, type LeadKind } from '@/lib/lead-management';

export async function updateStaffLead(request: Request, context: StaffContext, kind: LeadKind) {
  const parsed = leadUpdateSchema.safeParse(await request.json().catch(() => null));
  const allowedStatuses: readonly string[] = kind === 'contact' ? CONTACT_STATUSES : LANDLORD_STATUSES;
  if (!parsed.success || !allowedStatuses.includes(parsed.data.status) || parsed.data.status === 'new') {
    return NextResponse.json({ error: 'A valid status and the last loaded revision are required' }, { status: 400 });
  }
  const { data, error } = await context.client.rpc('update_staff_lead_status', {
    p_kind: kind,
    p_lead_id: parsed.data.id,
    p_status: parsed.data.status,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: 'Lead not found or inaccessible' }, { status: 404 });
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (error.code === '40001') return NextResponse.json({ error: 'This lead changed. Refresh before updating its status.' }, { status: 409 });
    if (error.code === '22023') return NextResponse.json({ error: 'A valid status and revision are required' }, { status: 400 });
    console.error('Staff lead status update failed', error.code);
    return NextResponse.json({ error: 'Unable to save the lead status' }, { status: 503 });
  }
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated) return NextResponse.json({ error: 'Unable to confirm the lead status update' }, { status: 503 });
  return NextResponse.json({ data: updated }, { headers: { 'Cache-Control': 'no-store' } });
}
