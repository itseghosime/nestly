import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/backend/staff-context';

const DASHBOARD_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Legal & Compliance',
  'Customer Care',
] as const;

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export async function GET() {
  const { context, response } = await requireStaff(DASHBOARD_ROLES);
  if (response) return response;

  const now = new Date().toISOString();
  const [queueResult, conversationCount, propertyCount, inspectionCount, slotsResult] = await Promise.all([
    context.client.from('conversations')
      .select(
        'id, updated_at, customer:customers!conversations_customer_id_fkey(display_name), property:properties!conversations_current_property_id_fkey(title)',
        { count: 'exact' },
      )
      .eq('mode', 'HUMAN_ACTIVE')
      .order('updated_at', { ascending: false })
      .limit(3),
    context.client.from('conversations').select('id', { count: 'exact', head: true }).neq('mode', 'CLOSED'),
    context.client.from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('publication_state', 'published'),
    context.client.from('inspections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'CONFIRMED'),
    context.client.from('inspection_slots')
      .select('id, property_id, agent_id, starts_at, ends_at, capacity, inspections(id, status, reservation_expires_at)', { count: 'exact' })
      .eq('is_active', true)
      .gte('starts_at', now)
      .order('starts_at')
      .limit(3),
  ]);

  const errors = [
    queueResult.error,
    conversationCount.error,
    propertyCount.error,
    inspectionCount.error,
    slotsResult.error,
  ].filter((error) => error !== null);
  if (errors.length) {
    console.error('Staff dashboard query failed', errors.map((error) => error.code || 'unknown'));
    return NextResponse.json({ error: 'Unable to load live dashboard data' }, { status: 503 });
  }

  const queue = (queueResult.data || []).map((row) => ({
    id: row.id,
    customerName: one(row.customer)?.display_name || 'Customer',
    propertyTitle: one(row.property)?.title || 'No property linked',
    updatedAt: row.updated_at,
  }));
  const slots = (slotsResult.data || []).map((slot) => ({
    id: slot.id,
    propertyId: slot.property_id,
    agentId: slot.agent_id,
    startsAt: slot.starts_at,
    endsAt: slot.ends_at,
    capacity: slot.capacity,
    reservedCount: (slot.inspections || []).filter((inspection) => (
      inspection.status === 'CONFIRMED'
      || (
        inspection.status === 'PENDING_CONFIRMATION'
        && inspection.reservation_expires_at
        && Date.parse(inspection.reservation_expires_at) > Date.now()
      )
    )).length,
  }));

  return NextResponse.json({
    data: {
      attentionQueueCount: queueResult.count || 0,
      conversationCount: conversationCount.count || 0,
      publishedListingCount: propertyCount.count || 0,
      confirmedInspectionCount: inspectionCount.count || 0,
      upcomingSlotCount: slotsResult.count || 0,
      queue,
      slots,
      capabilities: {
        canManageListings: ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'].includes(context.role),
        canManageInspections: ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'].includes(context.role),
        canExportAudit: ['Platform Admin', 'Operations Lead', 'Legal & Compliance'].includes(context.role),
      },
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
