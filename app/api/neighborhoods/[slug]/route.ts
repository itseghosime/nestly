import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapNeighborhoodRow, type NeighborhoodDatabaseRow } from '@/lib/neighborhoods-api';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const query = supabase.from('neighborhoods').select('*').eq('slug', slug).maybeSingle();
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Unable to load neighborhood guide' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!user && !data.active) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: mapNeighborhoodRow(data as NeighborhoodDatabaseRow) });
}
