'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { RefreshCw } from 'lucide-react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { CONTACT_STATUSES, LANDLORD_STATUSES, leadStatusLabel, type LeadKind } from '@/lib/lead-management';

const contactEnquirySchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  message: z.string(),
  status: z.string(),
  updated_at: z.string().datetime({ offset: true }),
  canUpdate: z.boolean().optional().default(false),
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
  converted_property_id: z.string().uuid().nullable(),
  updated_at: z.string().datetime({ offset: true }),
  canUpdate: z.boolean().optional().default(false),
  created_at: z.string(),
});

type ContactEnquiry = z.infer<typeof contactEnquirySchema>;
type LandlordSubmission = z.infer<typeof landlordSubmissionSchema>;
const PROPERTY_TYPES = ['apartment', 'house', 'duplex', 'studio', 'land', 'commercial'] as const;
const conversionResponseSchema = z.object({
  data: z.object({
    property_id: z.string().uuid(),
    title: z.string(),
    publication_state: z.literal('draft'),
    verification_state: z.literal('unverified'),
    rent_annual: z.number(),
    created: z.boolean(),
  }),
});
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


type LeadRevision = { id: string; status: string; updated_at: string };
const leadRevisionSchema = z.object({
  data: z.object({ id: z.string().uuid(), status: z.string(), updated_at: z.string().datetime({ offset: true }) }),
});

function LeadStatusControl({ kind, lead, onSaved }: {
  kind: LeadKind;
  lead: LeadRevision & { canUpdate: boolean };
  onSaved: (revision: LeadRevision) => void;
}) {
  const choices = (kind === 'contact' ? CONTACT_STATUSES : LANDLORD_STATUSES)
    .filter(status => status !== 'new' && status !== lead.status);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const inFlight = useRef(false);
  const target = choices.some(status => status === selected) ? selected : choices[0] || '';
  if (!lead.canUpdate) {
    return <p className="mt-3 text-xs text-muted-ink">Your role can view this submission.</p>;
  }
  const save = async () => {
    if (inFlight.current || !target) return;
    inFlight.current = true;
    setSaving(true);
    setFeedback('');
    try {
      const response = await fetch(`/api/leads/${kind}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: lead.id, status: target, expectedUpdatedAt: lead.updated_at }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = leadRevisionSchema.safeParse(body);
      if (!response.ok || !parsed.success || parsed.data.data.id !== lead.id) {
        const error = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error : 'Unable to confirm the status update. Refresh before retrying.';
        throw new Error(error);
      }
      onSaved(parsed.data.data);
      setSelected('');
      setFeedback('Status saved.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to confirm the status update. Refresh before retrying.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`lead-status-${lead.id}`} className="mb-1 block text-xs font-semibold text-charcoal">Update status</label>
          <select id={`lead-status-${lead.id}`} value={target} onChange={event => setSelected(event.target.value)}
            disabled={saving} className="w-full rounded-xl border border-hairline bg-white py-2 pl-3 text-xs disabled:opacity-50">
            {choices.map(status => <option key={status} value={status}>{leadStatusLabel(status)}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving || !target}
          className="shrink-0 rounded-full bg-charcoal px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save status'}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-ink">
        {kind === 'landlord' ? 'Acceptance records staff review; it does not publish a listing.' : 'Status changes do not send a message to the customer.'}
      </p>
      {feedback && <p role="status" aria-live="polite" className="mt-2 text-xs text-charcoal">{feedback}</p>}
    </div>
  );
}

function LandlordDraftControl({ submission, onCreated }: {
  submission: LandlordSubmission;
  onCreated: (submissionId: string, propertyId: string) => void;
}) {
  const initialType = PROPERTY_TYPES.find((type) => type === submission.property_type.trim().toLowerCase()) || '';
  const [propertyType, setPropertyType] = useState<string>(initialType);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const inFlight = useRef(false);

  if (!submission.canUpdate) {
    return <p className="mt-3 text-xs text-muted-ink">Only authorized property managers can create drafts.</p>;
  }
  if (submission.converted_property_id) {
    return (
      <div className="mt-3 border-t border-hairline pt-3">
        <p className="text-xs text-muted-ink">A private, unverified property draft is linked to this submission.</p>
        <Link
          href={`/staff/properties/${submission.converted_property_id}/edit`}
          className="mt-2 inline-flex rounded-full bg-charcoal px-4 py-2 text-xs font-semibold text-white"
        >
          Open property editor
        </Link>
      </div>
    );
  }

  const createDraft = async () => {
    if (inFlight.current || !propertyType) return;
    inFlight.current = true;
    setSaving(true);
    setFeedback('');
    try {
      const response = await fetch(`/api/leads/landlord/${submission.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyType }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = conversionResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : 'Unable to confirm the property draft. Refresh before retrying.';
        throw new Error(message);
      }
      const property = parsed.data.data;
      onCreated(submission.id, property.property_id);
      setFeedback(property.created ? 'Private draft created.' : 'Existing private draft reopened.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to confirm the property draft.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-hairline pt-3">
      <p className="text-xs text-muted-ink">
        Create a private draft for editing. This does not accept the submission, publish a listing, or verify it.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={`landlord-property-type-${submission.id}`} className="mb-1 block text-xs font-semibold text-charcoal">
            Property type for draft
          </label>
          <select
            id={`landlord-property-type-${submission.id}`}
            value={propertyType}
            onChange={(event) => setPropertyType(event.target.value)}
            disabled={saving}
            className="w-full rounded-xl border border-hairline bg-white py-2 pl-3 text-xs disabled:opacity-50"
          >
            <option value="">Select a supported type</option>
            {PROPERTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void createDraft()}
          disabled={saving || !propertyType}
          className="shrink-0 rounded-full bg-charcoal px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create private draft'}
        </button>
      </div>
      {feedback && <p role="status" aria-live="polite" className="mt-2 text-xs text-charcoal">{feedback}</p>}
    </div>
  );
}

function ContactQueue({ state, onSaved }: { state: QueueState<ContactEnquiry>; onSaved: (revision: LeadRevision) => void }) {
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
                  {leadStatusLabel(enquiry.status)}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-charcoal/80">{enquiry.message}</p>
              <p className="mt-3 text-[11px] text-muted-ink">{formatDate(enquiry.created_at)}</p>
              <LeadStatusControl kind="contact" lead={enquiry} onSaved={onSaved} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LandlordQueue({ state, onSaved, onCreated }: {
  state: QueueState<LandlordSubmission>;
  onSaved: (revision: LeadRevision) => void;
  onCreated: (submissionId: string, propertyId: string) => void;
}) {
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
                  {leadStatusLabel(submission.status)}
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
              <LeadStatusControl kind="landlord" lead={submission} onSaved={onSaved} />
              <LandlordDraftControl submission={submission} onCreated={onCreated} />
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
            Contact enquiries and property submissions visible to your staff role. Showing up to 100 recent entries per queue.
          </p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <ContactQueue state={contactState} onSaved={revision => setContactState(previous => previous.status === 'ready'
            ? { status: 'ready', data: previous.data.map(lead => lead.id === revision.id ? { ...lead, ...revision } : lead) } : previous)} />
          <LandlordQueue state={landlordState} onSaved={revision => setLandlordState(previous => previous.status === 'ready'
            ? { status: 'ready', data: previous.data.map(lead => lead.id === revision.id ? { ...lead, ...revision } : lead) } : previous)}
            onCreated={(submissionId, propertyId) => setLandlordState(previous => previous.status === 'ready'
              ? { status: 'ready', data: previous.data.map(lead => lead.id === submissionId ? { ...lead, converted_property_id: propertyId } : lead) }
              : previous)} />
        </div>
      </main>
    </div>
  );
}
