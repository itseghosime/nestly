import { NextResponse } from 'next/server';
import { z } from 'zod';
import { STAFF_ROLES } from '@/lib/backend/authorization';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { requireStaff } from '@/lib/backend/staff-context';

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export async function PATCH(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { context, response } = await requireStaff(STAFF_ROLES);
  if (response) return response;
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'A valid display name is required' }, { status: 400 });
  }

  const { data, error } = await context.client
    .from('profiles')
    .update({ display_name: parsed.data.displayName })
    .eq('id', context.userId)
    .select('display_name, role, assigned_zone')
    .maybeSingle();

  if (error || !data) {
    console.error('Staff profile update failed', error?.code || 'profile_missing');
    return NextResponse.json({ error: 'Unable to update staff profile' }, { status: 503 });
  }

  return NextResponse.json({
    data: {
      displayName: data.display_name,
      role: data.role,
      assignedZone: data.assigned_zone,
    },
  });
}
