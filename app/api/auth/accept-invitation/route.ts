import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin } from '@/lib/backend/public-request';

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const body = await request.json().catch(() => null);
  if (
    !body
    || typeof body.password !== 'string'
    || body.password.length < 8
    || body.password.length > 128
    || (body.display_name != null && (typeof body.display_name !== 'string' || body.display_name.trim().length > 120))
  ) {
    return NextResponse.json({ error: 'Valid password and display name are required' }, { status: 400 });
  }
  if (body.type != null && body.type !== 'invite') {
    return NextResponse.json({ error: 'Invalid invitation token type' }, { status: 400 });
  }

  const supabase = await createClient();
  if (body.token_hash != null) {
    if (typeof body.token_hash !== 'string' || !body.token_hash) {
      return NextResponse.json({ error: 'Invalid invitation token' }, { status: 400 });
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: body.token_hash,
      type: 'invite',
    });
    if (verifyError) return NextResponse.json({ error: 'Invitation token is invalid or expired' }, { status: 400 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) return NextResponse.json({ error: 'Unable to verify invitation session' }, { status: 401 });
  if (!user) return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 401 });

  const { data: profile, error: profileReadError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();
  if (profileReadError) return NextResponse.json({ error: 'Unable to verify invited staff profile' }, { status: 500 });
  if (!profile) return NextResponse.json({ error: 'No staff invitation exists for this account' }, { status: 403 });

  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  const { error: passwordError } = await supabase.auth.updateUser({
    password: body.password,
    ...(displayName ? { data: { display_name: displayName } } : {}),
  });
  if (passwordError) return NextResponse.json({ error: passwordError.message }, { status: 400 });

  if (displayName) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', user.id);
    if (updateError) {
      console.error('Invited staff display name update failed', updateError.message);
      return NextResponse.json({ error: 'Password was set, but the staff profile could not be updated' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, user: { id: user.id } });
}
