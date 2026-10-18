import { createAdminClient } from '@/lib/supabase/admin';
import type { createClient } from '@/lib/supabase/server';

type AuthorizationClient = Awaited<ReturnType<typeof createClient>>;
type StorageAdminClient = ReturnType<typeof createAdminClient>;

export type PropertyMediaStorageRow = {
  id: string;
  property_id: string;
  url: string;
  bucket_id: string | null;
  object_path: string | null;
  media_kind: 'listing' | 'evidence';
  deleted_at: string | null;
  delivery_url?: string;
};

export async function signPropertyMedia<T extends PropertyMediaStorageRow>(
  rows: T[],
  authorizationClient: AuthorizationClient,
  storageAdmin?: StorageAdminClient,
): Promise<{
  rows: Array<T & { delivery_url?: string }>;
  error: string | null;
  missingMediaCount: number;
}> {
  const storedRows = rows.filter((row) => row.bucket_id || row.object_path);
  if (!storedRows.length) return { rows, error: null, missingMediaCount: 0 };

  const malformed = storedRows.find((row) => (
    (row.bucket_id !== 'property-media' && row.bucket_id !== 'property-drafts')
    || !row.object_path
    || !new RegExp(`^${row.property_id}/[^/]+$`).test(row.object_path)
    || (row.media_kind === 'evidence' && row.bucket_id !== 'property-drafts')
  ));
  if (malformed) return { rows: [], error: 'Invalid property media reference', missingMediaCount: 0 };

  const { data: authorizedRows, error: authorizationError } = await authorizationClient
    .from('property_media')
    .select('id, property_id, bucket_id, object_path, media_kind, deleted_at')
    .in('id', storedRows.map((row) => row.id))
    .is('deleted_at', null);
  if (authorizationError) {
    return { rows: [], error: 'Unable to verify property media access', missingMediaCount: 0 };
  }
  const authorizedById = new Map((authorizedRows || []).map((row) => [row.id, row]));
  if (storedRows.some((row) => {
    const authorized = authorizedById.get(row.id);
    return !authorized
      || authorized.property_id !== row.property_id
      || authorized.bucket_id !== row.bucket_id
      || authorized.object_path !== row.object_path
      || authorized.media_kind !== row.media_kind
      || authorized.deleted_at !== null;
  })) {
    return { rows: [], error: 'Property media is not available to this user', missingMediaCount: 0 };
  }

  const publicMedia = storedRows.filter((row) => row.bucket_id === 'property-media');
  let publiclyDiscoverablePropertyIds = new Set<string>();
  if (publicMedia.length) {
    const { data: publishedProperties, error: propertyError } = await authorizationClient
      .from('public_properties')
      .select('id')
      .in('id', [...new Set(publicMedia.map((row) => row.property_id))]);
    if (propertyError) {
      return { rows: [], error: 'Unable to verify media property state', missingMediaCount: 0 };
    }
    publiclyDiscoverablePropertyIds = new Set((publishedProperties || []).map((property) => property.id));
  }

  const needsStaffAccess = storedRows.some((row) => (
    row.bucket_id === 'property-drafts'
    || row.media_kind === 'evidence'
    || (row.bucket_id === 'property-media' && !publiclyDiscoverablePropertyIds.has(row.property_id))
  ));
  let hasStaffAccess = false;
  if (needsStaffAccess) {
    const { data: { user }, error: userError } = await authorizationClient.auth.getUser();
    if (userError) return { rows: [], error: 'Unable to verify media requester', missingMediaCount: 0 };
    if (!user) {
      return { rows: [], error: 'Authentication is required for private media', missingMediaCount: 0 };
    }
    const { data: profile, error: profileError } = await authorizationClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) {
      return { rows: [], error: 'Unable to verify media requester authority', missingMediaCount: 0 };
    }
    hasStaffAccess = Boolean(profile && [
      'Platform Admin', 'Operations Lead', 'Field Vetting Agent',
    ].includes(profile.role));
    if (!hasStaffAccess) {
      return { rows: [], error: 'Private media is not available to this user', missingMediaCount: 0 };
    }
  }

  if (
    publicMedia.some((row) => !publiclyDiscoverablePropertyIds.has(row.property_id))
    && !hasStaffAccess
  ) {
    return { rows: [], error: 'Listing media is not publicly available', missingMediaCount: 0 };
  }

  const admin = storageAdmin ?? createAdminClient();
  const signed = await Promise.all(storedRows.map(async (row) => {
    const bucket = row.bucket_id;
    const path = row.object_path;
    if (!bucket || !path) {
      return { row, url: null, error: new Error('Invalid property media reference') };
    }
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 3600);
    return { row, url: data?.signedUrl || null, error };
  }));
  const missingObjectIds = new Set(
    signed
      .filter((entry) => isMissingStorageObject(entry.error))
      .map((entry) => entry.row.id),
  );
  const failure = signed.find((entry) => (
    (entry.error && !isMissingStorageObject(entry.error))
    || (!entry.error && !entry.url)
  ));
  if (failure) {
    return {
      rows: [],
      error: failure.error ? getErrorMessage(failure.error) : 'No signed URL returned',
      missingMediaCount: missingObjectIds.size,
    };
  }

  const urls = new Map<T, string>();
  for (const entry of signed) {
    if (missingObjectIds.has(entry.row.id)) continue;
    if (!entry.url) {
      return { rows: [], error: 'No signed URL returned', missingMediaCount: missingObjectIds.size };
    }
    urls.set(entry.row, entry.url);
  }
  return {
    rows: rows
      .filter((row) => !missingObjectIds.has(row.id))
      .map((row) => ({
        ...row,
        ...(urls.has(row) ? { delivery_url: urls.get(row) || undefined } : {}),
      })),
    error: null,
    missingMediaCount: missingObjectIds.size,
  };
}

function getErrorMessage(error: unknown): string {
  return (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
  ) ? error.message : 'Unable to sign property media';
}

function isMissingStorageObject(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'StorageApiError'
    && 'code' in error
    && error.code === 'NoSuchKey'
  );
}

export async function promoteListingMediaToPublic(
  propertyId: string,
  admin: StorageAdminClient = createAdminClient(),
): Promise<string | null> {
  const { data: mediaRows, error: mediaError } = await admin
    .from('property_media')
    .select('id, bucket_id, object_path')
    .eq('property_id', propertyId)
    .eq('media_kind', 'listing')
    .is('deleted_at', null);
  if (mediaError) return 'Unable to load listing media for publication';

  for (const media of mediaRows || []) {
    if (media.bucket_id === 'property-media') continue;
    if (
      media.bucket_id !== 'property-drafts'
      || !media.object_path
      || !new RegExp(`^${propertyId}/[^/]+$`).test(media.object_path)
    ) {
      return 'A listing photo has an invalid private-storage reference';
    }

    const { data: source, error: downloadError } = await admin
      .storage.from('property-drafts').download(media.object_path);
    if (downloadError || !source) return 'Unable to read a listing photo for publication';

    const fileName = media.object_path.split('/').at(-1) || '';
    const destination = `${propertyId}/${crypto.randomUUID()}-${fileName}`;
    const { error: uploadError } = await admin.storage.from('property-media').upload(
      destination,
      source,
      { contentType: source.type || 'application/octet-stream', upsert: false },
    );
    if (uploadError) return 'Unable to promote a listing photo to public media storage';

    const { error: updateError } = await admin.from('property_media')
      .update({
        bucket_id: 'property-media',
        object_path: destination,
        url: `property-media/${destination}`,
        media_url: `property-media/${destination}`,
      })
      .eq('id', media.id)
      .eq('property_id', propertyId)
      .eq('bucket_id', 'property-drafts')
      .eq('object_path', media.object_path)
      .is('deleted_at', null);
    if (updateError) {
      const { error: cleanupError } = await admin.storage.from('property-media').remove([destination]);
      if (cleanupError) console.error('Failed to clean up unpublished listing media', cleanupError.message);
      return 'Unable to update a listing photo for publication';
    }

    const { error: removeError } = await admin.storage
      .from('property-drafts').remove([media.object_path]);
    if (removeError) {
      console.error('Failed to remove the private source after media promotion', removeError.message);
    }
  }
  return null;
}
