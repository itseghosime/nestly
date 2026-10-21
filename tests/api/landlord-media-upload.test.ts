import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guardPublicRequest: vi.fn(),
  getIdempotencyKey: vi.fn(),
  deriveReceiptToken: vi.fn(),
  hashReceiptToken: vi.fn(),
  createAdminClient: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/backend/public-request', () => ({
  guardPublicRequest: mocks.guardPublicRequest,
  getIdempotencyKey: mocks.getIdempotencyKey,
  deriveReceiptToken: mocks.deriveReceiptToken,
  hashReceiptToken: mocks.hashReceiptToken,
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { POST } from '@/app/api/leads/landlord/media/route';

const submissionId = '11111111-1111-4111-8111-111111111111';
const stagedId = '22222222-2222-4222-8222-222222222222';
const propertyId = '33333333-3333-4333-8333-333333333333';
const staged = {
  id: stagedId,
  submission_id: submissionId,
  bucket_id: 'property-drafts',
  object_path: `landlord-submissions/${submissionId}/abc123.jpg`,
};
let submissionFound = true;
let convertedPropertyId: string | null = null;
let stagedRows: typeof staged[] = [];
let evidenceRow: { id: string; property_id: string } | null = null;

function requestWith(files: File[]) {
  const body = new FormData();
  files.forEach((file) => body.append('photos', file));
  return new Request('https://nestly.example/api/leads/landlord/media', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'synthetic-submission-key' },
    body,
  });
}

function jpegFile(name = 'front.jpg', bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00])) {
  return new File([bytes], name, { type: 'image/jpeg' });
}

beforeEach(() => {
  vi.resetAllMocks();
  submissionFound = true;
  convertedPropertyId = null;
  stagedRows = [staged];
  evidenceRow = { id: '44444444-4444-4444-8444-444444444444', property_id: propertyId };
  mocks.guardPublicRequest.mockResolvedValue(null);
  mocks.getIdempotencyKey.mockReturnValue('synthetic-submission-key');
  mocks.deriveReceiptToken.mockReturnValue('receipt-token');
  mocks.hashReceiptToken.mockReturnValue('receipt-hash');

  const createQuery = (table: string) => {
    let columns = '';
    const query: {
      select: (value: string) => typeof query;
      eq: () => typeof query;
      maybeSingle: () => Promise<unknown>;
      single: () => Promise<unknown>;
      upsert: (value: Record<string, unknown>, options: Record<string, unknown>) => typeof query;
      update: (value: Record<string, unknown>) => typeof query;
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
    } = {
      select(value) {
        columns = value;
        return query;
      },
      eq() {
        return query;
      },
      maybeSingle: async () => ({
        data: table === 'landlord_submissions' && columns.startsWith('id, status')
          ? submissionFound ? { id: submissionId, status: 'new', converted_property_id: convertedPropertyId } : null
          : evidenceRow,
        error: null,
      }),
      single: async () => ({
        data: { converted_property_id: convertedPropertyId },
        error: null,
      }),
      upsert(value, options) {
        mocks.upsert(value, options);
        return query;
      },
      update(value) {
        mocks.update(value);
        return query;
      },
      then(resolve, reject) {
        const data = table === 'landlord_submission_media'
          ? stagedRows
          : table === 'property_media'
            ? evidenceRow
            : null;
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  };

  mocks.from.mockImplementation((table: string) => createQuery(table));
  mocks.upload.mockResolvedValue({ error: null });
  mocks.rpc.mockImplementation(async (name: string) => (
    name === 'reserve_landlord_submission_media'
      ? { data: [staged], error: null }
      : { data: [{ submission_id: submissionId, converted_property_id: convertedPropertyId }], error: null }
  ));
  mocks.createAdminClient.mockReturnValue({
    from: mocks.from,
    rpc: mocks.rpc,
    storage: { from: () => ({ upload: mocks.upload }) },
  });
});

describe('private landlord photo uploads', () => {
  it('stores valid image bytes privately and makes identical content idempotent', async () => {
    const file = jpegFile();
    const response = await POST(requestWith([file, jpegFile('duplicate.jpg')]));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ uploaded: 1 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_landlord_submission_media', expect.objectContaining({
      p_receipt_hash: 'receipt-hash',
      p_mime_type: 'image/jpeg',
    }));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(staged.object_path, expect.any(Buffer), {
      contentType: 'image/jpeg',
      upsert: true,
    });
  });

  it('rejects a missing or unrelated submission receipt before reserving media', async () => {
    submissionFound = false;

    const response = await POST(requestWith([jpegFile()]));

    expect(response.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('rejects forged image bytes, excess files, and combined payloads over the limit', async () => {
    const invalidImage = new File([Buffer.from('not an image')], 'fake.jpg', { type: 'image/jpeg' });
    expect((await POST(requestWith([invalidImage]))).status).toBe(400);
    expect((await POST(requestWith(Array.from({ length: 6 }, () => jpegFile())))).status).toBe(400);

    const overFileLimit = Buffer.alloc(4 * 1024 * 1024 + 1);
    overFileLimit.set([0xff, 0xd8, 0xff]);
    expect((await POST(requestWith([jpegFile('large.jpg', overFileLimit)]))).status).toBe(413);

    const largeBytes = Buffer.alloc(2_100_000);
    largeBytes.set([0xff, 0xd8, 0xff]);
    const overLimit = await POST(requestWith([
      jpegFile('one.jpg', largeBytes),
      jpegFile('two.jpg', largeBytes),
    ]));
    expect(overLimit.status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('keeps storage and confirmation failures retryable with the same receipt', async () => {
    mocks.upload.mockResolvedValueOnce({ error: { name: 'StorageError' } });
    const storageFailure = await POST(requestWith([jpegFile()]));
    expect(storageFailure.status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.rpc.mockResolvedValueOnce({ data: [staged], error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'XX000' } });
    const confirmationFailure = await POST(requestWith([jpegFile()]));
    expect(confirmationFailure.status).toBe(503);
    expect((await confirmationFailure.json()).error).toContain('Retry with the same submission');

    const retry = await POST(requestWith([jpegFile()]));
    expect(retry.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.upload.mock.calls.map(([path]) => path)).toEqual([
      staged.object_path,
      staged.object_path,
      staged.object_path,
    ]);
  });

  it('links uploaded photos to a converted draft only as private evidence', async () => {
    convertedPropertyId = propertyId;
    stagedRows = [staged];

    const response = await POST(requestWith([jpegFile()]));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      property_id: propertyId,
      url: `property-drafts/${staged.object_path}`,
      bucket_id: 'property-drafts',
      object_path: staged.object_path,
      media_kind: 'evidence',
    }), { onConflict: 'landlord_submission_media_id', ignoreDuplicates: true });
    expect(mocks.update).toHaveBeenCalledWith({ property_media_id: evidenceRow?.id });
  });
});
