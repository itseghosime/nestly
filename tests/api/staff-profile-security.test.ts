import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  createAuthClient: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  requireStaff: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: runtime.createAuthClient,
}));

vi.mock('@/lib/backend/staff-context', () => ({
  requireStaff: runtime.requireStaff,
}));

import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { PATCH as updateStaffProfile } from '@/app/api/staff/profile/route';

function jsonRequest(path: string, body: unknown, method: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      origin: 'http://localhost:3000',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('staff profile and password APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    runtime.requireStaff.mockResolvedValue({
      context: {
        client: { from: runtime.from },
        userId: 'staff-user-id',
      },
      response: undefined,
    });
    runtime.from.mockReturnValue({ update: runtime.update });
    runtime.update.mockReturnValue({ eq: runtime.eq });
    runtime.eq.mockReturnValue({ select: runtime.select });
    runtime.select.mockReturnValue({ maybeSingle: runtime.maybeSingle });
    runtime.maybeSingle.mockResolvedValue({
      data: {
        display_name: 'Updated Staff',
        role: 'Field Vetting Agent',
        assigned_zone: 'Benin City',
      },
      error: null,
    });

    runtime.createAuthClient.mockResolvedValue({
      auth: {
        getUser: runtime.getUser,
        signInWithPassword: runtime.signInWithPassword,
        updateUser: runtime.updateUser,
      },
    });
    runtime.getUser.mockResolvedValue({
      data: { user: { email: 'staff@example.test' } },
      error: null,
    });
    runtime.signInWithPassword.mockResolvedValue({ error: null });
    runtime.updateUser.mockResolvedValue({ error: null });
  });

  it('persists only display name and returns role and zone as read-only data', async () => {
    const response = await updateStaffProfile(jsonRequest('/api/staff/profile', {
      displayName: 'Updated Staff',
      role: 'Platform Admin',
      assignedZone: null,
      capabilities: ['*'],
    }, 'PATCH'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        displayName: 'Updated Staff',
        role: 'Field Vetting Agent',
        assignedZone: 'Benin City',
      },
    });
    expect(runtime.from).toHaveBeenCalledWith('profiles');
    expect(runtime.update).toHaveBeenCalledWith({ display_name: 'Updated Staff' });
    expect(runtime.eq).toHaveBeenCalledWith('id', 'staff-user-id');
  });

  it('does not update a profile when staff authorization fails', async () => {
    runtime.requireStaff.mockResolvedValueOnce({
      response: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    });

    const response = await updateStaffProfile(jsonRequest('/api/staff/profile', {
      displayName: 'Unauthorized',
    }, 'PATCH'));

    expect(response.status).toBe(403);
    expect(runtime.from).not.toHaveBeenCalled();
  });

  it('rejects password changes without an authenticated account', async () => {
    runtime.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await changePassword(jsonRequest('/api/auth/change-password', {
      currentPassword: 'Current-Password-42!',
      newPassword: 'New-Password-42!',
      confirmPassword: 'New-Password-42!',
    }, 'POST'));

    expect(response.status).toBe(401);
    expect(runtime.signInWithPassword).not.toHaveBeenCalled();
    expect(runtime.updateUser).not.toHaveBeenCalled();
  });

  it('requires current-password reauthentication before updating Auth', async () => {
    runtime.signInWithPassword.mockResolvedValueOnce({
      error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const response = await changePassword(jsonRequest('/api/auth/change-password', {
      currentPassword: 'Wrong-Current-Password-42!',
      newPassword: 'New-Password-42!',
      confirmPassword: 'New-Password-42!',
    }, 'POST'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Current password could not be verified' });
    expect(runtime.updateUser).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it('uses Supabase Auth to update the password after reauthentication', async () => {
    const response = await changePassword(jsonRequest('/api/auth/change-password', {
      currentPassword: 'Current-Password-42!',
      newPassword: 'New-Password-42!',
      confirmPassword: 'New-Password-42!',
    }, 'POST'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(runtime.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@example.test',
      password: 'Current-Password-42!',
    });
    expect(runtime.updateUser).toHaveBeenCalledWith({ password: 'New-Password-42!' });
  });

  it('rejects mismatched password confirmation before Auth calls', async () => {
    const response = await changePassword(jsonRequest('/api/auth/change-password', {
      currentPassword: 'Current-Password-42!',
      newPassword: 'New-Password-42!',
      confirmPassword: 'Different-Password-42!',
    }, 'POST'));

    expect(response.status).toBe(400);
    expect(runtime.getUser).not.toHaveBeenCalled();
    expect(runtime.signInWithPassword).not.toHaveBeenCalled();
    expect(runtime.updateUser).not.toHaveBeenCalled();
  });
});
