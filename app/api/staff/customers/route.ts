import { NextResponse } from 'next/server';
import { STAFF_ROLES } from '@/lib/backend/authorization';
import { requireStaff } from '@/lib/backend/staff-context';

export async function GET(request: Request) {
  const { context, response } = await requireStaff(STAFF_ROLES);
  if (response) return response;
  const params = new URL(request.url).searchParams;
  const page = Number(params.get('page') || 1);
  const rawSearch = params.get('search') || '';
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 || rawSearch.length > 120) {
    return NextResponse.json({ error: 'Invalid customer filters' }, { status: 400 });
  }
  // Restrict PostgREST filter syntax; customer-entered text cannot add operators.
  const search = rawSearch.replace(/[^\p{L}\p{N}@+ -]/gu, ' ').trim();
  let query = context.client.from('customers')
    .select('id, display_name, full_name, email, phone, created_at, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false }).order('id');
  if (search) query = query.or(`display_name.ilike.%${search}%,full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  const { data, count, error } = await query.range((page - 1) * 25, page * 25 - 1);
  if (error) return NextResponse.json({ error: 'Unable to load customer records' }, { status: 503 });
  return NextResponse.json({ data, total: count || 0, page, pageSize: 25 }, { headers: { 'Cache-Control': 'private, no-store' } });
}
