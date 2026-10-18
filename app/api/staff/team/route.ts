import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/backend/staff-context';
import { isStaffRole } from '@/lib/backend/authorization';

const TEAM_MANAGERS = ['Platform Admin', 'Operations Lead'] as const;

export async function GET() {
  const { context, response } = await requireStaff(TEAM_MANAGERS);
  if (response) return response;

  const { data, error } = await context.client
    .from('profiles')
    .select('id, display_name, role, assigned_zone')
    .order('display_name');
  if (error) {
    console.error('Staff team query failed', error.code || 'unknown');
    return NextResponse.json({ error: 'Unable to load staff profiles' }, { status: 503 });
  }
  if (!Array.isArray(data) || data.some((profile) => (
    typeof profile.id !== 'string'
    || typeof profile.display_name !== 'string'
    || !isStaffRole(profile.role)
    || (profile.assigned_zone !== null && typeof profile.assigned_zone !== 'string')
  ))) {
    return NextResponse.json({ error: 'Staff profile data is invalid' }, { status: 503 });
  }

  return NextResponse.json({
    data: data.map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      role: profile.role,
      assignedZone: profile.assigned_zone,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
