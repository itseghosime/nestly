export type AuthCallbackFlow = 'invite' | 'recovery';

const CALLBACK_PATHS: Record<AuthCallbackFlow, string> = {
  invite: '/staff/accept-invitation',
  recovery: '/staff/reset-password',
};

export function getAuthSiteOrigin(siteUrl: string | undefined): URL | null {
  if (!siteUrl) return null;

  try {
    const url = new URL(siteUrl);
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback))
      || url.username
      || url.password
    ) {
      return null;
    }

    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

export function buildAuthCallbackUrl(
  siteUrl: string | undefined,
  flow: AuthCallbackFlow,
): string | null {
  const url = getAuthSiteOrigin(siteUrl);
  if (!url) return null;

  url.pathname = '/auth/callback';
  url.searchParams.set('next', CALLBACK_PATHS[flow]);
  return url.toString();
}
