import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const settingsSchema = z.object({
  transitBufferMins: z.number().int().min(0).max(240).optional(),
  daylightLock: z.boolean().optional(),
  daylightStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).optional(),
  daylightEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/).optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
}).refine((value) => Object.keys(value).length > 0);

const WORKSPACE_ADMIN = ['Platform Admin'] as const;
const WORKSPACE_READERS = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;

export async function GET() {
  const { context, response } = await requireStaff(WORKSPACE_READERS);
  if (response) return response;
  const { data, error } = await context.client.from('workspace_settings')
    .select('transit_buffer_mins, daylight_lock, daylight_start, daylight_end, retention_days, updated_at, updated_by')
    .eq('id', 1)
    .single();
  if (error) return NextResponse.json({ error: 'Unable to load workspace settings' }, { status: 503 });
  return NextResponse.json({ data });
}

export async function PATCH(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(WORKSPACE_ADMIN);
  if (response) return response;
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
  const { data: current, error: currentError } = await context.client.from('workspace_settings')
    .select('daylight_start, daylight_end')
    .eq('id', 1)
    .single();
  if (currentError) return NextResponse.json({ error: 'Unable to verify current workspace settings' }, { status: 503 });
  const start = parsed.data.daylightStart ?? current.daylight_start;
  const end = parsed.data.daylightEnd ?? current.daylight_end;
  if (start.slice(0, 5) >= end.slice(0, 5)) {
    return NextResponse.json({ error: 'Daylight start must be earlier than daylight end' }, { status: 400 });
  }
  const patch = Object.fromEntries(Object.entries({
    transit_buffer_mins: parsed.data.transitBufferMins,
    daylight_lock: parsed.data.daylightLock,
    daylight_start: parsed.data.daylightStart,
    daylight_end: parsed.data.daylightEnd,
    retention_days: parsed.data.retentionDays,
    updated_at: new Date().toISOString(),
    updated_by: context.userId,
  }).filter(([, value]) => value !== undefined));
  const { data, error } = await context.client.from('workspace_settings')
    .update(patch)
    .eq('id', 1)
    .select('transit_buffer_mins, daylight_lock, daylight_start, daylight_end, retention_days, updated_at, updated_by')
    .single();
  if (error) return NextResponse.json({ error: 'Unable to save workspace settings' }, { status: 503 });
  return NextResponse.json({ data });
}
