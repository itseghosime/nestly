export const STAFF_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Legal & Compliance',
  'Customer Care',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

const OPERATIONS_LEAD_MANAGEABLE_ROLES: readonly StaffRole[] = [
  'Field Vetting Agent',
  'Legal & Compliance',
  'Customer Care',
];

export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && STAFF_ROLES.includes(role as StaffRole);
}

export function zoneMatchesProperty(
  assignedZone: string | null | undefined,
  property: {
    state?: string | null;
    city?: string | null;
    neighborhood?: string | null;
    location?: string | null;
  },
): boolean {
  if (!assignedZone?.trim()) return false;
  const zone = assignedZone.trim().toLocaleLowerCase('en');
  return [property.state, property.city, property.neighborhood, property.location].some(
    (value) => typeof value === 'string' && value.trim().toLocaleLowerCase('en') === zone,
  );
}

export function canManageStaffRole(actorRole: unknown, targetRole: unknown): boolean {
  if (actorRole === 'Platform Admin') return isStaffRole(targetRole);
  return actorRole === 'Operations Lead'
    && isStaffRole(targetRole)
    && OPERATIONS_LEAD_MANAGEABLE_ROLES.includes(targetRole);
}

export function canPublishProperty(
  actorRole: unknown,
  verificationState: string,
): boolean {
  return (actorRole === 'Platform Admin' || actorRole === 'Operations Lead')
    && (verificationState === 'vetted' || verificationState === 'verified');
}

export function isPubliclyDiscoverableProperty(property: {
  publication_state: string;
  rental_availability: string;
  verification_state: string;
}): boolean {
  return property.publication_state === 'published'
    && property.rental_availability === 'available'
    && (property.verification_state === 'vetted' || property.verification_state === 'verified');
}
