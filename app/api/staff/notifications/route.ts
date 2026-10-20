import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
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
const notificationReadUpdate = z.object({
  id: z.string().uuid(),
  isRead: z.boolean(),
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

  const notifications = data || [];
  let readRows: { notification_id: string; read_at: string }[] = [];
  if (notifications.length) {
    const { data: readData, error: readError } = await context.client.from('notification_reads')
      .select('notification_id, read_at')
      .eq('profile_id', context.userId)
      .in('notification_id', notifications.map((notification) => notification.id));
    if (readError) {
      console.error('Staff notification read-state query failed', readError.code);
      return NextResponse.json({ error: 'Unable to load notification read state' }, { status: 503 });
    }
    readRows = readData || [];
  }
  const readAtByNotification = new Map(
    readRows.map((read) => [read.notification_id, read.read_at]),
  );

  return NextResponse.json({
    data: notifications.map((notification) => ({
      id: notification.id,
      type: notificationKind(notification.template_key),
      title: notificationTitle(notification.template_key),
      badge: notification.template_key,
      description: notification.channel === 'dashboard'
        ? 'Saved workspace alert. Read status is personal to your staff account.'
        : `Provider delivery status: ${notification.status}. Attempts: ${notification.attempts}.`,
      createdAt: notification.created_at,
      channel: notification.channel,
      statusText: notification.status,
      isRead: readAtByNotification.has(notification.id),
      readAt: readAtByNotification.get(notification.id) || null,
      href: notification.conversation_id
        ? `/staff/inbox/${notification.conversation_id}`
        : notification.inspection_id
          ? `/staff/inspections/${notification.inspection_id}`
          : null,
    })),
    page: parsed.data.page,
    pageSize: 50,
    total: count || 0,
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(STAFF_ROLES);
  if (response) return response;

  const parsed = notificationReadUpdate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid notification read-state update' }, { status: 400 });
  }

  const { data: notification, error: visibilityError } = await context.client.from('notifications')
    .select('id')
    .eq('id', parsed.data.id)
    .maybeSingle();
  if (visibilityError) {
    if (visibilityError.code === '42501') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error('Staff notification visibility check failed', visibilityError.code);
    return NextResponse.json({ error: 'Unable to verify notification access' }, { status: 503 });
  }
  if (!notification) {
    return NextResponse.json({ error: 'Notification not found or inaccessible' }, { status: 404 });
  }

  if (parsed.data.isRead) {
    const { error: writeError } = await context.client.from('notification_reads').upsert(
      { notification_id: parsed.data.id, profile_id: context.userId },
      { onConflict: 'notification_id,profile_id', ignoreDuplicates: true },
    );
    if (writeError) {
      if (writeError.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      console.error('Staff notification read-state write failed', writeError.code);
      return NextResponse.json({ error: 'Unable to update notification read state' }, { status: 503 });
    }

    const { data: readState, error: readError } = await context.client.from('notification_reads')
      .select('read_at')
      .eq('notification_id', parsed.data.id)
      .eq('profile_id', context.userId)
      .maybeSingle();
    if (readError || !readState) {
      if (readError) console.error('Staff notification read-state confirmation failed', readError.code);
      return NextResponse.json({ error: 'Unable to confirm notification read state' }, { status: 503 });
    }
    return NextResponse.json({
      id: parsed.data.id,
      isRead: true,
      readAt: readState.read_at,
    });
  }

  const { error: deleteError } = await context.client.from('notification_reads')
    .delete()
    .eq('notification_id', parsed.data.id)
    .eq('profile_id', context.userId);
  if (deleteError) {
    if (deleteError.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('Staff notification unread-state update failed', deleteError.code);
    return NextResponse.json({ error: 'Unable to update notification read state' }, { status: 503 });
  }
  return NextResponse.json({
    id: parsed.data.id,
    isRead: false,
    readAt: null,
  });
}
