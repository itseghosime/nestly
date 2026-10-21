import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const settingsSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  defaultInspectionDurationMins: z.number().int().min(15).max(240).multipleOf(15),
  transitBufferMins: z.number().int().min(0).max(240),
  daylightLock: z.boolean(),
  daylightStart: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/),
  daylightEnd: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/),
  retentionDays: z.number().int().min(30).max(3650),
}).refine((value) => value.daylightStart.slice(0, 5) < value.daylightEnd.slice(0, 5), {
  message: 'Daylight start must be earlier than daylight end',
  path: ['daylightEnd'],
});

const WORKSPACE_ADMIN = ['Platform Admin'] as const;
const WORKSPACE_READERS = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;
const WORKSPACE_COLUMNS = 'workspace_name, default_inspection_duration_mins, transit_buffer_mins, daylight_lock, daylight_start, daylight_end, retention_days, updated_at, updated_by';

export async function GET() {
  const { context, response } = await requireStaff(WORKSPACE_READERS);
  if (response) return response;
  const { data, error } = await context.client.from('workspace_settings')
    .select(WORKSPACE_COLUMNS)
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
  const { data, error } = await context.client.rpc('update_staff_workspace_settings', {
    p_workspace_name: parsed.data.workspaceName,
    p_default_inspection_duration_mins: parsed.data.defaultInspectionDurationMins,
    p_transit_buffer_mins: parsed.data.transitBufferMins,
    p_daylight_lock: parsed.data.daylightLock,
    p_daylight_start: parsed.data.daylightStart,
    p_daylight_end: parsed.data.daylightEnd,
    p_retention_days: parsed.data.retentionDays,
  });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Workspace settings require a platform administrator' }, { status: 403 });
    if (error.code === '22023') return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
    console.error('Workspace settings update failed', error.code);
    return NextResponse.json({ error: 'Unable to save workspace settings' }, { status: 503 });
  }
  const settings = Array.isArray(data) ? data[0] : data;
  if (!settings) return NextResponse.json({ error: 'Unable to save workspace settings' }, { status: 503 });
  return NextResponse.json({ data: settings });
}
