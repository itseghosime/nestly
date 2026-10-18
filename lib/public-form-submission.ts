export interface PendingFormSubmission {
  fingerprint: string;
  key: string;
}

export function getPendingFormSubmission(
  previous: PendingFormSubmission | null,
  payload: Record<string, string | number>,
  createKey: () => string = () => crypto.randomUUID(),
): PendingFormSubmission {
  const fingerprint = JSON.stringify(payload);
  if (previous?.fingerprint === fingerprint) return previous;

  const key = createKey();
  if (!key.trim()) throw new Error('Unable to create an idempotency key');
  return { fingerprint, key };
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
