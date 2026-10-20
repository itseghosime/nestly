import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  guardPublicRequest: vi.fn(),
  createClient: vi.fn(),
  rpc: vi.fn(),
  deriveReceiptToken: vi.fn(),
  hashReceiptToken: vi.fn(),
  requireStaff: vi.fn(),
  staffFrom: vi.fn(),
  staffSelect: vi.fn(),
  staffOrder: vi.fn(),
  staffLimit: vi.fn(),
}));

vi.mock('@/lib/backend/public-request', () => ({
  assertSameOrigin: vi.fn(() => null),
  getIdempotencyKey: (request: Request) => request.headers.get('idempotency-key'),
  guardPublicRequest: routeMocks.guardPublicRequest,
  deriveReceiptToken: routeMocks.deriveReceiptToken,
  hashReceiptToken: routeMocks.hashReceiptToken,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: routeMocks.createClient,
}));

vi.mock('@/lib/backend/staff-context', () => ({
  requireStaff: routeMocks.requireStaff,
}));

import { GET as loadContactEnquiries, POST as submitContactEnquiry } from '@/app/api/leads/contact/route';
import { GET as loadLandlordSubmissions, POST as submitLandlordProperty } from '@/app/api/leads/landlord/route';

const contactPayload = {
  name: 'Synthetic Contact',
  email: 'CONTACT@example.test',
  phone: '+15555550123',
  message: 'Synthetic enquiry; no real customer contact.',
};

const landlordPayload = {
  name: 'Synthetic Owner',
  email: 'OWNER@example.test',
  phone: '+15555550124',
  propertyType: 'apartment',
  state: 'Edo',
  city: 'Benin City',
  neighborhood: 'Synthetic Test District',
  address: 'SYNTHETIC ONLY — no real address',
  bedrooms: 2,
  expectedAnnualRent: 2_500_000.5,
  description: 'Synthetic release test; owner-reported details.',
};

function requestWithKey(path: string, payload: unknown, key: string): Request {
  return new Request(`https://nestly.example${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(payload),
  });
}

describe('public lead receipt-backed submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.guardPublicRequest.mockResolvedValue(null);
    routeMocks.deriveReceiptToken.mockImplementation((scope: string, key: string) => `${scope}:${key}`);
    routeMocks.hashReceiptToken.mockImplementation((token: string) => `hash:${token}`);
    routeMocks.createClient.mockResolvedValue({ rpc: routeMocks.rpc });
    routeMocks.rpc.mockResolvedValue({
      data: [{ status: 'new', public_reference: 'SYNTHETIC-REFERENCE' }],
      error: null,
    });
    const staffQuery = {
      select: routeMocks.staffSelect,
      order: routeMocks.staffOrder,
      limit: routeMocks.staffLimit,
    };
    routeMocks.staffFrom.mockReturnValue(staffQuery);
    routeMocks.staffSelect.mockReturnValue(staffQuery);
    routeMocks.staffOrder.mockReturnValue(staffQuery);
    routeMocks.staffLimit.mockResolvedValue({ data: [], error: null });
    routeMocks.requireStaff.mockResolvedValue({
      context: {
        client: { from: routeMocks.staffFrom },
        role: 'Customer Care',
        userId: 'synthetic-staff-id',
      },
      response: null,
    });
  });

  it('loads contact enquiries through their linked customer record for authorized staff', async () => {
    routeMocks.staffLimit.mockResolvedValue({
      data: [{
        id: 'synthetic-enquiry-id',
        customer_id: 'synthetic-customer-id',
        property_id: null,
        message: 'Synthetic enquiry',
        status: 'new',
        created_at: '2026-10-20T00:00:00.000Z',
        updated_at: '2026-10-20T00:00:00.000Z',
        customer: {
          display_name: 'Synthetic Contact',
          full_name: 'Synthetic Contact',
          email: 'contact@example.test',
          phone: '+15555550123',
        },
      }],
      error: null,
    });

    const response = await loadContactEnquiries();

    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({
      id: 'synthetic-enquiry-id',
      name: 'Synthetic Contact',
      email: 'contact@example.test',
      phone: '+15555550123',
      message: 'Synthetic enquiry',
    });
    expect(routeMocks.staffFrom).toHaveBeenCalledWith('contact_enquiries');
    expect(routeMocks.staffSelect).toHaveBeenCalledWith(expect.stringContaining('customer:customers!contact_enquiries_customer_id_fkey'));
    expect(routeMocks.requireStaff).toHaveBeenCalledWith(['Platform Admin', 'Operations Lead', 'Customer Care']);
  });

  it('loads landlord submissions through their linked customer record for authorized staff', async () => {
    routeMocks.staffLimit.mockResolvedValue({
      data: [{
        id: 'synthetic-submission-id',
        customer_id: 'synthetic-customer-id',
        property_type: 'Apartment',
        state: 'Edo',
        city: 'Benin City',
        neighborhood: 'Synthetic District',
        address: 'SYNTHETIC ONLY',
        bedrooms: 2,
        expected_annual_rent: 2_500_000.5,
        description: 'Synthetic details',
        status: 'new',
        created_at: '2026-10-20T00:00:00.000Z',
        updated_at: '2026-10-20T00:00:00.000Z',
        customer: {
          display_name: 'Synthetic Owner',
          full_name: 'Synthetic Owner',
          email: 'owner@example.test',
          phone: '+15555550124',
        },
      }],
      error: null,
    });

    const response = await loadLandlordSubmissions();

    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({
      id: 'synthetic-submission-id',
      name: 'Synthetic Owner',
      email: 'owner@example.test',
      phone: '+15555550124',
      expected_annual_rent: 2_500_000.5,
    });
    expect(routeMocks.staffFrom).toHaveBeenCalledWith('landlord_submissions');
    expect(routeMocks.staffSelect).toHaveBeenCalledWith(expect.stringContaining('customer:customers!landlord_submissions_customer_id_fkey'));
    expect(routeMocks.requireStaff).toHaveBeenCalledWith(['Platform Admin', 'Operations Lead', 'Field Vetting Agent', 'Legal & Compliance']);
  });

  it('submits contact enquiries through the database receipt function and reuses the same key on retry', async () => {
    const key = 'contact-retry-key-0001';
    const firstResponse = await submitContactEnquiry(
      requestWithKey('/api/leads/contact', contactPayload, key),
    );
    const retryResponse = await submitContactEnquiry(
      requestWithKey('/api/leads/contact', contactPayload, key),
    );

    expect(firstResponse.status).toBe(202);
    expect(await firstResponse.json()).toEqual({ requestReceived: true, confirmed: false });
    expect(retryResponse.status).toBe(202);
    expect(await retryResponse.json()).toEqual({ requestReceived: true, confirmed: false });
    expect(routeMocks.deriveReceiptToken).toHaveBeenNthCalledWith(1, 'contact-enquiry', key);
    expect(routeMocks.rpc).toHaveBeenCalledTimes(2);
    expect(routeMocks.rpc.mock.calls[0]).toEqual(routeMocks.rpc.mock.calls[1]);
    expect(routeMocks.rpc).toHaveBeenCalledWith('submit_contact_enquiry', {
      p_property_id: null,
      p_name: contactPayload.name,
      p_email: 'contact@example.test',
      p_phone: contactPayload.phone,
      p_message: contactPayload.message,
      p_receipt_hash: `hash:contact-enquiry:${key}`,
      p_idempotency_key: key,
    });
  });

  it('submits landlord details via the receipt function without losing decimal rent', async () => {
    const key = 'landlord-retry-key-0001';
    const response = await submitLandlordProperty(
      requestWithKey('/api/leads/landlord', landlordPayload, key),
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ requestReceived: true, confirmed: false });
    expect(routeMocks.deriveReceiptToken).toHaveBeenCalledWith('landlord-submission', key);
    expect(routeMocks.rpc).toHaveBeenCalledWith('submit_landlord_submission', {
      p_name: landlordPayload.name,
      p_email: 'owner@example.test',
      p_phone: landlordPayload.phone,
      p_property_type: landlordPayload.propertyType,
      p_state: landlordPayload.state,
      p_city: landlordPayload.city,
      p_neighborhood: landlordPayload.neighborhood,
      p_address: landlordPayload.address,
      p_bedrooms: landlordPayload.bedrooms,
      p_expected_annual_rent: 2_500_000.5,
      p_description: landlordPayload.description,
      p_receipt_hash: `hash:landlord-submission:${key}`,
      p_idempotency_key: key,
    });
  });

  it('does not treat an idempotency conflict as a confirmed receipt', async () => {
    routeMocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '23505' },
    });

    const response = await submitLandlordProperty(
      requestWithKey('/api/leads/landlord', landlordPayload, 'landlord-conflict-key-001'),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Idempotency key was reused' });
  });
});
