import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StaffRole } from '@/lib/backend/authorization';
import { completeAuthCallback } from '@/lib/backend/auth-callback';

const authRuntime = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => authRuntime.createServerClient(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => authRuntime.createAdminClient(),
}));

import { POST as acceptInvitation } from '@/app/api/auth/accept-invitation/route';
import { POST as inviteStaff } from '@/app/api/auth/invite/route';
import { POST as signInRoute } from '@/app/api/auth/signin/route';
import { POST as signOut } from '@/app/api/auth/signout/route';
import { POST as resetPassword } from '@/app/api/auth/reset/route';
import { POST as changePassword } from '@/app/api/auth/change-password/route';
import { PATCH as updateStaffProfile } from '@/app/api/staff/profile/route';

type TestTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};
type TestDatabase = {
  public: {
    Tables: Record<string, TestTable>;
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
type LocalClient = SupabaseClient<TestDatabase>;
type TestIdentity = {
  id: string;
  email: string;
  password: string;
  role: StaffRole | null;
  cookies: Map<string, string>;
};

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
function isLoopback(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}
const localTestReady = Boolean(anonKey && serviceRoleKey && isLoopback(url));
const localAuth = describe.skipIf(!localTestReady);
const siteUrl = 'http://127.0.0.1:3000';
const suffix = crypto.randomUUID();
const createdUserIds: string[] = [];
let admin: LocalClient | null = null;
let activeCookies = new Map<string, string>();

function requireValue(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required for isolated Auth tests`);
  return value;
}

function testAdmin(): LocalClient {
  if (!admin) throw new Error('Isolated Auth setup has not completed');
  return admin;
}

function createCookieClient(cookies = activeCookies): LocalClient {
  return createServerClient<TestDatabase>(
    requireValue(url, 'SUPABASE_TEST_URL'),
    requireValue(anonKey, 'SUPABASE_TEST_ANON_KEY'),
    {
      cookies: {
        getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            if (options.maxAge === 0) cookies.delete(name);
            else cookies.set(name, value);
          }
        },
      },
    },
  );
}

async function createIdentity(
  label: string,
  role: StaffRole | null,
  assignedZone: string | null,
): Promise<TestIdentity> {
  const email = `auth-${label}-${suffix}@example.test`;
  const password = `Initial-${label}-42!`;
  const { data, error } = await testAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Unable to create isolated ${label} account`);
  createdUserIds.push(data.user.id);

  if (role) {
    const { error: profileError } = await testAdmin().from('profiles').insert({
      id: data.user.id,
      display_name: `Synthetic ${label}`,
      role,
      capabilities: [],
      assigned_zone: assignedZone,
    });
    if (profileError) throw new Error(`Unable to create isolated ${label} staff profile`);
  }

  return { id: data.user.id, email, password, role, cookies: new Map() };
}

async function signIn(identity: TestIdentity): Promise<void> {
  activeCookies = identity.cookies;
  const { error } = await createCookieClient().auth.signInWithPassword({
    email: identity.email,
    password: identity.password,
  });
  if (error) throw new Error('Unable to sign in isolated Auth identity');
}

function sameOriginHeaders(): HeadersInit {
  return { origin: siteUrl, 'content-type': 'application/json' };
}

function jsonRequest(path: string, body: unknown, method = 'POST'): Request {
  return new Request(`${siteUrl}${path}`, {
    method,
    headers: sameOriginHeaders(),
    body: JSON.stringify(body),
  });
}

async function createAuthLink(
  type: 'invite' | 'recovery',
  identity: TestIdentity,
  nextPath: string,
): Promise<{ actionLink: string; tokenHash: string }> {
  const { data, error } = await testAdmin().auth.admin.generateLink({
    type,
    email: identity.email,
    options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(nextPath)}` },
  });
  if (error || !data.user || !data.properties.hashed_token || !data.properties.action_link) {
    throw new Error(`Unable to generate isolated ${type} link`);
  }
  return { actionLink: data.properties.action_link, tokenHash: data.properties.hashed_token };
}

async function followAuthLink(actionLink: string): Promise<URL> {
  const response = await fetch(actionLink, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location) throw new Error('Isolated Auth link did not redirect');
  const target = new URL(location);
  if (target.origin !== new URL(siteUrl).origin) {
    throw new Error('Isolated Auth link redirected outside the expected local site');
  }
  return target;
}

localAuth('isolated local staff Auth flows', () => {
  beforeAll(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', siteUrl);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', requireValue(url, 'SUPABASE_TEST_URL'));
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', requireValue(anonKey, 'SUPABASE_TEST_ANON_KEY'));
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', requireValue(serviceRoleKey, 'SUPABASE_TEST_SERVICE_ROLE_KEY'));
    admin = createClient<TestDatabase>(
      requireValue(url, 'SUPABASE_TEST_URL'),
      requireValue(serviceRoleKey, 'SUPABASE_TEST_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    authRuntime.createAdminClient.mockImplementation(testAdmin);
    authRuntime.createServerClient.mockImplementation(() => createCookieClient());
  }, 60_000);

  afterAll(async () => {
    if (admin && createdUserIds.length) {
      for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
    }
    admin = null;
    vi.unstubAllEnvs();
  }, 60_000);

  it('rejects unauthenticated and insufficiently authorized staff invitations', async () => {
    const operationsLead = await createIdentity('ops', 'Operations Lead', 'Benin City');
    const fieldAgent = await createIdentity('field', 'Field Vetting Agent', 'Benin City');
    const ordinary = await createIdentity('ordinary', null, null);
    const invitation = {
      email: `target-${suffix}@example.test`,
      display_name: 'Synthetic Invite Target',
      role: 'Customer Care',
      assigned_zone: 'Benin City',
    };

    activeCookies = new Map();
    const unauthenticated = await inviteStaff(jsonRequest('/api/auth/invite', invitation));
    expect(unauthenticated.status).toBe(401);

    await signIn(fieldAgent);
    const agentResponse = await inviteStaff(jsonRequest('/api/auth/invite', invitation));
    expect(agentResponse.status).toBe(403);

    await signIn(operationsLead);
    for (const restrictedRole of ['Platform Admin', 'Operations Lead']) {
      const response = await inviteStaff(jsonRequest('/api/auth/invite', {
        ...invitation,
        role: restrictedRole,
        assigned_zone: null,
      }));
      expect(response.status).toBe(403);
    }
    const crossZone = await inviteStaff(jsonRequest('/api/auth/invite', {
      ...invitation,
      assigned_zone: 'Edo',
    }));
    expect(crossZone.status).toBe(403);

    await signIn(ordinary);
    const customerResponse = await inviteStaff(jsonRequest('/api/auth/invite', invitation));
    expect(customerResponse.status).toBe(403);
  });

  it('allows a trusted Platform Admin to provision a scoped invitation without self-promotion', async () => {
    const platformAdmin = await createIdentity('admin', 'Platform Admin', null);
    await signIn(platformAdmin);
    const email = `invited-${suffix}@example.test`;
    const inviteSpy = vi.spyOn(testAdmin().auth.admin, 'inviteUserByEmail')
      .mockImplementation(async (targetEmail, options) => {
        const { data, error } = await testAdmin().auth.admin.generateLink({
          type: 'invite',
          email: targetEmail,
          options,
        });
        if (error) return { data: { user: null }, error };
        if (!data.user) throw new Error('Local Auth did not create the invite test user');
        createdUserIds.push(data.user.id);
        return { data: { user: data.user }, error: null };
      });
    let response: Response;
    try {
      response = await inviteStaff(jsonRequest('/api/auth/invite', {
        email,
        display_name: 'Synthetic Invited Staff',
        role: 'Customer Care',
        assigned_zone: 'Benin City',
      }));
    } finally {
      inviteSpy.mockRestore();
    }
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.user.email).toBe(email);

    const { data: profile, error } = await testAdmin().from('profiles')
      .select('role, capabilities, assigned_zone')
      .eq('id', body.user.id)
      .single();
    expect(error).toBeNull();
    expect(profile).toMatchObject({
      role: 'Customer Care',
      capabilities: [],
      assigned_zone: 'Benin City',
    });

    const { error: selfPromotionError } = await createCookieClient().from('profiles')
      .update({ role: 'Platform Admin' }).eq('id', platformAdmin.id);
    expect(selfPromotionError).not.toBeNull();
    const { data: unchanged } = await testAdmin().from('profiles')
      .select('role').eq('id', platformAdmin.id).single();
    expect(unchanged?.role).toBe('Platform Admin');
  });

  it('exchanges a one-time invitation, sets a password, signs in/out, and preserves the invited role', async () => {
    const email = `auth-accepted-invite-${suffix}@example.test`;
    const { data: inviteLink, error: inviteLinkError } = await testAdmin().auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${siteUrl}/auth/callback?next=%2Fstaff%2Faccept-invitation` },
    });
    if (inviteLinkError || !inviteLink.user || !inviteLink.properties.hashed_token) {
      throw new Error(`Unable to generate isolated invite link (${inviteLinkError?.code || 'missing token'})`);
    }
    const invitee: TestIdentity = {
      id: inviteLink.user.id,
      email,
      password: 'Unused-Invite-Password-42!',
      role: null,
      cookies: new Map(),
    };
    createdUserIds.push(invitee.id);
    const { error: provisionError } = await testAdmin().from('profiles').insert({
      id: invitee.id,
      display_name: 'Synthetic Accepted Invite',
      role: 'Customer Care',
      capabilities: [],
      assigned_zone: 'Benin City',
    });
    expect(provisionError).toBeNull();

    activeCookies = invitee.cookies;
    const inviteRedirect = await followAuthLink(inviteLink.properties.action_link);
    const inviteDestination = await completeAuthCallback(
      createCookieClient().auth,
      inviteRedirect.searchParams,
      inviteRedirect.hash,
    );
    expect(inviteDestination).toBe('/staff/accept-invitation');
    const callbackUser = await createCookieClient().auth.getUser();
    expect(callbackUser.data.user?.id).toBe(invitee.id);

    const newPassword = 'Accepted-Invite-42!';
    const acceptance = await acceptInvitation(jsonRequest('/api/auth/accept-invitation', {
      type: 'invite',
      password: newPassword,
      display_name: 'Synthetic Accepted Invite',
    }));
    expect(acceptance.status).toBe(200);

    const { error: roleEscalationError } = await createCookieClient().from('profiles')
      .update({ role: 'Platform Admin' }).eq('id', invitee.id);
    expect(roleEscalationError).not.toBeNull();
    const { data: acceptedProfile } = await testAdmin().from('profiles')
      .select('role').eq('id', invitee.id).single();
    expect(acceptedProfile?.role).toBe('Customer Care');

    const signedOut = await signOut(jsonRequest('/api/auth/signout', {}));
    expect(signedOut.status).toBe(200);
    expect((await createCookieClient().auth.getSession()).data.session).toBeNull();

    const apiSignIn = await signInRoute(jsonRequest('/api/auth/signin', {
      email: invitee.email,
      password: newPassword,
    }));
    expect(apiSignIn.status).toBe(200);
    expect((await createCookieClient().auth.getUser()).data.user?.id).toBe(invitee.id);
    expect((await signOut(jsonRequest('/api/auth/signout', {}))).status).toBe(200);
    expect((await createCookieClient().auth.getSession()).data.session).toBeNull();

    activeCookies = new Map();
    const replayRedirect = await followAuthLink(inviteLink.properties.action_link);
    const replay = await completeAuthCallback(
      createCookieClient().auth,
      replayRedirect.searchParams,
      replayRedirect.hash,
    );
    expect(replay).toBeNull();
  });

  it('uses the recovery callback session to reset the password and rejects a reused link', async () => {
    const identity = await createIdentity('recovery', 'Customer Care', 'Benin City');
    const recoveryLink = await createAuthLink('recovery', identity, '/staff/reset-password');
    activeCookies = identity.cookies;

    const recoveryRedirect = await followAuthLink(recoveryLink.actionLink);
    const recoveryDestination = await completeAuthCallback(
      createCookieClient().auth,
      recoveryRedirect.searchParams,
      recoveryRedirect.hash,
    );
    expect(recoveryDestination).toBe('/staff/reset-password');

    const newPassword = 'Recovered-Password-42!';
    const reset = await resetPassword(jsonRequest('/api/auth/reset', {
      type: 'recovery',
      password: newPassword,
    }));
    expect(reset.status).toBe(200);
    expect((await signOut(jsonRequest('/api/auth/signout', {}))).status).toBe(200);

    const apiSignIn = await signInRoute(jsonRequest('/api/auth/signin', {
      email: identity.email,
      password: newPassword,
    }));
    expect(apiSignIn.status).toBe(200);
    expect((await createCookieClient().auth.getUser()).data.user?.id).toBe(identity.id);
    expect((await signOut(jsonRequest('/api/auth/signout', {}))).status).toBe(200);
    const oldPasswordSignIn = await signInRoute(jsonRequest('/api/auth/signin', {
      email: identity.email,
      password: identity.password,
    }));
    expect(oldPasswordSignIn.status).toBe(401);
    const signInError = await oldPasswordSignIn.json();
    expect(signInError.error).toContain('Confirm the account email');
    expect(signInError.error).toContain('existing staff can use Forgot your password');

    activeCookies = new Map();
    const replayRedirect = await followAuthLink(recoveryLink.actionLink);
    const replay = await completeAuthCallback(
      createCookieClient().auth,
      replayRedirect.searchParams,
      replayRedirect.hash,
    );
    expect(replay).toBeNull();
  });

  it('changes a password only after current-password reauthentication', async () => {
    const identity = await createIdentity('change-password', 'Customer Care', 'Benin City');
    await signIn(identity);

    const rejected = await changePassword(jsonRequest('/api/auth/change-password', {
      currentPassword: 'Wrong-Current-Password-42!',
      newPassword: 'New-Password-42!',
      confirmPassword: 'New-Password-42!',
    }));
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ error: 'Current password could not be verified' });

    const updated = await changePassword(jsonRequest('/api/auth/change-password', {
      currentPassword: identity.password,
      newPassword: 'New-Password-42!',
      confirmPassword: 'New-Password-42!',
    }));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ ok: true });
    expect((await createCookieClient().auth.getUser()).data.user?.id).toBe(identity.id);

    expect((await signOut(jsonRequest('/api/auth/signout', {}))).status).toBe(200);
    expect((await signInRoute(jsonRequest('/api/auth/signin', {
      email: identity.email,
      password: identity.password,
    }))).status).toBe(401);
    expect((await signInRoute(jsonRequest('/api/auth/signin', {
      email: identity.email,
      password: 'New-Password-42!',
    }))).status).toBe(200);
    expect((await createCookieClient().auth.getUser()).data.user?.id).toBe(identity.id);
  });

  it('updates only the signed-in staff member display name', async () => {
    const identity = await createIdentity('profile-update', 'Field Vetting Agent', 'Benin City');

    activeCookies = new Map();
    const unauthenticated = await updateStaffProfile(jsonRequest(
      '/api/staff/profile',
      { displayName: 'Should Not Save' },
      'PATCH',
    ));
    expect(unauthenticated.status).toBe(401);

    await signIn(identity);
    const updated = await updateStaffProfile(jsonRequest(
      '/api/staff/profile',
      {
        displayName: 'Synthetic Updated Name',
        role: 'Platform Admin',
        assignedZone: null,
        capabilities: ['*'],
      },
      'PATCH',
    ));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({
      data: {
        displayName: 'Synthetic Updated Name',
        role: 'Field Vetting Agent',
        assignedZone: 'Benin City',
      },
    });

    const { data: profile, error } = await testAdmin().from('profiles')
      .select('display_name, role, capabilities, assigned_zone')
      .eq('id', identity.id)
      .single();
    expect(error).toBeNull();
    expect(profile).toMatchObject({
      display_name: 'Synthetic Updated Name',
      role: 'Field Vetting Agent',
      assigned_zone: 'Benin City',
      capabilities: [],
    });
  });

  it.skipIf(process.env.SUPABASE_TEST_EXPECT_SHORT_OTP_EXPIRY !== 'true')(
    'rejects a genuinely expired local invitation token',
    async () => {
      const email = `auth-expired-invite-${suffix}@example.test`;
      const { data: link, error: linkError } = await testAdmin().auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: `${siteUrl}/auth/callback?next=%2Fstaff%2Faccept-invitation` },
      });
      if (linkError || !link.user || !link.properties.hashed_token) {
        throw new Error(`Unable to generate isolated expiring invite link (${linkError?.code || 'missing token'})`);
      }
      const identity: TestIdentity = {
        id: link.user.id,
        email,
        password: 'Unused-Expired-Password-42!',
        role: null,
        cookies: new Map(),
      };
      createdUserIds.push(identity.id);
      const { error: profileError } = await testAdmin().from('profiles').insert({
        id: identity.id,
        display_name: 'Synthetic Expired Invite',
        role: 'Customer Care',
        capabilities: [],
        assigned_zone: 'Benin City',
      });
      expect(profileError).toBeNull();
      const actionLink = link.properties.action_link;
      await new Promise((resolve) => setTimeout(resolve, 6_000));

      activeCookies = new Map();
      const expiredRedirect = await followAuthLink(actionLink);
      const expired = await completeAuthCallback(
        createCookieClient().auth,
        expiredRedirect.searchParams,
        expiredRedirect.hash,
      );
      expect(expired).toBeNull();
    },
    15_000,
  );
});
