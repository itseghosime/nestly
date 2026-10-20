export type StaffCustomer = {
  id: string; display_name: string | null; full_name: string | null;
  email: string | null; phone: string | null; created_at: string; updated_at: string;
};
export type StaffCustomerDetail = {
  customer: StaffCustomer;
  conversations: { id: string; channel: string; mode: string; updated_at: string }[];
  conversationCount: number;
  inspections: { id: string; status: string; created_at: string }[];
  inspectionCount: number;
  enquiries: { id: string; message: string; status: string; created_at: string }[];
  enquiryCount: number;
  submissions: { id: string; property_type: string; city: string; state: string; status: string; created_at: string }[];
  submissionCount: number;
};
export function customerName(customer: StaffCustomer) {
  return customer.display_name || customer.full_name || 'Unnamed customer';
}
export function staffDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(value));
}
