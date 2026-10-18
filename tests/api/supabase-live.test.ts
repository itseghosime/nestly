import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeTotal, type FeeRow } from '@/lib/price';
import {
  promoteListingMediaToPublic,
  signPropertyMedia,
  type PropertyMediaStorageRow,
} from '@/lib/backend/media-url';
import type { StaffRole } from '@/lib/backend/authorization';

type TestTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};
type TestDatabase = {
  public: {
    Tables: Record<string, TestTable>;
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, { Args: Record<string, unknown>; Returns: Record<string, unknown>[] }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const url = process.env.SUPABASE_TEST_URL;
const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

function isLoopbackUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

const localTestReady = Boolean(url && anonKey && serviceRoleKey && isLoopbackUrl(url));
const localIntegration = describe.skipIf(!localTestReady);
const password = 'Nestly-local-test-Only-42!';
const suffix = crypto.randomUUID();

type Client = SupabaseClient<TestDatabase>;
type Identity = { id: string; email: string; client: Client };
type MediaRow = PropertyMediaStorageRow & { sort_order: number };

let admin: Client | null = null;
let anonymous: Client | null = null;
let ordinary: Identity;
let platformAdmin: Identity;
let operationsLead: Identity;
let fieldAgent: Identity;
let legalStaff: Identity;
let customerCare: Identity;
let propertyId = '';
let outOfZonePropertyId = '';
let agentConflictPropertyId = '';
let slotId = '';
let replacementSlotId = '';
const inspectionSlotIds: string[] = [];
let bookingId = '';
let offerId = '';
let conversationId = '';
let websiteCustomerId = '';
const createdUsers: string[] = [];
const createdEmails: string[] = [];
const workflowEmails: string[] = [];
const storedObjects: Array<{ bucket: string; path: string }> = [];

function requireValue(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required for isolated Supabase tests`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`${label} is missing from the isolated Supabase result`);
  }
  return value;
}

function rpcField(value: unknown, field: string): unknown {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== 'object') return undefined;
  return Object.entries(record).find(([key]) => key === field)?.[1];
}

function testAdmin(): Client {
  if (!admin) throw new Error('Isolated test setup has not completed');
  return admin;
}

function testAnonymous(): Client {
  if (!anonymous) throw new Error('Isolated test setup has not completed');
  return anonymous;
}

async function createIdentity(
  role: StaffRole | null,
  assignedZone: string | null,
  label: string,
): Promise<Identity> {
  const backend = testAdmin();
  const email = `nestly-${label}-${suffix}@example.test`;
  const { data, error } = await backend.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Unable to provision isolated ${label} identity`);
  createdUsers.push(data.user.id);
  createdEmails.push(email);

  if (role) {
    const { error: profileError } = await backend.from('profiles').insert({
      id: data.user.id,
      display_name: `Local ${label}`,
      role,
      capabilities: [],
      assigned_zone: assignedZone,
    });
    if (profileError) throw new Error(`Unable to provision isolated ${label} profile`);
  }

  const client = createClient<TestDatabase>(requireValue(url, 'SUPABASE_TEST_URL'), requireValue(anonKey, 'SUPABASE_TEST_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Unable to authenticate isolated ${label} identity`);
  return { id: data.user.id, email, client };
}

async function insertFixtureProperty(
  client: Client,
  createdBy: string,
  reference: string,
  city: string,
  state: string,
  location: string,
) {
  const { data, error } = await client.from('properties').insert({
    reference,
    slug: `${reference.toLowerCase()}-${suffix.slice(0, 8)}`,
    title: reference,
    description: 'Local authorization test fixture',
    property_type: 'duplex',
    location,
    neighborhood: location,
    city,
    state,
    bedrooms: 3,
    bathrooms: 2,
    price_ngn: 1_000_000,
    price_period: 'yearly',
    rent_annual: 1_000_000,
    currency: 'NGN',
    publication_state: 'draft',
    rental_availability: 'available',
    verification_state: 'unverified',
    created_by: createdBy,
    landlord_contact: { email: 'private-test@example.test' },
  }).select('id').single();
  if (error) {
    const [{ data: role }, { data: canCreate }, { data: auth }] = await Promise.all([
      client.rpc('caller_role'),
      client.rpc('can_create_property', {
        p_state: state,
        p_city: city,
        p_neighborhood: location,
        p_legacy_location: location,
      }),
      client.auth.getUser(),
    ]);
    throw new Error(
      `Unable to create isolated property fixture ${reference}: ${error?.message || 'no row returned'} (${error?.code || 'unknown'}; role=${role}; authorized=${canCreate}; identityMatches=${auth.user?.id === createdBy})`,
    );
  }
  if (!data) throw new Error(`Unable to create isolated property fixture ${reference}: no row returned`);
  return data.id as string;
}

async function addStoredMedia(
  identity: Identity,
  kind: 'listing' | 'evidence',
): Promise<MediaRow> {
  const bucket = 'property-drafts';
  const path = `${propertyId}/${kind}-${crypto.randomUUID()}.png`;
  const { error: uploadError } = await identity.client.storage.from(bucket).upload(
    path,
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    { contentType: 'image/png', upsert: false },
  );
  if (uploadError) throw new Error(`Unable to upload isolated ${kind} media`);
  storedObjects.push({ bucket, path });
  const { data, error } = await identity.client.from('property_media').insert({
    property_id: propertyId,
    url: `${bucket}/${path}`,
    media_url: `${bucket}/${path}`,
    media_type: 'image',
    bucket_id: bucket,
    object_path: path,
    media_kind: kind,
    sort_order: kind === 'listing' ? 0 : 1,
  }).select('*').single();
  if (error || !data) throw new Error(`Unable to register isolated ${kind} media`);
  return data as MediaRow;
}

function receiptHash(): string {
  return crypto.randomUUID().replaceAll('-', '').repeat(2);
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

localIntegration('isolated Supabase authorization and workflow integration', () => {
  beforeAll(async () => {
    admin = createClient<TestDatabase>(
      requireValue(url, 'SUPABASE_TEST_URL'),
      requireValue(serviceRoleKey, 'SUPABASE_TEST_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    anonymous = createClient<TestDatabase>(
      requireValue(url, 'SUPABASE_TEST_URL'),
      requireValue(anonKey, 'SUPABASE_TEST_ANON_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    platformAdmin = await createIdentity('Platform Admin', null, 'admin');
    operationsLead = await createIdentity('Operations Lead', 'Benin City', 'ops');
    fieldAgent = await createIdentity('Field Vetting Agent', 'Benin City', 'agent');
    legalStaff = await createIdentity('Legal & Compliance', 'Benin City', 'legal');
    customerCare = await createIdentity('Customer Care', null, 'care');
    ordinary = await createIdentity(null, null, 'customer');

    propertyId = await insertFixtureProperty(
      platformAdmin.client,
      platformAdmin.id,
      `RLS-${suffix.slice(0, 8)}`,
      'Benin City',
      'Edo',
      'GRA',
    );
    outOfZonePropertyId = await insertFixtureProperty(
      testAdmin(),
      platformAdmin.id,
      `OUT-${suffix.slice(0, 8)}`,
      'Lagos',
      'Lagos',
      'Victoria Island',
    );
    agentConflictPropertyId = await insertFixtureProperty(
      testAdmin(),
      platformAdmin.id,
      `AGENT-${suffix.slice(0, 8)}`,
      'Benin City',
      'Edo',
      'GRA',
    );
  }, 60_000);

  afterAll(async () => {
    const backend = admin;
    if (!backend) return;
    if (inspectionSlotIds.length) {
      const { data: inspections } = await backend.from('inspections').select('id').in('slot_id', inspectionSlotIds);
      const inspectionIds = (inspections || []).map((row) => row.id);
      if (inspectionIds.length) {
        await backend.from('notifications').delete().in('inspection_id', inspectionIds);
        await backend.from('inspection_transition_requests').delete().in('inspection_id', inspectionIds);
        await backend.from('inspections').delete().in('id', inspectionIds);
      }
      await backend.from('inspection_slots').delete().in('id', inspectionSlotIds);
    }
    if (offerId) {
      await backend.from('notifications').delete().eq('idempotency_key', `offer:${offerId}`);
      await backend.from('offers').delete().eq('id', offerId);
    }
    if (conversationId) {
      await backend.from('staff_notes').delete().eq('entity_type', 'conversation').eq('entity_id', conversationId);
      await backend.from('message_outbox').delete().eq('conversation_id', conversationId);
      await backend.from('messages').delete().eq('conversation_id', conversationId);
      await backend.from('website_conversation_tokens').delete().eq('conversation_id', conversationId);
      await backend.from('website_conversation_contacts').delete().eq('conversation_id', conversationId);
      await backend.from('audit_logs').delete().eq('entity_type', 'conversation').eq('entity_id', conversationId);
      await backend.from('conversations').delete().eq('id', conversationId);
      if (websiteCustomerId) await backend.from('customers').delete().eq('id', websiteCustomerId);
    }
    for (const object of storedObjects) {
      await backend.storage.from(object.bucket).remove([object.path]);
    }
    const propertyIds = [propertyId, outOfZonePropertyId, agentConflictPropertyId].filter(Boolean);
    if (propertyIds.length) {
      await backend.from('properties').delete().in('id', propertyIds);
    }
    const allEmails = [...createdEmails, ...workflowEmails];
    if (allEmails.length) {
      const { data: customers } = await backend.from('customers').select('id').in('email', allEmails);
      const customerIds = (customers || []).map((row) => row.id);
      if (customerIds.length) await backend.from('customers').delete().in('id', customerIds);
    }
    for (const userId of createdUsers) {
      await backend.auth.admin.deleteUser(userId);
    }
  }, 60_000);

  it('separates anonymous, customer, and staff property access', async () => {
    const anonymousClient = testAnonymous();
    const { data: anonymousDraft, error: anonymousBaseError } = await anonymousClient
      .from('properties').select('id').eq('id', propertyId).maybeSingle();
    expect(anonymousBaseError).not.toBeNull();
    expect(anonymousDraft).toBeNull();

    const { data: publicDraft, error: publicViewError } = await anonymousClient
      .from('public_properties').select('id').eq('id', propertyId).maybeSingle();
    expect(publicViewError).toBeNull();
    expect(publicDraft).toBeNull();

    const { data: staffDraft, error: staffError } = await platformAdmin.client
      .from('properties').select('publication_state').eq('id', propertyId).single();
    expect(staffError).toBeNull();
    expect(staffDraft?.publication_state).toBe('draft');

    const { data: customerDraft, error: customerError } = await ordinary.client
      .from('properties').select('id').eq('id', propertyId).maybeSingle();
    expect(customerError).toBeNull();
    expect(customerDraft).toBeNull();
  });

  it('creates a draft, uploads private media, publishes safely, and reflects public edits', async () => {
    const listingMedia = await addStoredMedia(platformAdmin, 'listing');
    const evidenceMedia = await addStoredMedia(platformAdmin, 'evidence');
    const { data: privateDraftDownload, error: privateDraftError } = await testAnonymous()
      .storage.from('property-drafts').download(evidenceMedia.object_path!);
    expect(privateDraftDownload).toBeNull();
    expect(privateDraftError).not.toBeNull();

    const { data: fee, error: feeError } = await platformAdmin.client.from('property_fees').insert({
      property_id: propertyId,
      fee_key: `test-fee-${suffix.slice(0, 8)}`,
      label: 'Local test move-in fee',
      kind: 'fixed',
      amount: 25_000,
      base: 'rent',
      required: true,
      confirmed_at: null,
      sort_order: 10,
    }).select('*').single();
    expect(feeError).toBeNull();
    expect(fee).not.toBeNull();
    expect(computeTotal(1_000_000, [fee as FeeRow])).toBeNull();

    const { error: confirmFeeError } = await platformAdmin.client.from('property_fees')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', requireString(fee?.id, 'Fee ID'));
    expect(confirmFeeError).toBeNull();

    const promotionError = await promoteListingMediaToPublic(propertyId, testAdmin());
    expect(promotionError).toBeNull();
    const { data: listingRow, error: listingError } = await testAdmin().from('property_media')
      .select('id, property_id, url, media_url, bucket_id, object_path, media_kind, deleted_at, sort_order')
      .eq('id', listingMedia.id)
      .single();
    expect(listingError).toBeNull();
    expect(listingRow?.bucket_id).toBe('property-media');
    expect(listingRow?.object_path).not.toBe(listingMedia.object_path);
    expect(listingRow?.media_url).toBe(`property-media/${listingRow?.object_path}`);
    const promotedObjectPath = requireString(listingRow?.object_path, 'Promoted listing photo path');
    storedObjects.push({ bucket: 'property-media', path: promotedObjectPath });

    const { error: vettedError } = await platformAdmin.client.from('properties')
      .update({ verification_state: 'vetted' })
      .eq('id', propertyId);
    expect(vettedError).toBeNull();
    const { error: publishError } = await platformAdmin.client.from('properties')
      .update({ publication_state: 'published' })
      .eq('id', propertyId);
    expect(publishError).toBeNull();

    const { data: publicRow, error: publicError } = await testAnonymous()
      .from('public_properties').select('*').eq('id', propertyId).single();
    expect(publicError).toBeNull();
    expect(publicRow?.publication_state).toBe('published');
    expect(publicRow).not.toHaveProperty('landlord_contact');

    const { data: publicMedia, error: publicMediaError } = await testAnonymous()
      .from('property_media').select('*').eq('property_id', propertyId).is('deleted_at', null);
    expect(publicMediaError).toBeNull();
    expect(publicMedia?.map((row) => row.id)).toContain(listingMedia.id);
    expect(publicMedia?.map((row) => row.id)).not.toContain(evidenceMedia.id);

    const { data: publishedPhoto, error: photoError } = await testAnonymous()
      .storage.from('property-media').download(promotedObjectPath);
    expect(photoError).toBeNull();
    expect(publishedPhoto).not.toBeNull();
    const { data: hiddenEvidence, error: evidenceError } = await testAnonymous()
      .storage.from('property-drafts').download(evidenceMedia.object_path!);
    expect(evidenceError).not.toBeNull();
    expect(hiddenEvidence).toBeNull();

    const { rows: signedListing, error: signedListingError } = await signPropertyMedia(
      [listingRow as MediaRow],
      testAnonymous(),
      testAdmin(),
    );
    expect(signedListingError).toBeNull();
    expect(signedListing[0]?.delivery_url).toContain('token=');
    const { rows: staffEvidence, error: staffEvidenceError } = await signPropertyMedia(
      [evidenceMedia],
      platformAdmin.client,
      testAdmin(),
    );
    expect(staffEvidenceError).toBeNull();
    expect(staffEvidence[0]?.delivery_url).toContain('token=');
    const { error: anonymousEvidenceSigningError } = await signPropertyMedia(
      [evidenceMedia],
      testAnonymous(),
      testAdmin(),
    );
    expect(anonymousEvidenceSigningError).not.toBeNull();

    const { data: deletedListing, error: deleteMediaError } = await platformAdmin.client
      .from('property_media')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', listingMedia.id)
      .eq('property_id', propertyId)
      .select('id, deleted_at')
      .single();
    expect(deleteMediaError).toBeNull();
    expect(deletedListing?.deleted_at).not.toBeNull();

    const { data: publicMediaAfterDelete, error: publicMediaAfterDeleteError } = await testAnonymous()
      .from('property_media')
      .select('id')
      .eq('id', listingMedia.id)
      .is('deleted_at', null);
    expect(publicMediaAfterDeleteError).toBeNull();
    expect(publicMediaAfterDelete).toEqual([]);

    const { data: deletedPhoto, error: deletedPhotoError } = await testAnonymous()
      .storage.from('property-media').download(promotedObjectPath);
    expect(deletedPhoto).toBeNull();
    expect(deletedPhotoError).not.toBeNull();

    const { data: deletedListingRow, error: deletedListingReadError } = await testAdmin()
      .from('property_media')
      .select('id, property_id, url, bucket_id, object_path, media_kind, deleted_at, sort_order')
      .eq('id', listingMedia.id)
      .single();
    expect(deletedListingReadError).toBeNull();
    const { error: deletedSigningError } = await signPropertyMedia(
      [deletedListingRow as MediaRow],
      platformAdmin.client,
      testAdmin(),
    );
    expect(deletedSigningError).not.toBeNull();

    const nextTitle = `Updated ${suffix.slice(0, 8)}`;
    const { error: editError } = await platformAdmin.client.from('properties')
      .update({ title: nextTitle }).eq('id', propertyId);
    expect(editError).toBeNull();
    const { data: refreshedPublicRow, error: refreshedError } = await testAnonymous()
      .from('public_properties').select('title').eq('id', propertyId).single();
    expect(refreshedError).toBeNull();
    expect(refreshedPublicRow?.title).toBe(nextTitle);
  });

  it('omits one missing listing object without failing valid public or staff media signing', async () => {
    const validDraft = await addStoredMedia(platformAdmin, 'listing');
    const promotionError = await promoteListingMediaToPublic(propertyId, testAdmin());
    expect(promotionError).toBeNull();

    const { data: validRow, error: validRowError } = await testAdmin().from('property_media')
      .select('id, property_id, url, media_url, bucket_id, object_path, media_kind, deleted_at, sort_order')
      .eq('id', validDraft.id)
      .single();
    expect(validRowError).toBeNull();
    expect(validRow?.bucket_id).toBe('property-media');
    const validObjectPath = requireString(validRow?.object_path, 'Valid listing photo path');
    storedObjects.push({ bucket: 'property-media', path: validObjectPath });

    const missingObjectPath = `${propertyId}/missing-${crypto.randomUUID()}.png`;
    const { data: missingRow, error: missingRowError } = await testAdmin().from('property_media')
      .insert({
        property_id: propertyId,
        url: `property-media/${missingObjectPath}`,
        media_url: `property-media/${missingObjectPath}`,
        media_type: 'image',
        bucket_id: 'property-media',
        object_path: missingObjectPath,
        media_kind: 'listing',
        sort_order: 2,
      })
      .select('id, property_id, url, media_url, bucket_id, object_path, media_kind, deleted_at, sort_order')
      .single();
    expect(missingRowError).toBeNull();
    expect(missingRow).not.toBeNull();

    const { error: featuredImageError } = await testAdmin().from('properties')
      .update({ featured_image: `property-media/${missingObjectPath}` })
      .eq('id', propertyId);
    expect(featuredImageError).toBeNull();
    const evidenceMedia = await addStoredMedia(platformAdmin, 'evidence');
    const { data: anonymousEvidence, error: anonymousEvidenceError } = await testAnonymous()
      .storage.from('property-drafts').download(evidenceMedia.object_path!);
    expect(anonymousEvidence).toBeNull();
    expect(anonymousEvidenceError).not.toBeNull();
    const { error: anonymousEvidenceSigningError } = await signPropertyMedia(
      [evidenceMedia],
      testAnonymous(),
      testAdmin(),
    );
    expect(anonymousEvidenceSigningError).not.toBeNull();

    const mediaRows = [validRow as MediaRow, missingRow as MediaRow];
    const { rows: publicRows, error: publicSigningError, missingMediaCount: publicMissingCount } =
      await signPropertyMedia(mediaRows, testAnonymous(), testAdmin());
    expect(publicSigningError).toBeNull();
    expect(publicMissingCount).toBe(1);
    expect(publicRows.map((row) => row.id)).toEqual([validDraft.id]);
    expect(publicRows[0]?.delivery_url).toContain('token=');

    const { rows: staffRows, error: staffSigningError, missingMediaCount: staffMissingCount } =
      await signPropertyMedia(mediaRows, platformAdmin.client, testAdmin());
    expect(staffSigningError).toBeNull();
    expect(staffMissingCount).toBe(1);
    expect(staffRows.map((row) => row.id)).toEqual([validDraft.id]);
    expect(staffRows[0]?.delivery_url).toContain('token=');

    const appUrl = process.env.NESTLY_TEST_APP_URL;
    if (appUrl) {
      const browseResponse = await fetch(new URL('/api/properties?limit=50', appUrl));
      expect(browseResponse.status).toBe(200);
      const browseBody = await browseResponse.json() as {
        data?: Array<{
          id: string;
          featuredImage?: string;
          galleryImages?: string[];
          media?: Array<{ id: string }>;
        }>;
      };
      const publicListing = browseBody.data?.find((property) => property.id === propertyId);
      expect(publicListing).toBeDefined();
      expect(publicListing?.media?.map((row) => row.id)).toContain(validDraft.id);
      expect(publicListing?.media?.map((row) => row.id)).not.toContain(missingRow?.id);
      expect(publicListing?.galleryImages?.[0]).toContain('token=');
      expect(publicListing?.featuredImage).toBe(publicListing?.galleryImages?.[0]);

      const detailResponse = await fetch(new URL(`/api/properties/${propertyId}`, appUrl));
      expect(detailResponse.status).toBe(200);
      const detailBody = await detailResponse.json() as {
        data?: {
          featuredImage?: string;
          galleryImages?: string[];
          media?: Array<{ id: string }>;
        };
      };
      expect(detailBody.data?.media?.map((row) => row.id)).toContain(validDraft.id);
      expect(detailBody.data?.media?.map((row) => row.id)).not.toContain(missingRow?.id);
      expect(detailBody.data?.media?.map((row) => row.id)).not.toContain(evidenceMedia.id);
      expect(detailBody.data?.galleryImages?.[0]).toContain('token=');
      expect(detailBody.data?.featuredImage).toBe(detailBody.data?.galleryImages?.[0]);

      const mediaResponse = await fetch(new URL(`/api/properties/${propertyId}/media`, appUrl));
      expect(mediaResponse.status).toBe(200);
      const mediaBody = await mediaResponse.json() as { data?: Array<{ id: string }> };
      expect(mediaBody.data?.map((row) => row.id)).toContain(validDraft.id);
      expect(mediaBody.data?.map((row) => row.id)).not.toContain(missingRow?.id);
      expect(mediaBody.data?.map((row) => row.id)).not.toContain(evidenceMedia.id);

      const cookieValues = new Map<string, string>();
      const cookieClient = createServerClient(
        requireValue(url, 'SUPABASE_TEST_URL'),
        requireValue(anonKey, 'SUPABASE_TEST_ANON_KEY'),
        {
          cookies: {
            getAll: () => [...cookieValues].map(([name, value]) => ({ name, value })),
            setAll: (cookiesToSet) => {
              for (const { name, value, options } of cookiesToSet) {
                if (options.maxAge === 0) cookieValues.delete(name);
                else cookieValues.set(name, value);
              }
            },
          },
        },
      );
      const { error: signInError } = await cookieClient.auth.signInWithPassword({
        email: platformAdmin.email,
        password,
      });
      expect(signInError).toBeNull();
      const staffResponse = await fetch(new URL('/api/properties?limit=50', appUrl), {
        headers: {
          cookie: [...cookieValues].map(([name, value]) => `${name}=${value}`).join('; '),
        },
      });
      expect(staffResponse.status).toBe(200);
      const staffBody = await staffResponse.json() as {
        data?: Array<{ id: string; media?: Array<{ id: string }> }>;
      };
      const staffListing = staffBody.data?.find((property) => property.id === propertyId);
      expect(staffListing).toBeDefined();
      expect(staffListing?.media?.map((row) => row.id)).toContain(validDraft.id);
      expect(staffListing?.media?.map((row) => row.id)).not.toContain(missingRow?.id);

      const staffDetailResponse = await fetch(new URL(`/api/properties/${propertyId}`, appUrl), {
        headers: {
          cookie: [...cookieValues].map(([name, value]) => `${name}=${value}`).join('; '),
        },
      });
      expect(staffDetailResponse.status).toBe(200);
      const staffDetailBody = await staffDetailResponse.json() as {
        data?: {
          featuredImage?: string;
          galleryImages?: string[];
          media?: Array<{ id: string }>;
        };
      };
      expect(staffDetailBody.data?.media?.map((row) => row.id)).toContain(validDraft.id);
      expect(staffDetailBody.data?.media?.map((row) => row.id)).not.toContain(missingRow?.id);
      expect(staffDetailBody.data?.media?.map((row) => row.id)).toContain(evidenceMedia.id);
      expect(staffDetailBody.data?.featuredImage).toContain('token=');
    }
  });

  it('prevents self-promotion and applies exact property-zone access to operations and legal staff', async () => {
    const { data: operationsProfile, error: operationsProfileError } = await operationsLead.client
      .from('profiles').select('role').eq('id', operationsLead.id).single();
    expect(operationsProfileError).toBeNull();
    expect(operationsProfile?.role).toBe('Operations Lead');
    const { data: legalProfile, error: legalProfileError } = await legalStaff.client
      .from('profiles').select('role').eq('id', legalStaff.id).single();
    expect(legalProfileError).toBeNull();
    expect(legalProfile?.role).toBe('Legal & Compliance');

    const { error: selfPromotionError } = await platformAdmin.client.from('profiles')
      .update({ role: 'Operations Lead' }).eq('id', platformAdmin.id);
    expect(selfPromotionError).not.toBeNull();

    const { error: customerProfileError } = await ordinary.client.from('profiles').insert({
      id: ordinary.id,
      display_name: 'Unauthorized',
      role: 'Platform Admin',
      capabilities: ['platform:*'],
      assigned_zone: null,
    });
    expect(customerProfileError).not.toBeNull();

    const { data: sameZoneOps } = await operationsLead.client.from('properties')
      .select('id').eq('id', propertyId).maybeSingle();
    const { data: otherZoneOps } = await operationsLead.client.from('properties')
      .select('id').eq('id', outOfZonePropertyId).maybeSingle();
    expect(sameZoneOps?.id).toBe(propertyId);
    expect(otherZoneOps).toBeNull();

    const { data: sameZoneLegal } = await legalStaff.client.from('properties')
      .select('id').eq('id', propertyId).maybeSingle();
    const { data: otherZoneLegal } = await legalStaff.client.from('properties')
      .select('id').eq('id', outOfZonePropertyId).maybeSingle();
    expect(sameZoneLegal?.id).toBe(propertyId);
    expect(otherZoneLegal).toBeNull();

    const { data: publicBuckets, error: bucketError } = await testAdmin().storage.listBuckets();
    expect(bucketError).toBeNull();
    expect(publicBuckets?.find((bucket) => bucket.id === 'property-media')?.public).toBe(false);
    expect(publicBuckets?.find((bucket) => bucket.id === 'property-drafts')?.public).toBe(false);
  });

  it('preserves a verified staff session across server-client recreation', async () => {
    const cookieValues = new Map<string, string>();
    const createCookieClient = () => createServerClient(
      requireValue(url, 'SUPABASE_TEST_URL'),
      requireValue(anonKey, 'SUPABASE_TEST_ANON_KEY'),
      {
        cookies: {
          getAll: () => [...cookieValues].map(([name, value]) => ({ name, value })),
          setAll: (cookiesToSet) => {
            for (const { name, value, options } of cookiesToSet) {
              if (options.maxAge === 0) cookieValues.delete(name);
              else cookieValues.set(name, value);
            }
          },
        },
      },
    );
    const firstClient = createCookieClient();
    const { error: signInError } = await firstClient.auth.signInWithPassword({
      email: platformAdmin.email,
      password,
    });
    expect(signInError).toBeNull();

    const reloadedClient = createCookieClient();
    const { data, error } = await reloadedClient.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(platformAdmin.id);
  });

  it('keeps offers pending until an authorized human decides', async () => {
    const key = idempotencyKey();
    const hash = receiptHash();
    const email = `offer-${suffix}@example.test`;
    workflowEmails.push(email);
    const { data: submitted, error: submitError } = await testAnonymous().rpc('submit_offer', {
      p_property_id: propertyId,
      p_amount: 900_000,
      p_currency: 'NGN',
      p_name: 'Local offer test',
      p_email: email,
      p_phone: '',
      p_message: 'Is this amount negotiable?',
      p_receipt_hash: hash,
      p_idempotency_key: key,
    });
    expect(submitError).toBeNull();
    expect(submitted?.[0]?.status).toBe('pending');

    const { data: anonOffers, error: anonOffersError } = await testAnonymous()
      .from('offers').select('id').limit(1);
    expect(anonOffersError || anonOffers?.length === 0).toBeTruthy();

    const { data: offer } = await testAdmin().from('offers')
      .select('id').eq('idempotency_key', key).single();
    expect(offer).not.toBeNull();
    offerId = requireString(offer?.id, 'Offer ID');

    const { data: customerDecision, error: customerDecisionError } = await ordinary.client.from('offers')
      .update({ status: 'accepted' }).eq('id', offerId).select('id');
    expect(customerDecisionError).toBeNull();
    expect(customerDecision).toEqual([]);
    const { data: pendingOffer } = await testAdmin().from('offers')
      .select('status').eq('id', offerId).single();
    expect(pendingOffer?.status).toBe('pending');

    const { data: decision, error: decisionError } = await operationsLead.client.from('offers')
      .update({ status: 'countered', counter_amount_ngn: 950_000 })
      .eq('id', offerId)
      .select('status, counter_amount_ngn, decided_by')
      .single();
    expect(decisionError).toBeNull();
    expect(decision?.status).toBe('countered');
    expect(decision?.counter_amount_ngn).toBe(950_000);
    expect(decision?.decided_by).toBe(operationsLead.id);
  });

  it('serializes booking capacity, expires pending holds once, and issues gate details only on approval', async () => {
    const startsAt = new Date(Date.now() + 3 * 86400000);
    startsAt.setUTCMinutes(0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    const { data: priorSettings, error: settingsReadError } = await platformAdmin.client
      .from('workspace_settings')
      .select('daylight_lock, daylight_start, daylight_end')
      .eq('id', 1)
      .single();
    expect(settingsReadError).toBeNull();
    expect(priorSettings).not.toBeNull();
    const { error: lockError } = await platformAdmin.client.from('workspace_settings')
      .update({ daylight_lock: true, daylight_start: '07:00:00', daylight_end: '18:00:00' })
      .eq('id', 1);
    expect(lockError).toBeNull();
    try {
      const outsideDaylightStart = new Date(startsAt);
      outsideDaylightStart.setUTCHours(18, 0, 0, 0);
      const { error: daylightError } = await platformAdmin.client.from('inspection_slots').insert({
        property_id: propertyId,
        agent_id: fieldAgent.id,
        starts_at: outsideDaylightStart.toISOString(),
        ends_at: new Date(outsideDaylightStart.getTime() + 90 * 60_000).toISOString(),
        capacity: 1,
        is_active: true,
        transit_buffer_mins: 0,
      });
      expect(daylightError?.code).toBe('23514');
    } finally {
      const { error: restoreError } = await platformAdmin.client.from('workspace_settings')
        .update({
          daylight_lock: priorSettings?.daylight_lock,
          daylight_start: priorSettings?.daylight_start,
          daylight_end: priorSettings?.daylight_end,
        })
        .eq('id', 1);
      expect(restoreError).toBeNull();
    }

    const { data: slot, error: slotError } = await platformAdmin.client.from('inspection_slots').insert({
      property_id: propertyId,
      agent_id: fieldAgent.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      capacity: 2,
      is_active: true,
      transit_buffer_mins: 0,
    }).select('id').single();
    expect(slotError).toBeNull();
    expect(slot).not.toBeNull();
    slotId = requireString(slot?.id, 'Inspection slot ID');
    inspectionSlotIds.push(slotId);

    const replacementStartsAt = new Date(startsAt.getTime() + 4 * 60 * 60_000);
    const replacementEndsAt = new Date(replacementStartsAt.getTime() + 90 * 60_000);
    const { data: replacementSlot, error: replacementSlotError } = await platformAdmin.client
      .from('inspection_slots').insert({
        property_id: propertyId,
        agent_id: fieldAgent.id,
        starts_at: replacementStartsAt.toISOString(),
        ends_at: replacementEndsAt.toISOString(),
        capacity: 1,
        is_active: true,
        transit_buffer_mins: 0,
      }).select('id').single();
    expect(replacementSlotError).toBeNull();
    expect(replacementSlot).not.toBeNull();
    replacementSlotId = requireString(replacementSlot?.id, 'Replacement inspection slot ID');
    inspectionSlotIds.push(replacementSlotId);

    const { error: propertyOverlapError } = await platformAdmin.client.from('inspection_slots').insert({
      property_id: propertyId,
      agent_id: fieldAgent.id,
      starts_at: new Date(startsAt.getTime() + 15 * 60_000).toISOString(),
      ends_at: new Date(endsAt.getTime() + 15 * 60_000).toISOString(),
      capacity: 1,
      is_active: true,
      transit_buffer_mins: 0,
    });
    expect(propertyOverlapError?.code).toBe('23P01');

    const { error: agentOverlapError } = await platformAdmin.client.from('inspection_slots').insert({
      property_id: agentConflictPropertyId,
      agent_id: fieldAgent.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      capacity: 1,
      is_active: true,
      transit_buffer_mins: 0,
    });
    expect(agentOverlapError?.code).toBe('23P01');

    const requestFor = (
      index: number,
      targetSlotId = slotId,
      requestKey = idempotencyKey(),
      hash = receiptHash(),
    ) => {
      const email = `inspection-${index}-${suffix}@example.test`;
      workflowEmails.push(email);
      return testAnonymous().rpc('submit_inspection_request', {
        p_slot_id: targetSlotId,
        p_name: `Local inspection ${index}`,
        p_email: email,
        p_phone: '',
        p_message: '',
        p_receipt_hash: hash,
        p_idempotency_key: requestKey,
      });
    };
    const concurrent = await Promise.all([requestFor(1), requestFor(2), requestFor(3)]);
    const successful = concurrent.filter((result) => !result.error);
    const rejected = concurrent.filter((result) => result.error);
    expect(successful).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.error?.code).toBe('23P01');

    const firstBooking = successful[0]?.data?.[0];
    const secondBooking = successful[1]?.data?.[0];
    expect(firstBooking?.status).toBe('PENDING_CONFIRMATION');
    expect(firstBooking?.reservation_expires_at).not.toBeNull();
    expect(secondBooking?.status).toBe('PENDING_CONFIRMATION');
    const pendingId = requireString(firstBooking?.id, 'Pending booking ID');
    const secondPendingId = requireString(secondBooking?.id, 'Second pending booking ID');
    bookingId = pendingId;
    const { data: pendingRow } = await testAdmin().from('inspections')
      .select('gate_details').eq('id', pendingId).single();
    expect(pendingRow?.gate_details).toBeNull();

    const { data: pendingStored, error: pendingStoredError } = await testAdmin().from('inspections')
      .select('receipt_hash').eq('id', pendingId).single();
    expect(pendingStoredError).toBeNull();
    const { data: pendingReceipt, error: pendingReceiptError } = await testAnonymous()
      .rpc('get_booking_receipt', {
        p_receipt_hash: requireString(pendingStored?.receipt_hash, 'Pending receipt hash'),
      });
    expect(pendingReceiptError).toBeNull();
    expect(pendingReceipt?.[0]?.status).toBe('pending');
    expect(pendingReceipt?.[0]?.gate_details).toBeNull();
    expect(pendingReceipt?.[0]).not.toHaveProperty('email');
    expect(pendingReceipt?.[0]).not.toHaveProperty('phone');
    const { data: unknownReceipt, error: unknownReceiptError } = await testAnonymous()
      .rpc('get_booking_receipt', { p_receipt_hash: receiptHash() });
    expect(unknownReceiptError).toBeNull();
    expect(unknownReceipt).toEqual([]);

    const { error: unauthorizedTransition } = await ordinary.client.rpc('transition_inspection_booking', {
      p_booking_id: pendingId,
      p_status: 'approved',
      p_new_slot_id: null,
      p_outcome: null,
      p_idempotency_key: idempotencyKey(),
    });
    expect(unauthorizedTransition?.code).toBe('42501');

    const { data: careInspections, error: careInspectionReadError } = await customerCare.client
      .from('inspections').select('id').eq('id', pendingId);
    expect(careInspectionReadError).toBeNull();
    expect(careInspections).toEqual([]);
    const { data: careSlots, error: careSlotReadError } = await customerCare.client
      .from('inspection_slots').select('id').eq('id', slotId);
    expect(careSlotReadError).toBeNull();
    expect(careSlots).toEqual([]);
    const { error: careDirectUpdateError } = await customerCare.client.from('inspections')
      .update({ status: 'CONFIRMED' }).eq('id', pendingId);
    expect(careDirectUpdateError?.code).toBe('42501');
    const { error: careTransitionError } = await customerCare.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: pendingId,
        p_status: 'approved',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(careTransitionError?.code).toBe('42501');

    const { data: legalInspections, error: legalInspectionReadError } = await legalStaff.client
      .from('inspections').select('id').eq('id', pendingId);
    expect(legalInspectionReadError).toBeNull();
    expect(legalInspections).toEqual([]);

    const { error: expireError, data: expiredCount } = await testAdmin().rpc('expire_pending_inspections', {
      p_slot_id: slotId,
    });
    expect(expireError).toBeNull();
    expect(expiredCount).toBe(0);
    const { error: setExpiryError } = await testAdmin().from('inspections')
      .update({ reservation_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .in('id', [pendingId, secondPendingId]);
    expect(setExpiryError).toBeNull();
    const { data: releasedCount, error: releaseError } = await testAdmin()
      .rpc('expire_pending_inspections', { p_slot_id: slotId });
    expect(releaseError).toBeNull();
    expect(releasedCount).toBe(2);
    const { data: repeatedRelease, error: repeatedReleaseError } = await testAdmin()
      .rpc('expire_pending_inspections', { p_slot_id: slotId });
    expect(repeatedReleaseError).toBeNull();
    expect(repeatedRelease).toBe(0);
    const { data: expiredReceipt, error: expiredReceiptError } = await testAnonymous()
      .rpc('get_booking_receipt', {
        p_receipt_hash: requireString(pendingStored?.receipt_hash, 'Expired receipt hash'),
      });
    expect(expiredReceiptError).toBeNull();
    expect(expiredReceipt?.[0]?.status).toBe('expired');
    expect(expiredReceipt?.[0]?.gate_details).toBeNull();

    const duplicateKey = idempotencyKey();
    const duplicateHash = receiptHash();
    const [finalRequest, repeatedRequest] = await Promise.all([
      requestFor(4, slotId, duplicateKey, duplicateHash),
      requestFor(4, slotId, duplicateKey, duplicateHash),
    ]);
    expect(finalRequest.error).toBeNull();
    expect(repeatedRequest.error).toBeNull();
    const confirmedCandidate = finalRequest.data?.[0];
    expect(confirmedCandidate?.status).toBe('PENDING_CONFIRMATION');
    bookingId = requireString(confirmedCandidate?.id, 'Inspection booking ID');
    expect(repeatedRequest.data?.[0]?.id).toBe(bookingId);
    const { count: duplicateCount, error: duplicateCountError } = await testAdmin().from('inspections')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key', duplicateKey);
    expect(duplicateCountError).toBeNull();
    expect(duplicateCount).toBe(1);
    const transitionKey = idempotencyKey();
    const { data: approved, error: approvalError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: bookingId,
        p_status: 'approved',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: transitionKey,
      },
    );
    expect(approvalError).toBeNull();
    expect(approved?.[0]?.status).toBe('CONFIRMED');
    expect(approved?.[0]?.gate_details).toMatch(/^G-[A-F0-9]{10}$/);

    const { data: receipt, error: receiptError } = await testAnonymous()
      .rpc('get_booking_receipt', { p_receipt_hash: duplicateHash });
    expect(receiptError).toBeNull();
    expect(receipt?.[0]?.status).toBe('approved');
    expect(receipt?.[0]?.gate_details).toBe(approved?.[0]?.gate_details);
    expect(Date.parse(String(receipt?.[0]?.starts_at))).toBe(startsAt.getTime());
    expect(receipt?.[0]).not.toHaveProperty('email');
    expect(receipt?.[0]).not.toHaveProperty('phone');

    const { data: legacyReceipt, error: legacyReceiptError } = await testAnonymous()
      .rpc('get_inspection_receipt', { p_receipt_hash: duplicateHash });
    expect(legacyReceiptError).toBeNull();
    expect(legacyReceipt?.[0]?.status).toBe('CONFIRMED');
    expect(Date.parse(String(legacyReceipt?.[0]?.starts_at))).toBe(startsAt.getTime());

    const { data: duplicateApproval, error: duplicateApprovalError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: bookingId,
        p_status: 'approved',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: transitionKey,
      },
    );
    expect(duplicateApprovalError).toBeNull();
    expect(duplicateApproval?.[0]?.gate_details).toBe(approved?.[0]?.gate_details);

    const { data: rescheduled, error: rescheduleError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: bookingId,
        p_status: 'rescheduled',
        p_new_slot_id: replacementSlotId,
        p_outcome: null,
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(rescheduleError).toBeNull();
    expect(rescheduled?.[0]?.status).toBe('PENDING_CONFIRMATION');
    expect(rescheduled?.[0]?.slot_id).toBe(replacementSlotId);
    expect(rescheduled?.[0]?.gate_details).toBeNull();
    const { data: rescheduledRow, error: rescheduledRowError } = await testAdmin().from('inspections')
      .select('reservation_expires_at, confirmed_at').eq('id', bookingId).single();
    expect(rescheduledRowError).toBeNull();
    expect(Date.parse(String(rescheduledRow?.reservation_expires_at)) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(rescheduledRow?.confirmed_at).toBeNull();

    const { data: afterReschedule, error: afterRescheduleError } = await testAnonymous()
      .rpc('get_booking_receipt', { p_receipt_hash: duplicateHash });
    expect(afterRescheduleError).toBeNull();
    expect(afterReschedule?.[0]?.status).toBe('pending');
    expect(afterReschedule?.[0]?.gate_details).toBeNull();
    expect(Date.parse(String(afterReschedule?.[0]?.starts_at))).toBe(replacementStartsAt.getTime());
    const { data: originalSlotAvailability } = await testAnonymous().from('public_inspection_slots')
      .select('spaces_remaining').eq('id', slotId);
    expect(originalSlotAvailability?.[0]?.spaces_remaining).toBe(2);

    const { data: reapproved, error: reapprovalError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: bookingId,
        p_status: 'approved',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(reapprovalError).toBeNull();
    expect(reapproved?.[0]?.status).toBe('CONFIRMED');
    expect(reapproved?.[0]?.gate_details).toMatch(/^G-[A-F0-9]{10}$/);
    expect(reapproved?.[0]?.gate_details).not.toBe(approved?.[0]?.gate_details);

    const cancelKey = idempotencyKey();
    const { data: cancelled, error: cancelError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: bookingId,
        p_status: 'cancelled',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: cancelKey,
      },
    );
    expect(cancelError).toBeNull();
    expect(cancelled?.[0]?.status).toBe('CANCELLED');
    expect(cancelled?.[0]?.gate_details).toBeNull();
    const { data: repeatedCancellation, error: repeatedCancellationError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: bookingId,
        p_status: 'cancelled',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(repeatedCancellationError).toBeNull();
    expect(repeatedCancellation?.[0]?.status).toBe('CANCELLED');
    const { data: releasedReplacementSlot } = await testAnonymous().from('public_inspection_slots')
      .select('spaces_remaining').eq('id', replacementSlotId);
    expect(releasedReplacementSlot?.[0]?.spaces_remaining).toBe(1);

    const finalReplacementRequest = await requestFor(5, replacementSlotId);
    expect(finalReplacementRequest.error).toBeNull();
    const completedBookingId = requireString(finalReplacementRequest.data?.[0]?.id, 'Replacement booking ID');
    const { data: replacementApproved, error: replacementApprovalError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: completedBookingId,
        p_status: 'approved',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(replacementApprovalError).toBeNull();
    expect(replacementApproved?.[0]?.status).toBe('CONFIRMED');
    const { data: completed, error: completedError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: completedBookingId,
        p_status: 'completed',
        p_new_slot_id: null,
        p_outcome: 'attended',
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(completedError).toBeNull();
    expect(completed?.[0]?.status).toBe('COMPLETED');
    expect(completed?.[0]?.outcome).toBe('attended');
    const { data: availableReplacementSlot } = await testAnonymous().from('public_inspection_slots')
      .select('spaces_remaining').eq('id', replacementSlotId);
    expect(availableReplacementSlot?.[0]?.spaces_remaining).toBe(1);

    const { error: publishOutOfZoneError } = await platformAdmin.client.from('properties')
      .update({
        publication_state: 'published',
        rental_availability: 'available',
        verification_state: 'vetted',
      })
      .eq('id', outOfZonePropertyId);
    expect(publishOutOfZoneError).toBeNull();
    const outOfZoneStartsAt = new Date(Date.now() + 5 * 86400000);
    const { data: outOfZoneSlot, error: outOfZoneSlotError } = await platformAdmin.client
      .from('inspection_slots').insert({
        property_id: outOfZonePropertyId,
        agent_id: null,
        starts_at: outOfZoneStartsAt.toISOString(),
        ends_at: new Date(outOfZoneStartsAt.getTime() + 90 * 60_000).toISOString(),
        capacity: 1,
        is_active: true,
        transit_buffer_mins: 0,
      }).select('id').single();
    expect(outOfZoneSlotError).toBeNull();
    const outOfZoneSlotId = requireString(outOfZoneSlot?.id, 'Out-of-zone slot ID');
    inspectionSlotIds.push(outOfZoneSlotId);
    const outOfZoneRequest = await requestFor(6, outOfZoneSlotId);
    expect(outOfZoneRequest.error).toBeNull();
    const outOfZoneBookingId = requireString(outOfZoneRequest.data?.[0]?.id, 'Out-of-zone booking ID');
    const { error: outOfZoneLeadError } = await operationsLead.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: outOfZoneBookingId,
        p_status: 'approved',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(outOfZoneLeadError?.code).toBe('42501');
    const { error: outOfZoneAgentError } = await fieldAgent.client.rpc(
      'transition_inspection_booking',
      {
        p_booking_id: outOfZoneBookingId,
        p_status: 'approved',
        p_new_slot_id: null,
        p_outcome: null,
        p_idempotency_key: idempotencyKey(),
      },
    );
    expect(outOfZoneAgentError?.code).toBe('42501');
  });

  it('persists private website conversations, staff notes, and suppresses queued AI work on takeover', async () => {
    const createKey = idempotencyKey();
    const tokenHash = receiptHash();
    const createArgs = {
      p_name: null,
      p_email: null,
      p_phone: null,
      p_initial_message: 'Please share current inspection availability.',
      p_token_hash: tokenHash,
      p_idempotency_key: createKey,
    };
    const { data: created, error: createError } = await testAnonymous()
      .rpc('create_website_conversation', createArgs);
    expect(createError).toBeNull();
    conversationId = requireString(created?.[0]?.conversation_id, 'Website conversation ID');
    const firstMessageId = requireString(created?.[0]?.message_id, 'Initial website message ID');
    const { data: createdConversation } = await testAdmin().from('conversations')
      .select('customer_id').eq('id', conversationId).single();
    websiteCustomerId = requireString(createdConversation?.customer_id, 'Website customer ID');

    const { data: duplicateCreate, error: duplicateCreateError } = await testAnonymous()
      .rpc('create_website_conversation', createArgs);
    expect(duplicateCreateError).toBeNull();
    expect(duplicateCreate?.[0]?.conversation_id).toBe(conversationId);
    expect(duplicateCreate?.[0]?.message_id).toBe(firstMessageId);

    const { error: propertyContextError } = await testAdmin().from('conversations')
      .update({ current_property_id: propertyId })
      .eq('id', conversationId);
    expect(propertyContextError).toBeNull();

    const followUpKey = idempotencyKey();
    const followUpArgs = {
      p_token_hash: tokenHash,
      p_content: 'Could you clarify whether this is for the linked home?',
      p_idempotency_key: followUpKey,
    };
    const { data: followUp, error: followUpError } = await testAnonymous()
      .rpc('submit_website_message', followUpArgs);
    expect(followUpError).toBeNull();
    const followUpMessageId = requireString(followUp?.[0]?.message_id, 'Follow-up message ID');
    const { data: duplicateFollowUp, error: duplicateFollowUpError } = await testAnonymous()
      .rpc('submit_website_message', followUpArgs);
    expect(duplicateFollowUpError).toBeNull();
    expect(duplicateFollowUp?.[0]?.message_id).toBe(followUpMessageId);

    const { data: niaReply, error: niaReplyError } = await testAnonymous()
      .rpc('append_website_nia_reply', {
        p_token_hash: tokenHash,
        p_content: 'I found current inspection information in the site workflow.',
        p_idempotency_key: idempotencyKey(),
        p_context: {
          preferences: { location: 'GRA', bedrooms: 2, keywords: [] },
          recentPropertyIds: [propertyId],
          selectedPropertyId: null,
        },
      });
    expect(niaReplyError).toBeNull();
    const niaReplyId = requireString(niaReply?.[0]?.message_id, 'Persisted Nia reply ID');
    const { data: queuedNiaReply, error: queuedNiaReplyError } = await testAdmin().from('messages')
      .select('delivery_status').eq('id', niaReplyId).single();
    expect(queuedNiaReplyError).toBeNull();
    expect(queuedNiaReply?.delivery_status).toBe('queued');

    const { error: invalidAcknowledgementError } = await testAnonymous()
      .rpc('acknowledge_website_conversation_messages', {
        p_token_hash: receiptHash(),
        p_message_ids: [niaReplyId],
      });
    expect(invalidAcknowledgementError?.code).toBe('42501');
    const { data: niaAcknowledgement, error: niaAcknowledgementError } = await testAnonymous()
      .rpc('acknowledge_website_conversation_messages', {
        p_token_hash: tokenHash,
        p_message_ids: [niaReplyId],
      });
    expect(niaAcknowledgementError).toBeNull();
    expect(niaAcknowledgement?.[0]?.delivery_status).toBe('delivered');
    const { data: duplicateAcknowledgement, error: duplicateAcknowledgementError } = await testAnonymous()
      .rpc('acknowledge_website_conversation_messages', {
        p_token_hash: tokenHash,
        p_message_ids: [niaReplyId],
      });
    expect(duplicateAcknowledgementError).toBeNull();
    expect(duplicateAcknowledgement).toEqual([]);

    const { data: savedThread, error: savedThreadError } = await testAnonymous()
      .rpc('get_website_conversation_v2', { p_token_hash: tokenHash });
    expect(savedThreadError).toBeNull();
    expect(savedThread?.[0]?.nia_context).toMatchObject({
      preferences: { location: 'GRA', bedrooms: 2 },
      recentPropertyIds: [propertyId],
    });
    expect(savedThread?.map((message) => message.sender_type)).toEqual(['customer', 'customer', 'nia']);

    const { data: thread, error: threadError } = await testAnonymous()
      .rpc('get_website_conversation', { p_token_hash: tokenHash });
    expect(threadError).toBeNull();
    expect(thread?.map((message) => message.sender_type)).toEqual(['customer', 'customer', 'nia']);
    const { data: anonymousRows, error: anonymousReadError } = await testAnonymous()
      .from('messages').select('id').eq('conversation_id', conversationId);
    expect(anonymousReadError).not.toBeNull();
    expect(anonymousRows).toBeNull();

    const { data: niaMessage, error: niaMessageError } = await testAdmin().from('messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: 'nia',
      content: 'Local queued AI reply',
      message_type: 'text',
      delivery_status: 'queued',
      idempotency_key: `nia-${suffix}`,
    }).select('id').single();
    expect(niaMessageError).toBeNull();
    const niaMessageId = requireString(niaMessage?.id, 'Queued Nia message ID');
    const { error: outboxError } = await testAdmin().from('message_outbox').insert({
      conversation_id: conversationId,
      message_id: niaMessageId,
      idempotency_key: `outbox-${suffix}`,
    });
    expect(outboxError).toBeNull();

    const { error: takeoverError } = await operationsLead.client.from('conversations')
      .update({ mode: 'HUMAN_ACTIVE', assigned_staff_id: operationsLead.id })
      .eq('id', conversationId);
    expect(takeoverError).toBeNull();
    const { data: handoffNotification, error: handoffNotificationError } = await testAdmin()
      .from('notifications')
      .select('id, status')
      .eq('conversation_id', conversationId)
      .eq('recipient', operationsLead.id)
      .eq('template_key', 'human_handoff_requested')
      .single();
    expect(handoffNotificationError).toBeNull();
    expect(handoffNotification?.status).toBe('queued');
    const handoffNotificationId = requireString(handoffNotification?.id, 'Handoff notification ID');
    const { data: handoffAudit, error: handoffAuditError } = await operationsLead.client
      .from('audit_logs')
      .select('action')
      .eq('entity_type', 'conversation')
      .eq('entity_id', conversationId);
    expect(handoffAuditError).toBeNull();
    expect(handoffAudit?.some((row) => row.action === 'conversation.mode_changed')).toBe(true);
    const { data: ordinaryAudit, error: ordinaryAuditError } = await ordinary.client
      .from('audit_logs')
      .select('id')
      .eq('entity_type', 'conversation')
      .eq('entity_id', conversationId);
    expect(ordinaryAuditError).toBeNull();
    expect(ordinaryAudit).toEqual([]);
    const { data: suppressed, error: suppressedError } = await testAdmin().from('message_outbox')
      .select('state').eq('message_id', niaMessageId).single();
    expect(suppressedError).toBeNull();
    expect(suppressed?.state).toBe('suppressed');
    const { data: suppressedMessage, error: suppressedMessageError } = await testAdmin().from('messages')
      .select('reply_suppressed_at').eq('id', niaMessageId).single();
    expect(suppressedMessageError).toBeNull();
    expect(suppressedMessage?.reply_suppressed_at).not.toBeNull();

    const { data: note, error: noteError } = await operationsLead.client.from('staff_notes').insert({
      entity_type: 'conversation',
      entity_id: conversationId,
      author_id: operationsLead.id,
      note: 'Local integration-only coordinator note.',
    }).select('note').single();
    expect(noteError).toBeNull();
    expect(note?.note).toBe('Local integration-only coordinator note.');

    const { data: resumed, error: resumeError } = await operationsLead.client
      .rpc('return_to_ai', { p_conversation_id: conversationId });
    expect(resumeError).toBeNull();
    expect(rpcField(resumed, 'mode')).toBe('AI_ACTIVE');
    const { data: cancelledNotification, error: cancelledNotificationError } = await testAdmin()
      .from('notifications')
      .select('status')
      .eq('id', handoffNotificationId)
      .single();
    expect(cancelledNotificationError).toBeNull();
    expect(cancelledNotification?.status).toBe('cancelled');
    const { data: remainsSuppressed, error: remainsSuppressedError } = await testAdmin().from('message_outbox')
      .select('state').eq('message_id', niaMessageId).single();
    expect(remainsSuppressedError).toBeNull();
    expect(remainsSuppressed?.state).toBe('suppressed');

    const handoffKey = idempotencyKey();
    const { data: customerHandoff, error: customerHandoffError } = await testAnonymous()
      .rpc('request_website_handoff', {
        p_token_hash: tokenHash,
        p_idempotency_key: `${handoffKey}:handoff`,
      });
    expect(customerHandoffError).toBeNull();
    expect(customerHandoff?.[0]?.mode).toBe('HUMAN_ACTIVE');

    const { data: customerDuringHandoff, error: customerDuringHandoffError } = await testAnonymous()
      .rpc('submit_website_message', {
        p_token_hash: tokenHash,
        p_content: 'I can also attend on Saturday.',
        p_idempotency_key: idempotencyKey(),
      });
    expect(customerDuringHandoffError).toBeNull();
    requireString(customerDuringHandoff?.[0]?.message_id, 'Customer message during takeover');

    const staffReplyKey = idempotencyKey();
    const { data: staffReply, error: staffReplyError } = await platformAdmin.client
      .rpc('send_website_staff_reply', {
        p_conversation_id: conversationId,
        p_content: 'Your website message is received by the Nestly team.',
        p_idempotency_key: staffReplyKey,
      });
    expect(staffReplyError).toBeNull();
    const staffReplyId = requireString(staffReply?.[0]?.message_id, 'Staff website reply ID');
    const { data: queuedStaffReply, error: queuedStaffReplyError } = await testAdmin().from('messages')
      .select('delivery_status').eq('id', staffReplyId).single();
    expect(queuedStaffReplyError).toBeNull();
    expect(queuedStaffReply?.delivery_status).toBe('queued');
    const { data: staffAcknowledgement, error: staffAcknowledgementError } = await testAnonymous()
      .rpc('acknowledge_website_conversation_messages', {
        p_token_hash: tokenHash,
        p_message_ids: [staffReplyId],
      });
    expect(staffAcknowledgementError).toBeNull();
    expect(staffAcknowledgement?.[0]?.delivery_status).toBe('delivered');
    const { error: unauthorizedReplyError } = await ordinary.client
      .rpc('send_website_staff_reply', {
        p_conversation_id: conversationId,
        p_content: 'Unauthorized attempt',
        p_idempotency_key: idempotencyKey(),
      });
    expect(unauthorizedReplyError?.code).toBe('42501');

    const { data: resumedAfterHandoff, error: resumedAfterHandoffError } = await platformAdmin.client
      .rpc('return_to_ai', { p_conversation_id: conversationId });
    expect(resumedAfterHandoffError).toBeNull();
    expect(rpcField(resumedAfterHandoff, 'mode')).toBe('AI_ACTIVE');
  });

  it('signs out the staff client and rejects the session', async () => {
    const { error } = await operationsLead.client.auth.signOut();
    expect(error).toBeNull();
    const { data: { session }, error: sessionError } = await operationsLead.client.auth.getSession();
    expect(sessionError).toBeNull();
    expect(session).toBeNull();
  });
});
