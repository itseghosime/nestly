'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { Clock } from 'lucide-react';

export default function TermsPage() {
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-16">
        {/* Header */}
        <div className="mb-10 pb-6 border-b border-hairline">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-muted-ink mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Terms &amp; Service Information</span>
          </div>

          <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.06]">
            Terms &amp; Conditions
          </h1>

          <div className="flex items-center gap-4 text-xs text-muted-ink mt-3 font-medium">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Effective: 17 October 2026</span>
            </span>
            <span>•</span>
            <span>Applicable Law: Federal Republic of Nigeria &amp; Edo State Tenancy Law</span>
          </div>
        </div>

        {/* Content Document */}
        <article className="prose prose-sm max-w-none space-y-8 text-xs sm:text-sm text-charcoal/80 leading-relaxed font-normal">
          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              1. Service Scope &amp; Platform Role
            </h2>
            <p>
              Nestly Technologies Nigeria Ltd (“Nestly”, “we”, “our”) provides a residential property discovery website and related inquiry features, with an initial focus on Edo State (Benin City) and Delta State (Sapele and Warri). Listing records do not by themselves verify a tenant, owner, or property.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              2. Listing and Transaction Boundaries
            </h2>
            <p>
              Listing, pricing, and conversational information may be incomplete or outdated and does not verify ownership, condition, availability, or suitability. Nestly does not collect rent or deposits, process financial transfers, or execute tenancy agreements through this site. Confirm all details and terms directly with the relevant parties before making a commitment.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              3. Listing Information
            </h2>
            <p>
              Listing photos and amenity details are provided for information and may not reflect current conditions. A label or description is not a guarantee of independent inspection. Confirm important details in person and through appropriate records before proceeding.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              4. Inspection Requests (Pending Confirmation)
            </h2>
            <p>
              Submitting an inspection request does not reserve a viewing window or confirm an appointment. Wait for explicit confirmation before visiting. Do not enter a property without permission from the relevant owner or authorized representative.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              5. Property-Specific Costs &amp; Fee Transparency
            </h2>
            <p>
              Charges and calculation bases vary by listing. Review each disclosed item and clarify unconfirmed details before proceeding:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Required fees may remain unconfirmed; a final total is withheld until required details are confirmed.</li>
              <li>No rent, deposit, or other payment is collected through this site.</li>
              <li>Confirm the payee, amount, calculation basis, and written terms directly before paying.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              6. Acceptable Platform Use
            </h2>
            <p>
              Users agree not to scrape property listings, introduce false property claims, or attempt security bypass of internal staff portals. All intellectual property, trademarks, and design systems belong exclusively to Nestly Technologies Nigeria Ltd.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              7. Legal Queries &amp; Operator Contact
            </h2>
            <p>
              Use the <Link href="/contact" className="font-bold text-charcoal underline">contact form</Link> for questions. No physical legal office address is confirmed on this site.
            </p>
          </section>
        </article>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
