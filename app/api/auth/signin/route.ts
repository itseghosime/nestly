import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { safeAuthErrorDiagnostic } from '@/lib/backend/auth-errors';

const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const parsed = signInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Valid email and password required' }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });
  if (error) {
    const diagnostic = safeAuthErrorDiagnostic(error);
    console.warn(
      'Staff sign-in rejected',
      process.env.NODE_ENV === 'production' ? { code: diagnostic.code } : diagnostic,
    );
    return NextResponse.json({
      error: 'Sign-in failed. Confirm the account email and check the password. New staff must finish invitation setup; existing staff can use Forgot your password.',
    }, { status: 401 });
  }
  return NextResponse.json({ user: data.user });
}
