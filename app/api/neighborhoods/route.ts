import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapNeighborhoodRow, type NeighborhoodDatabaseRow } from '@/lib/neighborhoods-api';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let query = supabase.from('neighborhoods').select('*').order('name');
  if (!user) query = query.eq('active', true);
  if (state && state !== 'all') query = query.eq('state', state);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const mapped = ((data || []) as NeighborhoodDatabaseRow[]).map(mapNeighborhoodRow);
  return NextResponse.json({ data: mapped });
}
