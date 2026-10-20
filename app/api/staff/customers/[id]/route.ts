import { NextResponse } from 'next/server';
import { z } from 'zod';
import { STAFF_ROLES } from '@/lib/backend/authorization';
import { requireStaff } from '@/lib/backend/staff-context';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { context, response } = await requireStaff(STAFF_ROLES);
  if (response) return response;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Customer unavailable' }, { status: 404 });
  const customer = await context.client.from('customers')
    .select('id, display_name, full_name, email, phone, created_at, updated_at').eq('id', id).maybeSingle();
  if (customer.error) return NextResponse.json({ error: 'Unable to load customer record' }, { status: 503 });
  if (!customer.data) return NextResponse.json({ error: 'Customer unavailable' }, { status: 404 });
  const [conversations, inspections, enquiries, submissions] = await Promise.all([
    context.client.from('conversations').select('id, channel, mode, updated_at', { count: 'exact' }).eq('customer_id', id).order('updated_at', { ascending: false }).limit(20),
    context.client.from('inspections').select('id, status, created_at', { count: 'exact' }).eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    context.client.from('contact_enquiries').select('id, message, status, created_at', { count: 'exact' }).eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    context.client.from('landlord_submissions').select('id, property_type, city, state, status, created_at', { count: 'exact' }).eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  if ([conversations, inspections, enquiries, submissions].some(result => result.error)) {
    return NextResponse.json({ error: 'Unable to load customer activity' }, { status: 503 });
  }
  return NextResponse.json({ data: { customer: customer.data,
    conversations: conversations.data, conversationCount: conversations.count,
    inspections: inspections.data, inspectionCount: inspections.count,
    enquiries: enquiries.data, enquiryCount: enquiries.count,
    submissions: submissions.data, submissionCount: submissions.count,
  } }, { headers: { 'Cache-Control': 'private, no-store' } });
}
