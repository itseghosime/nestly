import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  from: vi.fn(),
  adminFrom: vi.fn(),
  list: vi.fn(),
  createSignedUrl: vi.fn(),
  role: 'Platform Admin',
  user: { id: '55555555-5555-4555-8555-555555555555' } as { id: string } | null,
  objectPath: '',
}));

vi.mock('@/lib/backend/public-request', () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { POST } from '@/app/api/properties/[id]/media/signed-url/route';

const propertyId = '11111111-1111-4111-8111-111111111111';
const submissionId = '22222222-2222-4222-8222-222222222222';
const mediaId = '33333333-3333-4333-8333-333333333333';
const stagedMediaId = '44444444-4444-4444-8444-444444444444';
const fileName = 'abc123.jpg';
const evidenceObjectPath = `landlord-submissions/${submissionId}/${fileName}`;

function signedUrlRequest() {
  return new Request(`https://nestly.example/api/properties/${propertyId}/media/signed-url`, {
    method: 'POST',
    headers: { Origin: 'https://nestly.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_id: mediaId }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.role = 'Platform Admin';
  mocks.user = { id: '55555555-5555-4555-8555-555555555555' };
  mocks.objectPath = evidenceObjectPath;
  mocks.assertSameOrigin.mockReturnValue(null);
  const queryFor = (table: string) => {
    let columns = '';
    const query = {
      select(value: string) {
        columns = value;
        return query;
      },
      eq() {
        return query;
      },
      is() {
        return query;
      },
      maybeSingle: async () => {
        if (table === 'profiles') return { data: { role: mocks.role }, error: null };
        if (table === 'public_properties' || table === 'properties') {
          return {
            data: columns === 'source_landlord_submission_id'
              ? { source_landlord_submission_id: submissionId }
              : { publication_state: 'draft', rental_availability: 'available', verification_state: 'unverified' },
            error: null,
          };
        }
        if (table === 'property_media' && columns.includes('landlord_submission_media_id')) {
          return { data: { landlord_submission_media_id: stagedMediaId }, error: null };
        }
        if (table === 'property_media') {
          return {
            data: { bucket_id: 'property-drafts', object_path: mocks.objectPath, media_kind: 'evidence' },
            error: null,
          };
        }
        if (table === 'landlord_submission_media') {
          return {
            data: {
              id: stagedMediaId,
              submission_id: submissionId,
              bucket_id: 'property-drafts',
              object_path: evidenceObjectPath,
              upload_status: 'uploaded',
            },
            error: null,
          };
        }
        return { data: null, error: null };
      },
    };
    return query;
  };
  mocks.from.mockImplementation((table: string) => queryFor(table));
  mocks.adminFrom.mockImplementation((table: string) => queryFor(table));
  mocks.createClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    from: mocks.from,
  });
  mocks.list.mockResolvedValue({ data: [{ name: fileName }], error: null });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://storage.example/signed-private-evidence' },
    error: null,
  });
  mocks.createAdminClient.mockReturnValue({
    from: mocks.adminFrom,
    storage: { from: () => ({ list: mocks.list, createSignedUrl: mocks.createSignedUrl }) },
  });
});

describe('private landlord evidence signed URLs', () => {
  it('authorizes linked, uploaded draft evidence for staff and signs it from its private folder', async () => {
    const response = await POST(signedUrlRequest(), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signedUrl: 'https://storage.example/signed-private-evidence' });
    expect(mocks.list).toHaveBeenCalledWith(`landlord-submissions/${submissionId}`, {
      limit: 100,
      search: fileName,
    });
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(evidenceObjectPath, 3600);
  });

  it('does not expose private evidence to an anonymous visitor', async () => {
    mocks.user = null;

    const response = await POST(signedUrlRequest(), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(401);
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('does not sign evidence whose source or staged path does not match the draft', async () => {
    mocks.objectPath = `landlord-submissions/${submissionId}/other.jpg`;

    const response = await POST(signedUrlRequest(), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(404);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('denies private-media access to roles outside the existing media permission set', async () => {
    mocks.role = 'Customer Care';

    const response = await POST(signedUrlRequest(), { params: Promise.resolve({ id: propertyId }) });

    expect(response.status).toBe(403);
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });
});
