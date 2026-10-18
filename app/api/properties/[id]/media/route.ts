import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { signPropertyMedia, type PropertyMediaStorageRow } from '@/lib/backend/media-url';
import { assertSameOrigin } from '@/lib/backend/public-request';

type MediaRecord = PropertyMediaStorageRow & {
  id: string;
  deleted_at: string | null;
};

async function staffCanEdit(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { authorized: false, error: true };
  return {
    authorized: Boolean(profile && ['Platform Admin', 'Operations Lead', 'Field Vetting Agent'].includes(profile.role)),
    error: false,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('property_media')
    .select('*')
    .eq('property_id', id)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const media = (data || []) as MediaRecord[];
  const signedMedia = await signPropertyMedia(media, supabase);
  if (signedMedia.error) {
    console.error('Property media signing failed', signedMedia.error);
    return NextResponse.json({ error: 'Unable to load property media' }, { status: 500 });
  }
  if (signedMedia.missingMediaCount) {
    console.warn('Omitted missing property media objects', { count: signedMedia.missingMediaCount });
  }

  return NextResponse.json({
    data: signedMedia.rows.map(({ delivery_url, ...item }) => ({ ...item, url: delivery_url || item.url })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const authority = await staffCanEdit(supabase, user.id);
  if (authority.error) return NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 500 });
  if (!authority.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.url !== 'string' || !body.url.startsWith('/images/')) {
    return NextResponse.json({ error: 'Use the authenticated media upload endpoint for uploaded files' }, { status: 400 });
  }
  if (body.caption != null && (typeof body.caption !== 'string' || body.caption.length > 240)) {
    return NextResponse.json({ error: 'caption must be 240 characters or fewer' }, { status: 400 });
  }
  const sortOrder = body.sort_order ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    return NextResponse.json({ error: 'sort_order must be a non-negative integer' }, { status: 400 });
  }

  const { data, error } = await supabase.from('property_media').insert({
    property_id: id,
    url: body.url,
    caption: body.caption || null,
    sort_order: sortOrder,
    media_kind: 'listing',
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const authority = await staffCanEdit(supabase, user.id);
  if (authority.error) return NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 500 });
  if (!authority.authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'media id required' }, { status: 400 });
  }
  const patch: Record<string, string | number | null> = {};
  if (body.sort_order != null) patch.sort_order = body.sort_order;
  if (body.caption !== undefined) patch.caption = body.caption;
  if (body.deleted_at !== undefined) patch.deleted_at = body.deleted_at;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable media fields supplied' }, { status: 400 });
  }
  if (body.sort_order != null && (!Number.isInteger(body.sort_order) || body.sort_order < 0)) {
    return NextResponse.json({ error: 'sort_order must be a non-negative integer' }, { status: 400 });
  }
  if (body.caption != null && (typeof body.caption !== 'string' || body.caption.length > 240)) {
    return NextResponse.json({ error: 'caption must be 240 characters or fewer' }, { status: 400 });
  }
  if (body.deleted_at !== undefined && body.deleted_at !== null && typeof body.deleted_at !== 'string') {
    return NextResponse.json({ error: 'deleted_at must be an ISO timestamp or null' }, { status: 400 });
  }

  const { data, error } = await supabase.from('property_media')
    .update(patch)
    .eq('id', body.id)
    .eq('property_id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
