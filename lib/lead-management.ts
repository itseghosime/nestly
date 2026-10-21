import { z } from 'zod';

export const CONTACT_STATUSES = ['new', 'in_review', 'responded', 'closed'] as const;
export const LANDLORD_STATUSES = ['new', 'in_review', 'accepted', 'rejected'] as const;
export type LeadKind = 'contact' | 'landlord';

export function leadStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase());
}

export const leadUpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict();
