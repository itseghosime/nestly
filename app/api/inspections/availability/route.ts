import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const propertyIdSchema = z.string().uuid();

export async function GET(request: Request) {
  const propertyId = new URL(request.url).searchParams.get('property_id');
  if (!propertyIdSchema.safeParse(propertyId).success) {
    return NextResponse.json({ error: 'A valid property_id is required' }, { status: 400 });
  }

  const client = await createClient();
  const { data, error } = await client.from('public_inspection_slots')
    .select('id, property_id, starts_at, ends_at, spaces_remaining')
    .eq('property_id', propertyId)
    .order('starts_at');
  if (error) {
    console.error('Public inspection availability failed', error.code);
    return NextResponse.json({ error: 'Unable to load inspection availability' }, { status: 503 });
  }
  return NextResponse.json({ data }, {
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
