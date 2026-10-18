import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertSameOrigin } from '@/lib/backend/public-request';
export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Sign-out failed', error.code || 'unknown');
    return NextResponse.json({ error: 'Unable to sign out' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
