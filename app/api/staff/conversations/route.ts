import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/backend/staff-context';

const CONVERSATION_STAFF_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Customer Care',
  'Legal & Compliance',
] as const;
const modeSchema = z.enum(['AI_ACTIVE', 'HUMAN_ACTIVE', 'CLOSED']);
const channelSchema = z.enum(['website', 'whatsapp', 'telegram']);

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export async function GET(request: Request) {
  const { context, response } = await requireStaff(CONVERSATION_STAFF_ROLES);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const page = Number(params.get('page') || '1');
  const rawMode = params.get('mode');
  const mode = rawMode ? modeSchema.safeParse(rawMode) : null;
  const rawChannel = params.get('channel');
  const channel = rawChannel ? channelSchema.safeParse(rawChannel) : null;
  if (
    !Number.isInteger(page)
    || page < 1
    || page > 1000
    || (mode && !mode.success)
    || (channel && !channel.success)
  ) {
    return NextResponse.json({ error: 'Invalid conversation filter or page' }, { status: 400 });
  }

  let query = context.client.from('conversations')
    .select(
      'id, channel, mode, current_property_id, assigned_staff_id, created_at, updated_at, customer:customers!conversations_customer_id_fkey(display_name, phone, whatsapp_phone), telegram_identity:telegram_identities!conversations_telegram_identity_id_fkey(username), property:properties!conversations_current_property_id_fkey(title, reference)',
      { count: 'exact' },
    )
    .order('updated_at', { ascending: false });
  if (mode?.success) query = query.eq('mode', mode.data);
  if (channel?.success) query = query.eq('channel', channel.data);
  const { data, error, count } = await query.range((page - 1) * 100, page * 100 - 1);
  if (error) {
    console.error('Staff conversation queue query failed', {
      code: error.code || 'unknown',
      message: error.message,
    });
    return NextResponse.json({ error: 'Unable to load conversation queue' }, { status: 503 });
  }

  const rows = data || [];
  const ids = rows.map((row) => row.id);
  const assignedIds = [...new Set(rows.map((row) => row.assigned_staff_id).filter((id): id is string => Boolean(id)))];
  const [messageResult, profileResult] = await Promise.all([
    ids.length
      ? context.client.rpc('get_staff_conversation_previews', { p_conversation_ids: ids })
      : Promise.resolve({ data: [], error: null }),
    assignedIds.length
      ? context.client.from('profiles').select('id, display_name').in('id', assignedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (messageResult.error || profileResult.error) {
    const error = messageResult.error || profileResult.error;
    console.error('Staff conversation preview query failed', {
      code: error?.code || 'unknown',
      message: error?.message || 'unknown',
    });
    return NextResponse.json({ error: 'Unable to load conversation previews' }, { status: 503 });
  }

  const latestMessages = new Map<string, (typeof messageResult.data)[number]>();
  for (const message of messageResult.data || []) {
    if (!latestMessages.has(message.conversation_id)) latestMessages.set(message.conversation_id, message);
  }
  const staffNames = new Map((profileResult.data || []).map((profile) => [profile.id, profile.display_name]));
  return NextResponse.json({
    data: rows.map((row) => {
      const customer = one(row.customer);
      const telegramIdentity = one(row.telegram_identity);
      const property = one(row.property);
      const lastMessage = latestMessages.get(row.id);
      return {
        id: row.id,
        channel: row.channel,
        mode: row.mode,
        customerName: customer?.display_name || 'Customer',
        customerPhone: customer?.phone || customer?.whatsapp_phone || '',
        telegramUsername: telegramIdentity?.username || null,
        propertyTitle: property?.title || 'No property linked',
        propertyReference: property?.reference || null,
        assignedStaff: row.assigned_staff_id
          ? staffNames.get(row.assigned_staff_id) || 'Assigned staff'
          : 'Unassigned',
        lastMessage: lastMessage?.content || 'No messages yet',
        lastSender: lastMessage?.sender_type || null,
        lastTimestamp: lastMessage?.created_at || row.updated_at,
        createdAt: row.created_at,
      };
    }),
    page,
    pageSize: 100,
    total: count || 0,
  });
}
