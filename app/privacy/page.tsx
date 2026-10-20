'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
            <span>Privacy questions: <Link href="/contact" className="underline">contact form</Link></span>
          </div>
        </div>

        {/* Content Document */}
        <article className="prose prose-sm max-w-none space-y-8 text-xs sm:text-sm text-charcoal/80 leading-relaxed font-normal">
          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              1. Information We Collect
            </h2>
            <p>
              Depending on the feature you use, information you submit may include your name, phone number, email address, message, and listing or property details. Each form identifies its required fields. Do not submit identity documents or other sensitive information through a general inquiry form.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Contact and landlord inquiries:</strong> Contact details and the inquiry or property information you provide.</li>
              <li><strong>Inspection requests:</strong> Contact details and the property, date, or time preferences entered in the request.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              2. Local Browser Storage (Saved Homes)
            </h2>
            <p>
              Saved Homes are stored in your browser’s local storage (under the key <code>nestly_saved_homes_v2</code>). This feature does not create a server-side shortlist; clearing browser storage removes the saved list.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              3. Telegram, Website Chat &amp; Historical WhatsApp Records
            </h2>
            <p>
              Customers can contact Nia through Telegram or website chat. Existing WhatsApp conversations and related contact details are retained as historical records for continuity and audit; WhatsApp is not presented as a current customer-contact option. Website chat messages, up to ten recent turns, search preferences, and relevant public listing details may be processed by Nestly&apos;s n8n-hosted AI workflow and its connected AI provider to prepare replies. Website session tokens and contact fields are not sent as separate data; please do not include sensitive personal or financial information in chat. The app-side Twilio staff-reply path is controlled by the server-only outbound flag, but that does not disconnect external Twilio or n8n workflows. A message or request does not confirm a viewing or provider delivery.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              4. Technical Infrastructure &amp; Security Providers
            </h2>
            <p>
              The application uses hosting, database, and messaging services for the features that are enabled. The forms described on this page do not perform National Identification Number checks, land-title registry checks, GPS geofencing, or gate-pass SMS dispatch.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Conversation providers may process messages sent through their channel.</li>
              <li>Hosting and database providers may process information needed to run the website and its APIs.</li>
            </ul>
            <div className="p-3.5 rounded-2xl bg-soft-stone border border-hairline text-xs text-charcoal/80 leading-relaxed font-medium">
              <strong>Verification notice:</strong> The presence of a listing or a submitted request is not evidence that an identity, title, location, or property condition was independently verified.
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl sm:text-2xl font-bold text-charcoal">
              5. Data Subject Rights &amp; Deletion
            </h2>
            <p>
              You may request access to, correction of, or deletion of personal information, subject to applicable law and records that must be retained. Submit a request through the <Link href="/contact" className="font-bold text-charcoal underline">contact form</Link>.
            </p>
          </section>
        </article>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
