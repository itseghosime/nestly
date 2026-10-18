import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin } from '@/lib/backend/public-request';

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
    return NextResponse.json({ error: 'Password must be between 8 and 128 characters' }, { status: 400 });
  }
  if (body.type != null && body.type !== 'recovery') {
    return NextResponse.json({ error: 'Invalid recovery token type' }, { status: 400 });
  }

  const supabase = await createClient();
  if (body.token_hash != null) {
    if (typeof body.token_hash !== 'string' || !body.token_hash) {
      return NextResponse.json({ error: 'Invalid recovery token' }, { status: 400 });
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: body.token_hash,
      type: 'recovery',
    });
    if (verifyError) return NextResponse.json({ error: 'Recovery token is invalid or expired' }, { status: 400 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return NextResponse.json({ error: 'Unable to verify recovery session' }, { status: 401 });
  if (!user) return NextResponse.json({ error: 'Not authenticated or token expired' }, { status: 401 });

  const { error } = await supabase.auth.updateUser({ password: body.password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
