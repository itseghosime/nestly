export type StaffProfileIdentity = {
  display_name: string;
  role: string;
};

export function getStaffIdentityLabels(
  profile: StaffProfileIdentity | null,
  loaded: boolean,
) {
  const displayName = profile?.display_name.trim() || (loaded ? 'Identity unavailable' : 'Loading identity…');
  const role = profile?.role.trim() || (loaded ? 'Staff profile unavailable' : 'Loading profile…');
  const initials = profile?.display_name.trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'ST';

  return { displayName, role, initials };
}
