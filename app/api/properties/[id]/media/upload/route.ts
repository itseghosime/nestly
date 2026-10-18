import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertSameOrigin } from '@/lib/backend/public-request';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id: propertyId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profileError || !profile || !['Platform Admin','Operations Lead','Field Vetting Agent'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 5MB' }, { status: 400 });
  const allowed = ['image/jpeg','image/png','image/webp','image/jpg'];
  if (!allowed.includes(file.type)) return NextResponse.json({ error: 'Only jpg/png/webp allowed' }, { status: 400 });
  const requestedKind = form?.get('kind');
  if (requestedKind !== null && requestedKind !== 'listing' && requestedKind !== 'evidence') {
    return NextResponse.json({ error: 'kind must be listing or evidence' }, { status: 400 });
  }
  const mediaKind = requestedKind === 'evidence' ? 'evidence' : 'listing';
  const { data: prop, error: propertyError } = await supabase.from('properties').select('publication_state, verification_state, rental_availability').eq('id', propertyId).single();
  if (propertyError || !prop) return NextResponse.json({ error: 'Property not found or outside your assigned zone' }, { status: 404 });
  const isPublished = prop.publication_state === 'published'
    && ['vetted', 'verified'].includes(prop.verification_state)
    && prop.rental_availability === 'available';
  const bucket = isPublished && mediaKind === 'listing' ? 'property-media' : 'property-drafts';
  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = extensionByMime[file.type];
  const path = `${propertyId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(bucket).upload(path, buf, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: media, error: mediaErr } = await supabase.from('property_media').insert({
    property_id: propertyId,
    url: `${bucket}/${path}`,
    bucket_id: bucket,
    object_path: path,
    media_kind: mediaKind,
    sort_order: 0,
  }).select().single();
  if (mediaErr) {
    const { error: cleanupError } = await admin.storage.from(bucket).remove([path]);
    if (cleanupError) console.error('Media upload cleanup failed', cleanupError.message);
    return NextResponse.json({ error: mediaErr.message }, { status: 500 });
  }
  return NextResponse.json({ data: media, bucket, path }, { status: 201 });
}
