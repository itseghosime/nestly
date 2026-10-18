'use client';

import React, { useState } from 'react';
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
            <span>Statutory Tenancy Framework · Edo &amp; Delta</span>
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
              Nestly Technologies Nigeria Ltd (“Nestly”, “we”, “our”) provides an architectural real estate discovery and physical inspection coordination platform. Nestly serves as an intermediary connecting verified prospective tenants with verified residential property owners in Southern Nigeria, with initial primary focus on Edo State (Benin City) and Delta State (Sapele and Warri).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              2. Verification &amp; Tenancy Binding Principles
            </h2>
            <p>
              All rental listings, pricing schedules, and conversational consultations provided via Nestly are subject to physical title inspection and bilateral tenancy agreement execution. Nestly does not execute binding financial transfers, caution deposits, or tenancy contracts online without physical title deed review and bilateral contract execution.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              3. Listing Accuracy &amp; Daylight Monograph
            </h2>
            <p>
              All published property photography is captured during natural daylight hours to illustrate authentic plastering, natural cross-ventilation, and compound surroundings. Amenities indicated as “Verified” (e.g. Dedicated Transformer, 5kVA Solar Inverter, Industrial Borehole) have undergone physical inspection check-in by authorized field staff.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              4. Inspection Requests (Pending Confirmation)
            </h2>
            <p>
              Submission of an inspection request via Nestly reserves a provisional viewing window. All physical inspections are subject to compound custodian access and landlord authorization. Prospective tenants must not attempt unauthorized entry without being met by an authorized Nestly field representative.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              5. Property-Specific Costs &amp; Fee Transparency
            </h2>
            <p>
              In compliance with professional standards, Nestly strictly items all transaction components:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Base Annual Rent:</strong> Settled annually in advance to the confirmed landlord or direct estate manager.</li>
              <li><strong>Refundable Caution Deposit:</strong> Escrowed or designated to cover tenant repairs, returnable within 14 business days post-vacation.</li>
              <li><strong>Legal Drafting &amp; Stamping Fee:</strong> Standardized at 10% of annual rent.</li>
              <li><strong>Agency &amp; Handover Fee:</strong> Standardized at 10% of annual rent.</li>
              <li><strong>Zero Upfront Viewing Fees:</strong> Nestly prohibits extortionate roadside mobilization charges.</li>
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
              For legal inquiries regarding tenancy contracts or landlord instructions, reach our legal desk at <span className="font-bold text-charcoal">compliance@nestly.ng</span> or visit our Edo State Central Hub off Boundary Road, GRA, Benin City.
            </p>
          </section>
        </article>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
