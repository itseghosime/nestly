import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/backend/staff-context';

const STAFF_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Legal & Compliance',
  'Customer Care',
] as const;
const BROAD_NOTIFICATION_ROLES = ['Platform Admin', 'Operations Lead', 'Customer Care'] as const;
const notificationQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  channel: z.enum(['whatsapp', 'email', 'dashboard']).optional(),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'cancelled']).optional(),
  kind: z.enum(['escalation', 'inspection']).optional(),
});

function notificationTitle(templateKey: string) {
  const titles: Record<string, string> = {
    'human_handoff_requested': 'Human handoff requested',
    'contact-enquiry.new': 'New contact enquiry',
    'landlord-submission.new': 'New landlord submission',
    'offer.pending': 'Offer awaiting review',
    'inspection.pending': 'Inspection request received',
  };
  return titles[templateKey] || templateKey.replace(/[._-]+/g, ' ');
}

function notificationKind(templateKey: string): 'escalation' | 'inspection' | 'listing' | 'system' {
  if (templateKey.includes('handoff')) return 'escalation';
  if (templateKey.includes('inspection')) return 'inspection';
  if (templateKey.includes('landlord') || templateKey.includes('property')) return 'listing';
  return 'system';
}

export async function GET(request: Request) {
  const { context, response } = await requireStaff(STAFF_ROLES);
  if (response) return response;

  const params = new URL(request.url).searchParams;
  const parsed = notificationQuery.safeParse({
    page: params.get('page') ?? undefined,
    channel: params.get('channel') ?? undefined,
    status: params.get('status') ?? undefined,
    kind: params.get('kind') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid notification filters' }, { status: 400 });
  }

  let query = context.client.from('notifications')
    .select('id, conversation_id, inspection_id, channel, template_key, status, attempts, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (!BROAD_NOTIFICATION_ROLES.some((role) => role === context.role)) {
    query = query.eq('recipient', context.userId);
  }
  if (parsed.data.channel) query = query.eq('channel', parsed.data.channel);
  if (parsed.data.status) query = query.eq('status', parsed.data.status);
  if (parsed.data.kind === 'escalation') query = query.eq('template_key', 'human_handoff_requested');
  if (parsed.data.kind === 'inspection') query = query.eq('template_key', 'inspection.pending');

  const { data, error, count } = await query.range(
    (parsed.data.page - 1) * 50,
    parsed.data.page * 50 - 1,
  );
  if (error) {
    console.error('Staff notifications query failed', error.code);
    return NextResponse.json({ error: 'Unable to load notifications' }, { status: 503 });
  }

  return NextResponse.json({
    data: (data || []).map((notification) => ({
      id: notification.id,
      type: notificationKind(notification.template_key),
      title: notificationTitle(notification.template_key),
      badge: notification.template_key,
      description: `Delivery status: ${notification.status}. Attempts: ${notification.attempts}.`,
      createdAt: notification.created_at,
      channel: notification.channel,
      statusText: notification.status,
      href: notification.conversation_id
        ? `/staff/inbox/${notification.conversation_id}`
        : notification.inspection_id
          ? `/staff/inspections/${notification.inspection_id}`
          : null,
    })),
    page: parsed.data.page,
    pageSize: 50,
    total: count || 0,
  });
}
