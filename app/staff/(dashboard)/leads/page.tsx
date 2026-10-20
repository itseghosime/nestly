'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { RefreshCw } from 'lucide-react';
import { StaffHeader } from '@/components/staff/StaffHeader';

const contactEnquirySchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  message: z.string(),
  status: z.string(),
  created_at: z.string(),
});

const landlordSubmissionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  property_type: z.string(),
  state: z.string(),
  city: z.string(),
  neighborhood: z.string(),
  address: z.string(),
  bedrooms: z.number(),
  expected_annual_rent: z.number(),
  description: z.string(),
  status: z.string(),
  created_at: z.string(),
});

type ContactEnquiry = z.infer<typeof contactEnquirySchema>;
type LandlordSubmission = z.infer<typeof landlordSubmissionSchema>;
type QueueState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T[] }
  | { status: 'forbidden' }
  | { status: 'error'; message: string };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(date);
}

function formatRent(value: number) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function loadQueue<T>(
  url: string,
  schema: z.ZodType<{ data: T[] }>,
): Promise<QueueState<T>> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (response.status === 403) return { status: 'forbidden' };

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        && typeof payload.error === 'string'
        ? payload.error
        : `Unable to load ${url.includes('contact') ? 'contact enquiries' : 'landlord submissions'}`;
      return { status: 'error', message };
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) return { status: 'error', message: 'The server returned invalid lead data.' };
    return { status: 'ready', data: parsed.data.data };
  } catch {
    return { status: 'error', message: 'Unable to connect to the staff lead service.' };
  }
}

function ContactQueue({ state }: { state: QueueState<ContactEnquiry> }) {
  return (
    <section className="rounded-3xl border border-hairline bg-white p-5 shadow-sm sm:p-6">
      <h2 className="font-headline text-lg font-bold text-charcoal">Contact enquiries</h2>
      {state.status === 'loading' ? (
        <p className="mt-4 text-sm text-muted-ink">Loading contact enquiries…</p>
      ) : state.status === 'forbidden' ? (
        <p className="mt-4 text-sm text-muted-ink">Your staff role does not have access to contact enquiries.</p>
      ) : state.status === 'error' ? (
        <p role="alert" className="mt-4 text-sm text-red-800">{state.message}</p>
      ) : state.data.length === 0 ? (
        <p className="mt-4 text-sm text-muted-ink">No contact enquiries are available.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {state.data.map((enquiry) => (
            <li key={enquiry.id} className="rounded-2xl border border-hairline bg-warm p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-charcoal">{enquiry.name || 'Name unavailable'}</h3>
                  <p className="mt-1 text-xs text-muted-ink">
                    {[enquiry.email, enquiry.phone].filter(Boolean).join(' · ') || 'No contact details provided'}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-muted-ink">
                  {enquiry.status}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-charcoal/80">{enquiry.message}</p>
              <p className="mt-3 text-[11px] text-muted-ink">{formatDate(enquiry.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LandlordQueue({ state }: { state: QueueState<LandlordSubmission> }) {
  return (
    <section className="rounded-3xl border border-hairline bg-white p-5 shadow-sm sm:p-6">
      <h2 className="font-headline text-lg font-bold text-charcoal">Landlord submissions</h2>
      {state.status === 'loading' ? (
        <p className="mt-4 text-sm text-muted-ink">Loading landlord submissions…</p>
      ) : state.status === 'forbidden' ? (
        <p className="mt-4 text-sm text-muted-ink">Your staff role does not have access to landlord submissions.</p>
      ) : state.status === 'error' ? (
        <p role="alert" className="mt-4 text-sm text-red-800">{state.message}</p>
      ) : state.data.length === 0 ? (
        <p className="mt-4 text-sm text-muted-ink">No landlord submissions are available.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {state.data.map((submission) => (
            <li key={submission.id} className="rounded-2xl border border-hairline bg-warm p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-charcoal">{submission.name || 'Name unavailable'}</h3>
                  <p className="mt-1 text-xs text-muted-ink">
                    {[submission.email, submission.phone].filter(Boolean).join(' · ') || 'No contact details provided'}
                  </p>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-muted-ink">
                  {submission.status}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-charcoal">
                {submission.property_type} · {submission.bedrooms} bedrooms
              </p>
              <p className="mt-1 text-xs text-charcoal/75">
                {submission.address}, {submission.neighborhood}, {submission.city}, {submission.state}
              </p>
              <p className="mt-2 text-sm font-semibold text-charcoal">
                Expected annual rent: {formatRent(submission.expected_annual_rent)}
              </p>
              {submission.description && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-charcoal/80">{submission.description}</p>
              )}
              <p className="mt-3 text-[11px] text-muted-ink">{formatDate(submission.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function StaffLeadsPage() {
  const [contactState, setContactState] = useState<QueueState<ContactEnquiry>>({ status: 'loading' });
  const [landlordState, setLandlordState] = useState<QueueState<LandlordSubmission>>({ status: 'loading' });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [contacts, landlords] = await Promise.all([
      loadQueue('/api/leads/contact', z.object({ data: z.array(contactEnquirySchema) })),
      loadQueue('/api/leads/landlord', z.object({ data: z.array(landlordSubmissionSchema) })),
    ]);
    setContactState(contacts);
    setLandlordState(landlords);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: 'Lead Submissions' }]}
        actions={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-soft-stone px-3.5 py-1.5 text-xs font-semibold text-charcoal transition-colors hover:bg-hairline disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5 text-muted-ink" />
            <span>Refresh</span>
          </button>
        }
      />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8">
        <div>
          <h1 className="font-headline text-2xl font-bold tracking-tight text-charcoal sm:text-3xl">Lead Submissions</h1>
          <p className="mt-1 text-sm text-charcoal/70">
            Live contact enquiries and property submissions visible to your staff role.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <ContactQueue state={contactState} />
          <LandlordQueue state={landlordState} />
        </div>
      </main>
    </div>
  );
}
