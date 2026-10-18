'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthCallbackClient } from '@/lib/supabase/client';
import { completeAuthCallback } from '@/lib/backend/auth-callback';

export default function AuthCallbackPage() {
  const router = useRouter();
  const callbackPromise = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    let active = true;
    if (!callbackPromise.current) {
      const currentUrl = new URL(window.location.href);
      callbackPromise.current = completeAuthCallback(
        createAuthCallbackClient().auth,
        currentUrl.searchParams,
        currentUrl.hash,
      );
    }

    void callbackPromise.current.then((destination) => {
      if (!active) return;
      window.history.replaceState(null, '', window.location.pathname);
      router.replace(destination || '/staff/signin?error=invalid_auth_link');
    }).catch(() => {
      if (!active) return;
      window.history.replaceState(null, '', window.location.pathname);
      router.replace('/staff/signin?error=invalid_auth_link');
    });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4 py-16">
      <section className="w-full rounded-2xl border border-hairline bg-white p-8 text-center shadow-sm" role="status" aria-live="polite">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-hairline border-t-primary" aria-hidden="true" />
        <h1 className="font-headline text-xl font-bold text-charcoal">Verifying your secure staff link</h1>
        <p className="mt-2 text-sm text-muted-ink">Please wait while we confirm your account.</p>
      </section>
    </main>
  );
}
