import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canManageStaffRole, isStaffRole } from '@/lib/backend/authorization';
import { buildAuthCallbackUrl } from '@/lib/backend/auth-callback-url';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { getStaffInvitationFailure } from '@/lib/backend/staff-invitation-error';

const inviteSchema = z.object({
  email: z.string().trim().email().max(254),
  display_name: z.string().trim().min(1).max(120),
  role: z.string().refine(isStaffRole),
  assigned_zone: z.string().trim().max(160).nullable().optional(),
});

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return NextResponse.json({ error: 'Unable to verify session' }, { status: 401 });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, assigned_zone')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 500 });
  if (!profile || !['Platform Admin', 'Operations Lead'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid invitation details' }, { status: 400 });
  }
  const { email, display_name, role, assigned_zone } = parsed.data;
  const zone = assigned_zone?.trim() || null;

  if (!isStaffRole(role) || !canManageStaffRole(profile.role, role)) {
    return NextResponse.json({ error: 'Not authorized to invite this role' }, { status: 403 });
  }
  if (
    (role !== 'Platform Admin' && !zone)
    || (profile.role === 'Operations Lead' && zone !== profile.assigned_zone)
  ) {
    return NextResponse.json({ error: 'Staff must be assigned to the caller’s exact zone' }, { status: 403 });
  }

  const redirectTo = buildAuthCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL, 'invite');
  if (!redirectTo) return NextResponse.json({ error: 'Staff invitation callback is not configured' }, { status: 503 });

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email.toLowerCase(), {
    redirectTo,
    data: { display_name },
  });
  if (error) {
    const failure = getStaffInvitationFailure(error);
    console.error('Staff invitation rejected by Supabase Auth', error.code || 'unknown');
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const { error: provisionError } = await admin.from('profiles').insert({
    id: data.user.id,
    display_name,
    role,
    capabilities: [],
    assigned_zone: zone,
  });
  if (provisionError) {
    console.error('Invited account profile provisioning failed', provisionError.message);
    return NextResponse.json(
      { error: 'Invitation was sent, but staff profile provisioning failed. Contact a Platform Admin before retrying.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, user: { id: data.user.id, email: data.user.email } }, { status: 201 });
}
