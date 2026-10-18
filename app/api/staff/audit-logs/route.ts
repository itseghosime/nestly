import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/backend/staff-context';

const AUDIT_ROLES = ['Platform Admin', 'Operations Lead', 'Legal & Compliance'] as const;
const auditQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  category: z.string().trim().max(80).optional(),
  period: z.enum(['24h', '7d', 'month']).default('24h'),
  format: z.enum(['json', 'csv']).default('json'),
});
const PAGE_SIZE = 50;
const EXPORT_LIMIT = 1000;

function periodStart(period: '24h' | '7d' | 'month') {
  const now = new Date();
  if (period === '24h') now.setHours(now.getHours() - 24);
  else if (period === '7d') now.setDate(now.getDate() - 7);
  else now.setDate(1);
  return now.toISOString();
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function safeAuditRows(rows: Array<{
  id: number;
  actor_type: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}>) {
  return rows.map((row) => ({
    id: String(row.id),
    timestamp: row.created_at,
    actor: row.actor_type === 'admin'
      ? 'Platform Admin'
      : row.actor_type === 'system'
        ? 'System process'
        : row.actor_type === 'nia'
          ? 'Nia system'
          : 'Staff member',
    actorType: row.actor_type,
    action: row.action,
    target: `${row.entity_type}${row.entity_id ? ` · ${row.entity_id}` : ''}`,
    category: row.entity_type,
    status: 'Recorded' as const,
    rawPayload: {
      id: String(row.id),
      timestamp: row.created_at,
      actorType: row.actor_type,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
    },
  }));
}

export async function GET(request: Request) {
  const { context, response } = await requireStaff(AUDIT_ROLES);
  if (response) return response;

  const params = new URL(request.url).searchParams;
  const parsed = auditQuery.safeParse({
    page: params.get('page') ?? undefined,
    category: params.get('category') ?? undefined,
    period: params.get('period') ?? undefined,
    format: params.get('format') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid audit filters' }, { status: 400 });
  }

  let query = context.client.from('audit_logs')
    .select('id, actor_type, action, entity_type, entity_id, created_at', { count: 'exact' })
    .gte('created_at', periodStart(parsed.data.period))
    .order('created_at', { ascending: false });
  if (parsed.data.category && parsed.data.category !== 'All') {
    query = query.eq('entity_type', parsed.data.category);
  }
  if (parsed.data.format === 'csv') {
    query = query.limit(EXPORT_LIMIT);
  } else {
    query = query.range((parsed.data.page - 1) * PAGE_SIZE, parsed.data.page * PAGE_SIZE - 1);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error('Staff audit query failed', error.code);
    return NextResponse.json({ error: 'Unable to load audit history' }, { status: 503 });
  }

  const records = safeAuditRows(data || []);
  if (parsed.data.format === 'csv') {
    const lines = [
      ['id', 'timestamp', 'actor_type', 'action', 'entity_type', 'entity_id'].map(csvCell).join(','),
      ...(data || []).map((row) => [
        row.id,
        row.created_at,
        row.actor_type,
        row.action,
        row.entity_type,
        row.entity_id || '',
      ].map(csvCell).join(',')),
    ];
    return new Response(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nestly-audit-redacted.csv"',
        'Cache-Control': 'no-store',
        'X-Total-Count': String(count || 0),
        'X-Export-Truncated': String((count || 0) > EXPORT_LIMIT),
      },
    });
  }

  return NextResponse.json({
    data: records,
    page: parsed.data.page,
    pageSize: PAGE_SIZE,
    total: count || 0,
    redacted: true,
  });
}
