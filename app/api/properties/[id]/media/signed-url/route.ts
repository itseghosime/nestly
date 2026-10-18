import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPubliclyDiscoverableProperty } from '@/lib/backend/authorization';
import { isUnauthenticatedAuthError } from '@/lib/backend/auth-errors';
import { assertSameOrigin } from '@/lib/backend/public-request';

const MEDIA_STAFF_ROLES = [
  'Platform Admin',
  'Operations Lead',
  'Field Vetting Agent',
  'Legal & Compliance',
];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id: propertyId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.media_id !== 'string') {
    return NextResponse.json({ error: 'media_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && !isUnauthenticatedAuthError(authError)) {
    return NextResponse.json({ error: 'Unable to verify session' }, { status: 401 });
  }
  let canManagePrivateMedia = false;
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      return NextResponse.json({ error: 'Unable to verify staff authority' }, { status: 500 });
    }
    canManagePrivateMedia = Boolean(profile && MEDIA_STAFF_ROLES.includes(profile.role));
  }

  const [{ data: property, error: propertyError }, { data: media, error: mediaError }] = await Promise.all([
    supabase
      .from(canManagePrivateMedia ? 'properties' : 'public_properties')
      .select('publication_state, rental_availability, verification_state')
      .eq('id', propertyId)
      .maybeSingle(),
    supabase
      .from('property_media')
      .select('bucket_id, object_path, media_kind')
      .eq('id', body.media_id)
      .eq('property_id', propertyId)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  if (propertyError || mediaError) {
    return NextResponse.json({ error: 'Unable to verify media access' }, { status: 500 });
  }
  if (!property || !media || !media.bucket_id || !media.object_path) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }
  if (
    media.object_path.split('/').length !== 2
    || media.object_path.startsWith('/')
    || media.object_path.split('/')[0] !== propertyId
  ) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }

  const isPublic = (media.bucket_id === 'property-media' || media.bucket_id === 'property-drafts')
    && media.media_kind === 'listing'
    && isPubliclyDiscoverableProperty(property);
  if (!isPublic) {
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canManagePrivateMedia) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  if (
    (media.bucket_id !== 'property-media' && media.bucket_id !== 'property-drafts')
    || (media.media_kind === 'evidence' && media.bucket_id !== 'property-drafts')
  ) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 });
  }

  const admin = createAdminClient();
  const folder = propertyId;
  const fileName = media.object_path.split('/')[1];
  const { data: objects, error: objectError } = await admin.storage
    .from(media.bucket_id)
    .list(folder, { limit: 100, search: fileName });

  if (objectError) {
    console.error('Media object verification failed', objectError.message);
    return NextResponse.json({ error: 'Unable to verify media object' }, { status: 500 });
  }
  if (!objects?.some((object) => object.name === fileName)) {
    return NextResponse.json({ error: 'Media object not found' }, { status: 404 });
  }

  const { data, error } = await admin.storage
    .from(media.bucket_id)
    .createSignedUrl(media.object_path, 3600);
  if (error || !data?.signedUrl) {
    console.error('Media URL signing failed', error?.message || 'No signed URL returned');
    return NextResponse.json({ error: 'Unable to sign media URL' }, { status: 500 });
  }
  return NextResponse.json({ signedUrl: data.signedUrl });
}
