'use client';

import React, { use, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import Link from 'next/link';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { CUSTOMERS } from '@/lib/fixtures/customers';
import { INSPECTION_BOOKINGS } from '@/lib/fixtures/inspections';
import { PROPERTIES } from '@/lib/fixtures/properties';
import { getDemoFixtures } from '@/lib/demo-mode';
import {
  ArrowLeft,
  Calendar,
  MessageSquare,
  MapPin,
  Phone,
  Mail,
  ChevronRight,
} from 'lucide-react';

const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_CUSTOMERS = getDemoFixtures(IS_DEMO_MODE, CUSTOMERS);
const DEMO_INSPECTIONS = getDemoFixtures(IS_DEMO_MODE, INSPECTION_BOOKINGS);
const DEMO_PROPERTIES = getDemoFixtures(IS_DEMO_MODE, PROPERTIES);

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const customer = DEMO_CUSTOMERS.find((c) => c.id === resolvedParams.id);

  const customerInspections = DEMO_INSPECTIONS.filter(
    (b) => customer && (b.customerEmail === customer.email || b.customerName === customer.name)
  );

  const notes = customer ? [customer.notes] : [];
  const notesRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (prefersReducedMotion() || !notesRef.current) return;
    const items = notesRef.current.querySelectorAll('[data-note-item]');
    const last = items[items.length - 1];
    if (last) gsap.fromTo(last, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [notes.length] });

  if (!IS_DEMO_MODE || !customer) {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-warm">
        <StaffHeader breadcrumbs={[{ label: 'Customer Directory', href: '/staff/customers' }, { label: 'Customer profile' }]} />
        <main className="p-4 sm:p-8 max-w-4xl mx-auto w-full">
          <section role="status" className="rounded-3xl border border-hairline bg-white p-6 sm:p-8 space-y-3">
            <h1 className="font-headline text-2xl font-bold text-charcoal">
              {IS_DEMO_MODE ? 'Demo customer record not found' : 'Live customer profile is unavailable'}
            </h1>
            <p className="text-sm text-muted-ink leading-relaxed">
              {IS_DEMO_MODE
                ? 'The requested ID does not match a demo fixture.'
                : 'No live customer profile source is connected to this page. No fixture profile, verification result, note, or conversation is presented as a real record.'}
            </p>
            <p className="text-sm text-muted-ink leading-relaxed">
              Historical WhatsApp conversations remain readable in the staff inbox; replies on that channel are unavailable.
            </p>
            <Link href="/staff/inbox" className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-soft-stone text-charcoal text-xs font-bold border border-hairline">
              <MessageSquare className="w-3.5 h-3.5" />
              Open staff inbox
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[
          { label: 'Customer Directory', href: '/staff/customers' },
          { label: customer.name },
        ]}
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          Demo mode is enabled. This customer, inspection, listing, verification field, and note are fictional sample data, not persisted records.
        </div>

        {/* Back Link & Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/staff/customers"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-all border border-hairline w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Directory</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href="/staff/inbox"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold transition-all shadow-2xs"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Open staff inbox</span>
            </Link>
          </div>
        </div>

        {/* Customer Profile Header Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-soft-stone text-primary font-bold text-xl flex items-center justify-center shrink-0 border border-hairline">
              {customer.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-headline text-2xl font-bold text-charcoal tracking-tight">
                  {customer.name}
                </h1>
                <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-soft-stone text-muted-ink text-xs font-bold">
                  <span>Demo: {customer.kycStatus}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-soft-stone text-muted-ink text-xs font-semibold border border-hairline">
                  {customer.id}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-charcoal/70 pt-1">
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-muted-ink" />
                  <span className="font-mono">{customer.phone}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-muted-ink" />
                  <span>{customer.email}</span>
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-persimmon" />
                  <span>{customer.city}, {customer.state} State</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-2 p-4 rounded-2xl bg-soft-stone border border-hairline text-xs min-w-[220px]">
            <div className="flex justify-between items-center text-charcoal/70">
              <span>Fixture budget field:</span>
              <span className="font-bold text-charcoal">{customer.budgetRange}</span>
            </div>
            <div className="flex justify-between items-center text-charcoal/70">
              <span>Fixture neighborhood field:</span>
              <span className="font-semibold text-charcoal">{customer.preferredNeighborhoods.join(', ')}</span>
            </div>
          </div>
        </div>

        {/* Two-Column Grid: Inspections & Staff Notes */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Inspection History & Saved Property Links */}
          <div className="lg:col-span-8 space-y-6">
            {/* Inspections Table */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h2 className="font-headline text-base font-bold text-charcoal">
                    Demo Inspection Schedule & History
                  </h2>
                </div>
                <span className="text-xs font-bold text-muted-ink">
                  {customerInspections.length} Demo fixture records
                </span>
              </div>

              {customerInspections.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-ink">
                  No matching demo inspection fixture is included for this sample record.
                </div>
              ) : (
                <div className="space-y-3">
                  {customerInspections.map((insp) => (
                    <div
                      key={insp.id}
                      className="p-4 rounded-2xl bg-soft-stone border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-charcoal">{insp.propertyTitle}</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            {insp.status}
                          </span>
                        </div>
                        <p className="text-xs text-charcoal/70 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-persimmon" />
                          <span>{insp.propertyAddress}</span>
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-ink pt-1">
                          <span>{insp.date} • {insp.timeSlot}</span>
                          <span>Assigned Agent: {insp.fieldAgentName}</span>
                        </div>
                      </div>

                      <Link
                        href={`/staff/inspections/${insp.id}`}
                        className="px-4 py-2 rounded-full bg-white hover:bg-persimmon hover:text-white text-charcoal text-xs font-bold transition-all border border-hairline shadow-2xs text-center shrink-0"
                      >
                        Inspection Dossier →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inquired Properties Rail */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <h2 className="font-headline text-base font-bold text-charcoal">
                Fictional listing examples (not linked to this customer)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DEMO_PROPERTIES.slice(0, 2).map((prop) => (
                  <div
                    key={prop.id}
                    className="p-3.5 rounded-2xl bg-soft-stone border border-hairline space-y-2 flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold text-muted-ink">
                        <span>{prop.neighborhood}</span>
                        <span className="text-persimmon">{prop.priceFormatted || `₦${prop.priceAnnual.toLocaleString()}/yr`}</span>
                      </div>
                      <h3 className="font-headline text-xs font-bold text-charcoal leading-snug">
                        {prop.title}
                      </h3>
                    </div>
                    <Link
                      href={`/staff/properties/${prop.id}/preview`}
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 pt-1"
                    >
                      <span>View Listing Audit</span>
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Internal Staff Notes & KYC Verification */}
          <div className="lg:col-span-4 space-y-6">
            {/* Identity & Vetting Verification Card */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Demo verification field
              </span>
              <div className="p-3 rounded-2xl bg-soft-stone border border-hairline text-xs text-charcoal/80 space-y-1">
                <p>Demo fixture value: <strong>{customer.kycStatus}</strong></p>
                <p className="text-[11px] text-muted-ink">No identity verification was performed by this demo.</p>
              </div>
            </div>

            {/* Coordinator Notes */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Demo fixture note (not saved)
              </span>
              <div ref={notesRef} className="space-y-2">
                {notes.map((note, idx) => (
                  <div
                    key={idx}
                    data-note-item
                    className="p-3 rounded-2xl bg-soft-stone border border-hairline text-xs text-charcoal/80 leading-relaxed"
                  >
                    {note}
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
