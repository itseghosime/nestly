import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isUnauthenticatedAuthError } from '@/lib/backend/auth-errors';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) { try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {} },
      },
    }
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    if (isUnauthenticatedAuthError(authError)) {
      return NextResponse.json({ user: null, profile: null }, { status: 401 });
    }
    console.error('Current user lookup failed', authError.code || 'unknown');
    return NextResponse.json({ error: 'Unable to verify session' }, { status: 503 });
  }
  if (!user) return NextResponse.json({ user: null, profile: null }, { status: 401 });
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, role, capabilities, assigned_zone')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) {
    console.error('Current user profile lookup failed', {
      code: profileError.code || 'unknown',
      message: profileError.message,
    });
    return NextResponse.json({ error: 'Unable to load staff profile' }, { status: 503 });
  }
  return NextResponse.json({
    user: { email: user.email ?? null },
    profile,
  });
}
