import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeTotal, formatPrice, type FeeRow } from '@/lib/price';
import { canPublishProperty } from '@/lib/backend/authorization';
import { isUnauthenticatedAuthError } from '@/lib/backend/auth-errors';
import {
  promoteListingMediaToPublic,
  signPropertyMedia,
  type PropertyMediaStorageRow,
} from '@/lib/backend/media-url';
import { assertSameOrigin } from '@/lib/backend/public-request';

const PROPERTY_STAFF_ROLES = ['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance'];
type PropertyMediaRecord = PropertyMediaStorageRow & { id: string; sort_order: number };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && !isUnauthenticatedAuthError(authError)) {
    return NextResponse.json({ error: 'Unable to verify session' }, { status: 401 });
  }
  let role: string | null = null;
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: 'Unable to verify staff access' }, { status: 500 });
    role = profile?.role || null;
  }
  const isStaff = role != null && PROPERTY_STAFF_ROLES.includes(role);
  const { data, error } = await supabase
    .from(isStaff ? 'properties' : 'public_properties')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [feesRes, mediaRes] = await Promise.all([
    supabase.from('property_fees').select('*').eq('property_id', id).order('sort_order'),
    supabase.from('property_media').select('*').eq('property_id', id).is('deleted_at', null).order('sort_order'),
  ]);
  if (feesRes.error || mediaRes.error) {
    return NextResponse.json({ error: 'Unable to load property fees or media' }, { status: 500 });
  }
  const fees = feesRes.data || [];
  const media = (mediaRes.data || []) as PropertyMediaRecord[];
  const signedMedia = await signPropertyMedia(media, supabase);
  if (signedMedia.error) {
    console.error('Property media signing failed', signedMedia.error);
    return NextResponse.json({ error: 'Unable to load property media' }, { status: 500 });
  }
  if (signedMedia.missingMediaCount) {
    console.warn('Omitted missing property media objects', { count: signedMedia.missingMediaCount });
  }
  const typedFees = fees as FeeRow[];
  const unconfirmed = typedFees.filter((fee) => fee.required && !fee.confirmed_at);
  const rentAnnual = Number(data.rent_annual ?? 0);
  const computedTotal = computeTotal(rentAnnual, typedFees);
  const signedMediaById = new Map(signedMedia.rows.map((item) => [item.id, item]));
  const galleryImages = signedMedia.rows.map((item) => item.delivery_url || item.url);
  const featuredMedia = media.find((item) => (
    item.url === data.featured_image
    || item.object_path === data.featured_image
    || `${item.bucket_id}/${item.object_path}` === data.featured_image
  ));
  const signedFeaturedMedia = featuredMedia ? signedMediaById.get(featuredMedia.id) : undefined;
  const featuredImage = featuredMedia
    ? signedFeaturedMedia
      ? signedFeaturedMedia.delivery_url || signedFeaturedMedia.url
      : galleryImages[0] || ''
    : data.featured_image || galleryImages[0] || '';
  const mapped: Record<string, unknown> = {
    ...data,
    propertyType: data.property_type,
    priceAnnual: rentAnnual,
    priceFormatted: data.price_formatted || formatPrice(rentAnnual, data.currency || 'NGN'),
    addressShort: data.address_short,
    powerRating: data.power_rating,
    waterSupply: data.water_supply,
    securityRating: data.security_rating,
    verificationBadge: data.verification_state === 'verified' ? 'Verified Physical Title' : data.verification_state === 'vetted' ? 'Vetted Landlord' : 'Verification status not provided',
    inspectionStatus: 'Availability not listed',
    featuredImage,
    galleryImages,
    features: data.features,
    nearbyLandmarks: data.nearby_landmarks,
    fees,
    media: signedMedia.rows,
    computedTotal,
    unconfirmedFeeCount: unconfirmed.length + (fees.length === 0 ? 1 : 0),
  };
  if (!isStaff) {
    delete mapped.landlord_contact;
    delete mapped.landlordContact;
  }
  else mapped.landlordContact = data.landlord_contact;
  return NextResponse.json({ data: mapped });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Unable to verify staff access' }, { status: 500 });
  if (!profile || !['Platform Admin','Operations Lead','Field Vetting Agent'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { data: current, error: currentError } = await supabase
    .from('properties')
    .select('verification_state, rental_availability')
    .eq('id', id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: 'Unable to load property' }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const nextVerification = body.verification_state ?? current.verification_state;
  if (
    body.verification_state !== undefined
    && !['Platform Admin', 'Operations Lead', 'Field Vetting Agent'].includes(profile.role)
  ) {
    return NextResponse.json({ error: 'Not authorized to change verification state' }, { status: 403 });
  }
  if (
    body.publication_state !== undefined
    && !['draft', 'review', 'published', 'archived'].includes(body.publication_state)
  ) {
    return NextResponse.json({ error: 'Invalid publication state' }, { status: 400 });
  }
  if (
    body.rental_availability !== undefined
    && !['unknown', 'available', 'unavailable', 'rented'].includes(body.rental_availability)
  ) {
    return NextResponse.json({ error: 'Invalid rental availability' }, { status: 400 });
  }
  if (
    body.verification_state !== undefined
    && !['unverified', 'pending', 'vetted', 'verified', 'rejected'].includes(body.verification_state)
  ) {
    return NextResponse.json({ error: 'Invalid verification state' }, { status: 400 });
  }
  if (body.publication_state === 'published' && !canPublishProperty(profile.role, nextVerification)) {
    return NextResponse.json({ error: 'Publishing requires authorized staff and a vetted property' }, { status: 403 });
  }
  if (
    body.publication_state === 'published'
    && (body.rental_availability ?? current.rental_availability) !== 'available'
  ) {
    return NextResponse.json({ error: 'Publishing requires the property to be available for rent' }, { status: 400 });
  }
  if (
    body.publication_state !== undefined
    && body.publication_state !== 'review'
    && !['Platform Admin', 'Operations Lead'].includes(profile.role)
  ) {
    return NextResponse.json({ error: 'Only an Operations Lead or Platform Admin may change publication state' }, { status: 403 });
  }
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    title: 'title', tagline: 'tagline', propertyType: 'property_type', property_type: 'property_type',
    rent_annual: 'rent_annual', rentAnnual: 'rent_annual', currency: 'currency',
    state: 'state', city: 'city', neighborhood: 'neighborhood',
    addressShort: 'address_short', address_short: 'address_short',
    bedrooms: 'bedrooms', bathrooms: 'bathrooms', toilets: 'toilets',
    powerRating: 'power_rating', power_rating: 'power_rating',
    waterSupply: 'water_supply', water_supply: 'water_supply',
    securityRating: 'security_rating', security_rating: 'security_rating',
    verification_state: 'verification_state', publication_state: 'publication_state', rental_availability: 'rental_availability',
    featuredImage: 'featured_image', featured_image: 'featured_image',
    description: 'description', features: 'features',
    nearbyLandmarks: 'nearby_landmarks', nearby_landmarks: 'nearby_landmarks',
    landlordContact: 'landlord_contact', landlord_contact: 'landlord_contact',
  };
  for (const [k, v] of Object.entries(body)) {
    if (k === 'fees' || k === 'media' || k === 'computedTotal' || k === 'unconfirmedFeeCount') continue;
    const col = map[k];
    if (col) patch[col] = v;
    else return NextResponse.json({ error: `Field is not editable: ${k}` }, { status: 400 });
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'No updatable fields' }, { status: 400 });
  if (body.publication_state === 'published') {
    const promotionError = await promoteListingMediaToPublic(id);
    if (promotionError) {
      return NextResponse.json({ error: promotionError }, { status: 503 });
    }
  }
  const { data, error } = await supabase.from('properties').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Unable to verify staff access' }, { status: 500 });
  if (!profile || !['Platform Admin','Operations Lead'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { data, error } = await supabase.from('properties')
    .update({ publication_state: 'archived' })
    .eq('id', id)
    .select('id, publication_state')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data });
}
