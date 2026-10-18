import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

import { requireStaff } from '@/lib/backend/staff-context';

const allowedRoles = ['Platform Admin', 'Operations Lead'] as const;

describe('requireStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: mocks.maybeSingle }),
      }),
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'staff-user-id' } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { role: 'Operations Lead' },
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('authorizes an authenticated staff profile with an allowed role', async () => {
    const result = await requireStaff(allowedRoles);

    expect(result.response).toBeUndefined();
    expect(result.context).toMatchObject({
      userId: 'staff-user-id',
      role: 'Operations Lead',
    });
    expect(mocks.from).toHaveBeenCalledWith('profiles');
  });

  it('rejects requests without an authenticated user', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const result = await requireStaff(allowedRoles);

    expect(result.response?.status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('treats the Supabase missing-session error as unauthenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', status: 400 },
    });

    const result = await requireStaff(allowedRoles);

    expect(result.response?.status).toBe(401);
  });

  it('rejects missing or insufficient staff profiles', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { role: 'Customer Care' },
      error: null,
    });

    const result = await requireStaff(allowedRoles);

    expect(result.response?.status).toBe(403);
  });

  it('returns service unavailable and logs only safe metadata when the profile lookup fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.profiles' in the schema cache" },
    });

    const result = await requireStaff(allowedRoles);
    const responseBody = await result.response?.json();

    expect(result.response?.status).toBe(503);
    expect(responseBody).toEqual({ error: 'Unable to verify staff authority' });
    expect(errorLog).toHaveBeenCalledWith('Staff authority profile lookup failed', {
      code: 'PGRST205',
      message: "Could not find the table 'public.profiles' in the schema cache",
    });
  });
});
