import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const MANAGER_ROLES = ['Platform Admin', 'Operations Lead'] as const;
const conversionSchema = z.object({
  propertyType: z.enum(['apartment', 'house', 'duplex', 'studio', 'land', 'commercial']),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(MANAGER_ROLES);
  if (response) return response;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid landlord submission' }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Select a supported property type' }, { status: 400 });
  }
  const parsed = conversionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Select a supported property type' }, { status: 400 });
  }

  const { data, error } = await context.client.rpc('convert_landlord_submission_to_draft', {
    p_submission_id: id,
    p_property_type: parsed.data.propertyType,
  });
  if (error) {
    if (error.code === 'P0002') return NextResponse.json({ error: 'Landlord submission not found or inaccessible' }, { status: 404 });
    if (error.code === '42501') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (error.code === '22023') return NextResponse.json({ error: 'Select a supported property type' }, { status: 400 });
    console.error('Landlord draft conversion failed', error.code);
    return NextResponse.json({ error: 'Unable to create a private property draft' }, { status: 503 });
  }
  const converted = Array.isArray(data) ? data[0] : data;
  if (!converted) return NextResponse.json({ error: 'Unable to confirm the property draft' }, { status: 503 });
  return NextResponse.json({ data: converted }, { status: converted.created ? 201 : 200 });
}
