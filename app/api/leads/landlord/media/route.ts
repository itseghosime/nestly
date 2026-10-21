import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import {
  deriveReceiptToken,
  getIdempotencyKey,
  guardPublicRequest,
  hashReceiptToken,
} from '@/lib/backend/public-request';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_PHOTOS_PER_REQUEST = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

type SupportedImage = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';
  bytes: Buffer;
  sha256: string;
};

function detectImage(bytes: Buffer): SupportedImage['mimeType'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brands = bytes.toString('ascii', 8, Math.min(bytes.length, 64));
    if (brands.includes('avif') || brands.includes('avis')) return 'image/avif';
  }
  return null;
}

async function linkEvidenceToDraft(
  admin: ReturnType<typeof createAdminClient>,
  staged: { id: string; submission_id: string; bucket_id: string; object_path: string },
  propertyId: string,
) {
  const { data: created, error: createError } = await admin.from('property_media')
    .upsert({
      property_id: propertyId,
      url: `${staged.bucket_id}/${staged.object_path}`,
      bucket_id: staged.bucket_id,
      object_path: staged.object_path,
      media_kind: 'evidence',
      sort_order: 0,
      landlord_submission_media_id: staged.id,
    }, { onConflict: 'landlord_submission_media_id', ignoreDuplicates: true })
    .select('id, property_id')
    .maybeSingle();
  if (createError) return false;
  let linked = created;
  if (!linked) {
    const { data, error } = await admin.from('property_media')
      .select('id, property_id')
      .eq('landlord_submission_media_id', staged.id)
      .maybeSingle();
    if (error) return false;
    linked = data;
  }
  if (!linked || linked.property_id !== propertyId) return false;
  const { error: stageError } = await admin.from('landlord_submission_media')
    .update({ property_media_id: linked.id })
    .eq('id', staged.id)
    .eq('submission_id', staged.submission_id);
  return !stageError;
}

export async function POST(request: Request) {
  const rejected = await guardPublicRequest(request, 'landlord-photo-upload', {
    maxRequests: 12,
    windowSeconds: 3600,
  });
  if (rejected) return rejected;

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return NextResponse.json({ error: 'A valid Idempotency-Key is required' }, { status: 400 });
  const receiptToken = deriveReceiptToken('landlord-submission', idempotencyKey);
  if (!receiptToken) return NextResponse.json({ error: 'Property submission receipts are not configured' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid photo upload request' }, { status: 400 });
  }
  const files = form.getAll('photos');
  if (
    files.length === 0
    || files.length > MAX_PHOTOS_PER_REQUEST
    || files.some((file) => typeof file === 'string' || !(file instanceof File))
  ) {
    return NextResponse.json({ error: 'Attach between one and five supported image files' }, { status: 400 });
  }

  let totalBytes = 0;
  const images = new Map<string, SupportedImage>();
  for (const item of files) {
    if (!(item instanceof File) || item.size < 1 || item.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Each photo must be no larger than 4MB' }, { status: 413 });
    }
    totalBytes += item.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'The combined photo upload must be no larger than 4MB' }, { status: 413 });
    }
    const bytes = Buffer.from(await item.arrayBuffer());
    const mimeType = detectImage(bytes);
    if (!mimeType || (item.type && item.type !== mimeType && !(mimeType === 'image/jpeg' && item.type === 'image/jpg'))) {
      return NextResponse.json({ error: 'Photos must be valid JPEG, PNG, WebP, or AVIF images' }, { status: 400 });
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    images.set(sha256, { mimeType, bytes, sha256 });
  }

  const admin = createAdminClient();
  const receiptHash = hashReceiptToken(receiptToken);
  const { data: submission, error: submissionError } = await admin.from('landlord_submissions')
    .select('id, status, converted_property_id')
    .eq('receipt_hash', receiptHash)
    .maybeSingle();
  if (submissionError) {
    console.error('Landlord photo receipt lookup failed', submissionError.code);
    return NextResponse.json({ error: 'Unable to verify the property submission receipt' }, { status: 503 });
  }
  if (!submission) return NextResponse.json({ error: 'Property submission not found or inaccessible' }, { status: 404 });
  if (submission.status === 'rejected') {
    return NextResponse.json({ error: 'Photos cannot be added to a rejected submission' }, { status: 409 });
  }

  for (const image of images.values()) {
    const { data, error } = await admin.rpc('reserve_landlord_submission_media', {
      p_receipt_hash: receiptHash,
      p_content_sha256: image.sha256,
      p_mime_type: image.mimeType,
      p_size_bytes: image.bytes.byteLength,
    });
    if (error) {
      if (error.code === 'P0002') return NextResponse.json({ error: 'Property submission not found or inaccessible' }, { status: 404 });
      if (error.code === '55000') return NextResponse.json({ error: 'Photos cannot be added to a rejected submission' }, { status: 409 });
      if (error.code === '23514') return NextResponse.json({ error: 'A maximum of five distinct photos may be attached' }, { status: 400 });
      if (error.code === '22023') return NextResponse.json({ error: 'Invalid photo upload' }, { status: 400 });
      console.error('Landlord photo reservation failed', error.code);
      return NextResponse.json({ error: 'Unable to prepare the private photo upload' }, { status: 503 });
    }
    const staged = Array.isArray(data) ? data[0] : data;
    if (!staged) return NextResponse.json({ error: 'Unable to confirm the private photo upload' }, { status: 503 });

    const { error: uploadError } = await admin.storage.from('property-drafts').upload(
      staged.object_path,
      image.bytes,
      { contentType: image.mimeType, upsert: true },
    );
    if (uploadError) {
      console.error('Private landlord photo upload failed', uploadError.name);
      return NextResponse.json({ error: 'Unable to store the photo privately. Retry with the same submission.' }, { status: 503 });
    }
    const { data: confirmation, error: confirmError } = await admin.rpc('mark_landlord_submission_media_uploaded', {
      p_receipt_hash: receiptHash,
      p_media_id: staged.id,
    });
    if (confirmError) {
      if (confirmError.code === 'P0002') return NextResponse.json({ error: 'Property submission not found or inaccessible' }, { status: 404 });
      if (confirmError.code === '55000') return NextResponse.json({ error: 'Photos cannot be added to a rejected submission' }, { status: 409 });
      console.error('Private landlord photo confirmation failed', confirmError.code);
      return NextResponse.json({ error: 'Photo storage succeeded but confirmation failed. Retry with the same submission.' }, { status: 503 });
    }
    if (!confirmation || (Array.isArray(confirmation) && confirmation.length === 0)) {
      return NextResponse.json({ error: 'Photo storage succeeded but confirmation failed. Retry with the same submission.' }, { status: 503 });
    }
  }

  const { data: refreshedSubmission, error: refreshError } = await admin.from('landlord_submissions')
    .select('converted_property_id')
    .eq('id', submission.id)
    .single();
  if (refreshError) {
    console.error('Landlord photo draft-link lookup failed', refreshError.code);
    return NextResponse.json({ error: 'Photos are stored privately but draft linkage could not be confirmed' }, { status: 503 });
  }
  if (refreshedSubmission.converted_property_id) {
    const { data: uploadedMedia, error: mediaError } = await admin.from('landlord_submission_media')
      .select('id, submission_id, bucket_id, object_path')
      .eq('submission_id', submission.id)
      .eq('upload_status', 'uploaded');
    if (mediaError) {
      console.error('Landlord staged photo lookup failed', mediaError.code);
      return NextResponse.json({ error: 'Photos are stored privately but draft linkage could not be confirmed' }, { status: 503 });
    }
    for (const staged of uploadedMedia || []) {
      if (!await linkEvidenceToDraft(admin, staged, refreshedSubmission.converted_property_id)) {
        console.error('Landlord photo draft linkage failed');
        return NextResponse.json({ error: 'Photos are stored privately but draft linkage could not be confirmed' }, { status: 503 });
      }
    }
  }

  return NextResponse.json({ uploaded: images.size }, { headers: { 'Cache-Control': 'no-store' } });
}
