export interface PendingFormSubmission {
  fingerprint: string;
  key: string;
}

export type FormSubmissionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export async function getPendingFormSubmission(
  storage: FormSubmissionStorage,
  storageKey: string,
  payload: Record<string, string | number>,
  createKey: () => string = () => crypto.randomUUID(),
): Promise<PendingFormSubmission> {
  const canonicalPayload = JSON.stringify(
    Object.fromEntries(
      Object.entries(payload).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0),
    ),
  );
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalPayload));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

  let saved: string | null;
  try {
    saved = storage.getItem(storageKey);
  } catch {
    throw new Error('Unable to read the saved retry key. Enable browser session storage and try again.');
  }

  if (saved !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(saved);
    } catch {
      throw new Error('The saved retry key is invalid. Clear this form’s session data before retrying.');
    }
    if (
      parsed && typeof parsed === 'object'
      && 'fingerprint' in parsed && parsed.fingerprint === fingerprint
      && 'key' in parsed && typeof parsed.key === 'string' && parsed.key.trim()
    ) {
      return { fingerprint, key: parsed.key };
    }
  }

  const key = createKey();
  if (!key.trim()) throw new Error('Unable to create an idempotency key');
  const pending = { fingerprint, key };
  try {
    storage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    throw new Error('Unable to save a retry key in this browser. Your form was not submitted.');
  }
  return pending;
}

export function clearPendingFormSubmission(
  storage: FormSubmissionStorage,
  storageKey: string,
): boolean {
  try {
    storage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

export function clearBrowserPendingFormSubmission(storageKey: string): boolean {
  try {
    return clearPendingFormSubmission(window.sessionStorage, storageKey);
  } catch {
    return false;
  }
}

export function isLeadSubmissionReceipt(status: number, body: unknown): boolean {
  if (status !== 202 || !body || typeof body !== 'object') return false;
  const receipt = body as Record<string, unknown>;
  return receipt.requestReceived === true && receipt.confirmed === false;
}

export function parseExpectedAnnualRent(value: string): number | null {
  const normalized = value.trim().replace(/^₦\s*/u, '').replace(/\s/g, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) return null;

  const amount = Number(normalized.replace(/,/g, ''));
  return Number.isFinite(amount) && amount <= 100_000_000_000 ? amount : null;
}
