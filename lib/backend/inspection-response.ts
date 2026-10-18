type Related<T> = T | T[] | null;

export type InspectionResponseRow = {
  id: string;
  property_id: string;
  customer_id: string;
  slot_id: string;
  status: string;
  outcome: string | null;
  public_reference: string;
  reservation_expires_at: string | null;
  gate_details: string | null;
  confirmed_at: string | null;
  customer_message: string | null;
  created_at: string;
  updated_at: string;
  customer: Related<{
    display_name: string | null;
    email: string | null;
    phone: string | null;
  }>;
  slot: Related<{
    id: string;
    property_id: string;
    agent_id: string | null;
    starts_at: string;
    ends_at: string;
    capacity: number;
    agent: Related<{ full_name: string | null }>;
  }>;
  property: Related<{
    title: string;
    reference: string;
    location: string;
  }>;
};

function one<T>(related: Related<T>): T | null {
  return Array.isArray(related) ? related[0] || null : related;
}

export function normalizeInspectionResponse(row: InspectionResponseRow) {
  const customer = one(row.customer);
  const slot = one(row.slot);
  const property = one(row.property);
  const agent = slot ? one(slot.agent) : null;
  const status = row.status === 'CONFIRMED'
    ? 'approved'
    : row.status === 'PENDING_CONFIRMATION'
      ? 'pending'
      : row.status === 'CANCELLED' && row.outcome === 'reservation_expired'
        ? 'expired'
        : row.status.toLowerCase();

  return {
    ...row,
    status,
    name: customer?.display_name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    message: row.customer_message || '',
    gate_code: row.gate_details,
    property_title: property?.title || row.property_id,
    property_reference: property?.reference || '',
    property_address: property?.location || '',
    slot: slot
      ? {
          ...slot,
          field_agent_id: slot.agent_id,
          field_agent_name: agent?.full_name || 'Unassigned',
        }
      : null,
  };
}
