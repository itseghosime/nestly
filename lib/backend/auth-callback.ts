export type AuthCallbackAuthClient = {
  exchangeCodeForSession(code: string): Promise<{ error: unknown | null }>;
  verifyOtp(input: {
    token_hash: string;
    type: 'invite' | 'recovery';
  }): Promise<{ error: unknown | null }>;
  setSession(input: {
    access_token: string;
    refresh_token: string;
  }): Promise<{ error: unknown | null }>;
  getUser(): Promise<{
    data: { user: { id: string } | null };
    error: unknown | null;
  }>;
};

const CALLBACK_PATHS = {
  invite: '/staff/accept-invitation',
  recovery: '/staff/reset-password',
} as const;

type CallbackType = keyof typeof CALLBACK_PATHS;

function isCallbackType(value: string | null): value is CallbackType {
  return value === 'invite' || value === 'recovery';
}

export async function completeAuthCallback(
  auth: AuthCallbackAuthClient,
  searchParams: URLSearchParams,
  hash: string,
): Promise<string | null> {
  const fragment = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const type = searchParams.get('type') || fragment.get('type');
  if (
    searchParams.has('error')
    || searchParams.has('error_code')
    || searchParams.has('error_description')
    || fragment.has('error')
    || fragment.has('error_code')
    || fragment.has('error_description')
    || (type !== null && !isCallbackType(type))
  ) {
    return null;
  }

  const requestedPath = searchParams.get('next');
  const typedPath = isCallbackType(type) ? CALLBACK_PATHS[type] : null;
  const isCallbackPath = (path: string | null): path is typeof CALLBACK_PATHS[CallbackType] =>
    Object.values(CALLBACK_PATHS).some((callbackPath) => callbackPath === path);
  const destination = typedPath || (isCallbackPath(requestedPath) ? requestedPath : null);
  if (!destination || (typedPath && requestedPath && typedPath !== requestedPath)) return null;

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash') || fragment.get('token_hash');
  if (code) {
    const { error } = await auth.exchangeCodeForSession(code);
    if (error) return null;
  } else if (tokenHash && isCallbackType(type)) {
    const { error } = await auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return null;
  } else {
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    if (!accessToken || !refreshToken || !isCallbackType(type)) return null;
    const { error } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return null;
  }

  const { data, error } = await auth.getUser();
  return !error && data.user ? destination : null;
}
