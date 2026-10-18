import { NextResponse } from 'next/server';
import { z } from 'zod';
import { assertSameOrigin } from '@/lib/backend/public-request';
import { safeAuthErrorDiagnostic } from '@/lib/backend/auth-errors';
import { createClient } from '@/lib/supabase/server';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
  confirmPassword: z.string().min(8).max(128),
}).refine((value) => value.newPassword === value.confirmPassword);

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password details are invalid or do not match' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Unable to verify the signed-in account' }, { status: 401 });
  }

  const { error: reauthenticationError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthenticationError) {
    const diagnostic = safeAuthErrorDiagnostic(reauthenticationError);
    console.warn(
      'Staff password reauthentication rejected',
      process.env.NODE_ENV === 'production' ? { code: diagnostic.code } : diagnostic,
    );
    return NextResponse.json({ error: 'Current password could not be verified' }, { status: 401 });
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) {
    const diagnostic = safeAuthErrorDiagnostic(updateError);
    console.error(
      'Staff password update failed',
      process.env.NODE_ENV === 'production' ? { code: diagnostic.code } : diagnostic,
    );
    return NextResponse.json({ error: 'Unable to update password. Try again or use password recovery.' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
