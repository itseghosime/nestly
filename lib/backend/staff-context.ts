import { NextResponse } from 'next/server';
import { isStaffRole, type StaffRole } from '@/lib/backend/authorization';
import { isUnauthenticatedAuthError } from '@/lib/backend/auth-errors';
import { createClient } from '@/lib/supabase/server';

export type StaffContext = {
  client: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  role: StaffRole;
};

export async function requireStaff(
  allowedRoles: readonly StaffRole[],
): Promise<{ context: StaffContext; response?: never } | { context?: never; response: NextResponse }> {
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError) {
    if (isUnauthenticatedAuthError(authError)) {
      return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    console.error('Staff session lookup failed', authError.code || 'unknown');
    return { response: NextResponse.json({ error: 'Unable to verify session' }, { status: 503 }) };
  }
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Staff authority profile lookup failed', {
      code: profileError.code || 'unknown',
      message: profileError.message,
    });
    return { response: NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 503 }) };
  }
  if (!profile || !isStaffRole(profile.role) || !allowedRoles.includes(profile.role)) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { context: { client, userId: user.id, role: profile.role } };
}
