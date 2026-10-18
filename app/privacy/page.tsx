'use client';

import React, { useState } from 'react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { Clock } from 'lucide-react';

export default function PrivacyPolicyPage() {
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-16">
        {/* Header */}
        <div className="mb-10 pb-6 border-b border-hairline">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-muted-ink mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Nigeria Data Protection Act (NDPA) Compliant</span>
          </div>

          <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.06]">
            Privacy Policy
          </h1>

          <div className="flex items-center gap-4 text-xs text-muted-ink mt-3 font-medium">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Last Revised: October 2026</span>
            </span>
            <span>•</span>
            <span>Privacy Desk: privacy@nestly.ng</span>
          </div>
        </div>

        {/* Content Document */}
        <article className="prose prose-sm max-w-none space-y-8 text-xs sm:text-sm text-charcoal/80 leading-relaxed font-normal">
          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              1. Information We Collect
            </h2>
            <p>
              Nestly prioritizes minimal data exposure. You can browse all verified listings, inspect fee schedules, and save properties without providing an email, phone number, or name. We only collect personal identification data in two specific events:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Inspection Booking:</strong> Name and WhatsApp/phone number to coordinate gate security passes and field agent accompaniment.</li>
              <li><strong>Formal Tenancy Agreement:</strong> Government-issued National Identification Number (NIN) or international passport strictly for landlord lease execution.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              2. Local Browser Storage (Saved Homes)
            </h2>
            <p>
              Your saved homes shortlist is stored directly inside your browser’s local storage (under the key <code>nestly_saved_homes_v2</code>). We do not transmit or sync your anonymous browsing behavior to external advertising networks or tracking trackers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              3. WhatsApp &amp; Concierge Messaging
            </h2>
            <p>
              When chatting with Nia on WhatsApp or through our embedded web widget, conversational records are processed to recommend matching properties and coordinate physical showings. We do not sell your conversational data or share your phone number with unregulated real estate marketers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              4. Technical Infrastructure &amp; Security Providers
            </h2>
            <p>
              In production, Nestly integrates with certified Nigerian and international infrastructure partners:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Prembly / IdentityPass:</strong> Automated NIN and title verification under NDPA guidelines.</li>
              <li><strong>Termii:</strong> High-reliability SMS gateway for gate pass tokens in Nigeria.</li>
              <li><strong>Mapbox:</strong> Regional cadastral mapping and GPS geofencing for field agent check-ins.</li>
            </ul>
            <div className="p-3.5 rounded-2xl bg-soft-stone border border-hairline text-xs text-charcoal/80 leading-relaxed font-medium">
              <strong>Third-Party Processing Notice:</strong> Identity vetting (NIN) and SMS dispatch services operate via verified infrastructure partners in accordance with NDPA 2023 regulations. Direct integrations are activated per corridor and subject to carrier and registry network availability.
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              5. Data Subject Rights &amp; Deletion
            </h2>
            <p>
              Under the Nigeria Data Protection Act 2023, you retain the full right to inspect, correct, or request total deletion of your tenancy inquiry records. To purge your contact information, email <span className="font-bold text-charcoal">privacy@nestly.ng</span>.
            </p>
          </section>
        </article>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
