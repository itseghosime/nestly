import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const COVERAGE_READERS = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'] as const;
const COVERAGE_MANAGERS = ['Platform Admin', 'Operations Lead'] as const;
const coverageSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export async function GET() {
  const { context, response } = await requireStaff(COVERAGE_READERS);
  if (response) return response;
  const { data, error } = await context.client.from('neighborhoods')
    .select('id, name, city, state, active')
    .order('state')
    .order('city')
    .order('name');
  if (error) return NextResponse.json({ error: 'Unable to load coverage areas' }, { status: 503 });
  return NextResponse.json({
    data,
    canManage: COVERAGE_MANAGERS.some((role) => role === context.role),
  });
}

export async function PATCH(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(COVERAGE_MANAGERS);
  if (response) return response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid coverage update' }, { status: 400 });
  }
  const parsed = coverageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid coverage update' }, { status: 400 });
  const { data, error } = await context.client.rpc('update_staff_coverage', {
    p_neighborhood_id: parsed.data.id,
    p_active: parsed.data.active,
  });
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Coverage changes require an operations administrator' }, { status: 403 });
    if (error.code === 'P0002') return NextResponse.json({ error: 'Coverage area not found' }, { status: 404 });
    if (error.code === '22023') return NextResponse.json({ error: 'Invalid coverage update' }, { status: 400 });
    console.error('Coverage update failed', error.code);
    return NextResponse.json({ error: 'Unable to update coverage area' }, { status: 503 });
  }
  const updated = Array.isArray(data) ? data[0] : data;
  if (!updated) return NextResponse.json({ error: 'Unable to update coverage area' }, { status: 503 });
  return NextResponse.json({ data: updated });
}
