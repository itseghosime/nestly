import { describe, expect, it } from 'vitest';
import { getStaffIdentityLabels } from '@/lib/staff-identity';

describe('staff identity labels', () => {
  it('uses the authenticated profile name, role, and initials', () => {
    expect(getStaffIdentityLabels({
      display_name: 'Amina Okafor',
      role: 'Customer Care',
    }, true)).toEqual({
      displayName: 'Amina Okafor',
      role: 'Customer Care',
      initials: 'AO',
    });
  });

  it('uses explicit loading and unavailable labels instead of a fabricated identity', () => {
    expect(getStaffIdentityLabels(null, false)).toEqual({
      displayName: 'Loading identity…',
      role: 'Loading profile…',
      initials: 'ST',
    });
    expect(getStaffIdentityLabels(null, true)).toEqual({
      displayName: 'Identity unavailable',
      role: 'Staff profile unavailable',
      initials: 'ST',
    });
  });
});
