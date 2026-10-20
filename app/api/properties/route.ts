import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeTotal, type FeeRow } from '@/lib/price';
import { STAFF_ROLES } from '@/lib/backend/authorization';
import { isUnauthenticatedAuthError } from '@/lib/backend/auth-errors';
import { signPropertyMedia, type PropertyMediaStorageRow } from '@/lib/backend/media-url';
import { getEffectiveMaxAnnualRent } from '@/lib/backend/property-list-query';
import { assertSameOrigin } from '@/lib/backend/public-request';

type PropertyMediaRecord = PropertyMediaStorageRow & { id: string };

function safeFilterValue(value: string): string {
  return value.replace(/[,%()"]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const staffStatus = url.searchParams.get('staff_status') || 'all';
  if (!['all', 'available', 'in-review', 'draft', 'rented'].includes(staffStatus)) {
    return NextResponse.json({ error: 'Invalid property status filter' }, { status: 400 });
  }
  const location = url.searchParams.get('location') || 'all';
  const beds = url.searchParams.get('beds') || 'all';
  const rawMaxPrice = url.searchParams.get('maxPrice') || url.searchParams.get('max_price');
  const requestedMaxPrice = rawMaxPrice == null ? null : Number(rawMaxPrice);
  const type = url.searchParams.get('type') || 'all';
  const keyword = safeFilterValue((url.searchParams.get('keyword') || '').toLowerCase());
  const sort = url.searchParams.get('sort') || 'featured';
  const pageValue = Number(url.searchParams.get('page') || 1);
  const limitValue = Number(url.searchParams.get('limit') || 50);
  if (
    !Number.isSafeInteger(pageValue) || pageValue < 1
    || !Number.isSafeInteger(limitValue) || limitValue < 1
    || (requestedMaxPrice !== null && (!Number.isFinite(requestedMaxPrice) || requestedMaxPrice < 0))
  ) {
    return NextResponse.json({ error: 'Invalid filter or pagination value' }, { status: 400 });
  }
  const page = pageValue;
  const limit = Math.min(50, limitValue);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && !isUnauthenticatedAuthError(authError)) {
    return NextResponse.json({ error: 'Unable to verify session' }, { status: 401 });
  }
  let staffRole: string | null = null;
  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: 'Unable to verify staff access' }, { status: 500 });
    staffRole = profile?.role || null;
  }

  const isStaff = STAFF_ROLES.includes(staffRole as (typeof STAFF_ROLES)[number]);
  if (staffStatus !== 'all' && !isStaff) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  const maxPrice = getEffectiveMaxAnnualRent(requestedMaxPrice, isStaff);
  const table = isStaff ? 'properties' : 'public_properties';
  let query = supabase.from(table).select('*', { count: 'exact' });

  if (staffStatus === 'draft') query = query.eq('publication_state', 'draft');
  if (staffStatus === 'in-review') query = query.eq('publication_state', 'review');
  if (staffStatus === 'available' || staffStatus === 'rented') {
    query = query.eq('publication_state', 'published').eq('rental_availability', staffStatus === 'available' ? 'available' : 'rented');
  }

  if (location !== 'all') {
    const loc = safeFilterValue(location.toLowerCase());
    query = query.or(`neighborhood.ilike.%${loc}%,city.ilike.%${loc}%,state.ilike.%${loc}%`);
  }
  if (beds !== 'all') {
    if (beds === '1') query = query.eq('bedrooms', 1);
    else if (beds === '2') query = query.eq('bedrooms', 2);
    else if (beds === '3') query = query.eq('bedrooms', 3);
    else if (beds === '4+') query = query.gte('bedrooms', 4);
  }
  if (type !== 'all') query = query.eq('property_type', type);
  if (maxPrice !== null) query = query.lte('rent_annual', maxPrice);
  if (keyword) query = query.or(`title.ilike.%${keyword}%,reference.ilike.%${keyword}%,tagline.ilike.%${keyword}%,neighborhood.ilike.%${keyword}%,city.ilike.%${keyword}%,state.ilike.%${keyword}%`);

  if (sort === 'price-asc') query = query.order('rent_annual', { ascending: true });
  else if (sort === 'price-desc') query = query.order('rent_annual', { ascending: false });
  else if (sort === 'beds') query = query.order('bedrooms', { ascending: false });
  else query = query.order('created_at', { ascending: false });

  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch fees/media for returned ids (public may read fees/media via RLS)
  const rows = data || [];
  const ids = rows.map((row) => row.id);
  const feesByProperty: Record<string, FeeRow[]> = {};
  const mediaByProperty: Record<string, PropertyMediaRecord[]> = {};
  if (ids.length) {
    const [feesRes, mediaRes] = await Promise.all([
      supabase.from('property_fees').select('*').in('property_id', ids).order('sort_order'),
      supabase.from('property_media').select('*').in('property_id', ids).is('deleted_at', null).order('sort_order'),
    ]);
    if (feesRes.error || mediaRes.error) {
      return NextResponse.json({ error: 'Unable to load property fees or media' }, { status: 500 });
    }
    for (const f of feesRes.data || []) {
      (feesByProperty[f.property_id] ||= []).push(f);
    }
    for (const m of (mediaRes.data || []) as PropertyMediaRecord[]) {
      (mediaByProperty[m.property_id] ||= []).push(m);
    }
  }

  const mediaRows = Object.values(mediaByProperty).flat();
  const signedMedia = await signPropertyMedia(mediaRows, supabase);
  if (signedMedia.error) {
    console.error('Property media signing failed', signedMedia.error);
    return NextResponse.json({ error: 'Unable to load property media' }, { status: 500 });
  }
  if (signedMedia.missingMediaCount) {
    console.warn('Omitted missing property media objects', { count: signedMedia.missingMediaCount });
  }

  const signedMediaById = new Map(signedMedia.rows.map((item) => [item.id, item]));

  const withComputed = rows.map((row) => {
    const fees = feesByProperty[row.id] || [];
    const storedMedia = mediaByProperty[row.id] || [];
    const media = storedMedia.flatMap((item) => {
      const signedItem = signedMediaById.get(item.id);
      return signedItem ? [signedItem] : [];
    });
    const galleryImages = media.map((item) => item.delivery_url || item.url);
    const featuredMedia = storedMedia.find((item) => (
      item.url === row.featured_image
      || item.object_path === row.featured_image
      || `${item.bucket_id}/${item.object_path}` === row.featured_image
    ));
    const signedFeaturedMedia = featuredMedia ? signedMediaById.get(featuredMedia.id) : undefined;
    const featuredImage = featuredMedia
      ? signedFeaturedMedia
        ? signedFeaturedMedia.delivery_url || signedFeaturedMedia.url
        : galleryImages[0] || ''
      : row.featured_image || galleryImages[0] || '';
    const unconfirmed = fees.filter((f) => f.required && !f.confirmed_at);
    const computedTotal = computeTotal(Number(row.rent_annual), fees);
    return {
      ...row,
      // Map DB snake to frontend camel for compatibility
      propertyType: row.property_type,
      priceAnnual: Number(row.rent_annual),
      priceFormatted: row.price_formatted || `₦${Number(row.rent_annual).toLocaleString('en-NG')}`,
      addressShort: row.address_short,
      powerRating: row.power_rating,
      waterSupply: row.water_supply,
      securityRating: row.security_rating,
      verificationBadge: row.verification_state === 'verified' ? 'Verified Physical Title' : row.verification_state === 'vetted' ? 'Vetted Landlord' : 'Verification status not provided',
      inspectionStatus: 'Availability not listed',
      featuredImage,
      galleryImages,
      description: row.description,
      features: row.features,
      nearbyLandmarks: row.nearby_landmarks,
      // Private fields only for authenticated staff; anon rows come from view without landlord_contact
      landlordContact: row.landlord_contact || undefined,
      fees,
      media,
      computedTotal,
      unconfirmedFeeCount: unconfirmed.length + (fees.length === 0 ? 1 : 0),
    };
  });

  return NextResponse.json({ data: withComputed, count, page, limit });
}

export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'Unable to verify staff access' }, { status: 500 });
  if (!profile || !['Platform Admin','Operations Lead','Field Vetting Agent'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.slug || body?.rent_annual == null) {
    return NextResponse.json({ error: 'Missing required fields: title, slug, rent_annual' }, { status: 400 });
  }
  if (
    (body.publication_state != null && body.publication_state !== 'draft')
    || (body.verification_state != null && body.verification_state !== 'unverified')
  ) {
    return NextResponse.json({ error: 'New properties must be created as draft and unverified' }, { status: 400 });
  }
  if (body.id != null) {
    return NextResponse.json({ error: 'Property IDs are generated by the database' }, { status: 400 });
  }
  const state = body.state || 'Edo';
  const city = body.city || 'Benin City';
  const neighborhood = body.neighborhood || body.city || 'GRA Benin City';
  const addressShort = body.address_short || body.addressShort || '';
  const location = body.location || [addressShort, neighborhood, city, state].filter(Boolean).join(', ');
  const propertyType = String(body.property_type || body.propertyType || 'apartment').trim().toLowerCase();
  if (!['apartment', 'house', 'duplex', 'studio', 'land', 'commercial'].includes(propertyType)) {
    return NextResponse.json({ error: 'Invalid property type' }, { status: 400 });
  }
  const row = {
    reference: body.reference || body.slug,
    slug: body.slug,
    title: body.title,
    location,
    tagline: body.tagline || '',
    property_type: propertyType,
    price_ngn: body.rent_annual,
    price_period: 'yearly',
    rent_annual: body.rent_annual,
    currency: body.currency || 'NGN',
    state,
    city,
    neighborhood,
    address_short: addressShort,
    bedrooms: body.bedrooms ?? 2,
    bathrooms: body.bathrooms ?? 2,
    toilets: body.toilets ?? 3,
    power_rating: body.power_rating || body.powerRating || '',
    water_supply: body.water_supply || body.waterSupply || '',
    security_rating: body.security_rating || body.securityRating || '',
    verification_state: 'unverified',
    publication_state: 'draft',
    rental_availability: body.rental_availability || 'available',
    featured_image: body.featured_image || body.featuredImage || '',
    description: body.description || '',
    features: body.features || [],
    nearby_landmarks: body.nearby_landmarks || body.nearbyLandmarks || [],
    landlord_contact: body.landlord_contact || body.landlordContact || {},
    fixture_id: body.fixture_id || null,
    created_by: user.id,
  };
  const { data, error } = await supabase.from('properties').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ data }, { status: 201 });
}
