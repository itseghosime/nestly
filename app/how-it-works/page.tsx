'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { CheckCircle2 } from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function HowItWorksPage() {
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      gsap.fromTo(
        '[data-hiw-hero]',
        { y: 18, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.entrance,
          stagger: 0.07,
          ease: MOTION.ease.softOut,
          clearProps: 'transform,opacity',
        }
      );

      const steps = gsap.utils.toArray<HTMLElement>('[data-hiw-step]');
      steps.forEach((step) => {
        gsap.fromTo(
          step,
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.5,
            ease: MOTION.ease.softOut,
            scrollTrigger: {
              trigger: step,
              start: 'top 84%',
              once: true,
            },
            clearProps: 'transform,opacity',
          }
        );
      });
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 w-full">
        {/* Hero Section */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 pt-10 sm:pt-16 pb-12">
          <div data-hiw-hero className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-primary mb-4">
            <span className="w-2 h-2 rounded-full bg-persimmon"></span>
            <span>The Nestly Rental Experience</span>
          </div>

          <h1 data-hiw-hero className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-charcoal leading-[1.05] max-w-3xl mb-4">
            From first search to key in hand.
          </h1>

          <p data-hiw-hero className="text-base sm:text-xl text-muted-ink leading-relaxed max-w-2xl font-normal">
            A straightforward four-step process built specifically around the physical, electrical, and legal realities of renting in Benin City and Delta State.
          </p>

          {/* Quick Stats Grid Bar */}
          <div data-hiw-hero className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 p-5 sm:p-6 bg-white rounded-3xl border border-hairline shadow-2xs">
            <div className="p-2">
              <span className="block text-[11px] uppercase tracking-wider text-muted-ink font-bold mb-1">
                Viewing Fee Policy
              </span>
              <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">₦0 Inspection Charge</p>
              <span className="text-xs text-emerald-700 font-medium">100% verified access</span>
            </div>

            <div className="p-2">
              <span className="block text-[11px] uppercase tracking-wider text-muted-ink font-bold mb-1">
                Infrastructure Check
              </span>
              <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">Inverter &amp; Borehole</p>
              <span className="text-xs text-muted-ink font-medium">Pre-audited utilities</span>
            </div>

            <div className="p-2">
              <span className="block text-[11px] uppercase tracking-wider text-muted-ink font-bold mb-1">
                Timezone &amp; Slots
              </span>
              <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">WAT Daylight Only</p>
              <span className="text-xs text-muted-ink font-medium">Natural illumination tours</span>
            </div>

            <div className="p-2">
              <span className="block text-[11px] uppercase tracking-wider text-muted-ink font-bold mb-1">
                Title Assurance
              </span>
              <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">C-of-O &amp; Survey</p>
              <span className="text-xs text-emerald-700 font-medium">Direct instruction</span>
            </div>
          </div>
        </section>

        {/* 4 Step Sequential Process */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 py-12 sm:py-20 border-t border-hairline space-y-16">
          {/* Step 1 */}
          <div data-hiw-step className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-4">
              <span className="font-headline text-5xl font-extrabold text-charcoal/20">01</span>
              <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal">
                Browse verified daylight photography &amp; itemized fee sheets
              </h2>
              <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                Filter homes by specific local criteria: dedicated BEDC transformers, solar inverter pre-cabling, treated borehole filtration, and flood-free topography in Sapele and Benin City.
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs font-bold text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Zero mandatory sign-up or profile completion</span>
              </div>
            </div>
            <div className="property-card-hover lg:col-span-7 h-[280px] sm:h-[360px] rounded-3xl overflow-hidden bg-soft-stone border border-hairline shadow-sm">
              <img
                src="/images/generated/img_21d26ecda7f74e63a2b5a318df70b1f1.png"
                alt="Browse residential listings"
                className="property-card-img w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Step 2 */}
          <div data-hiw-step className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 lg:order-2 space-y-4">
              <span className="font-headline text-5xl font-extrabold text-charcoal/20">02</span>
              <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal">
                Ask Nia about fine print, power lines &amp; caution terms
              </h2>
              <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                Nia is trained on Nigerian residential leasing conditions. Ask what the service charge covers, whether the meter is shared, and how the landlord handles refundable caution deposits.
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs font-bold text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Instant conversational answers on WhatsApp or Web</span>
              </div>
            </div>
            <div className="property-card-hover lg:col-span-7 lg:order-1 h-[280px] sm:h-[360px] rounded-3xl overflow-hidden bg-soft-stone border border-hairline shadow-sm">
              <img
                src="/images/generated/img_182f9d8fffd242df93d3c53e9b4abbc0.png"
                alt="Nia conversation preview"
                className="property-card-img w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Step 3 */}
          <div data-hiw-step className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-4">
              <span className="font-headline text-5xl font-extrabold text-charcoal/20">03</span>
              <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal">
                Accompanied in-person viewing with real staff
              </h2>
              <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                Meet an authorized Nestly field officer directly at the gate. We conduct viewings exclusively during optimal natural lighting hours (10:00 AM - 5:00 PM WAT) so you can inspect wall plastering and natural airflow.
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs font-bold text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Zero roadside agency charges or escort fees</span>
              </div>
            </div>
            <div className="property-card-hover lg:col-span-7 h-[280px] sm:h-[360px] rounded-3xl overflow-hidden bg-soft-stone border border-hairline shadow-sm">
              <img
                src="/images/generated/img_790f21b75f6c4829b0e7c145c8ca6112.png"
                alt="Accompanied inspection at the gate"
                className="property-card-img w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Step 4 */}
          <div data-hiw-step className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 lg:order-2 space-y-4">
              <span className="font-headline text-5xl font-extrabold text-charcoal/20">04</span>
              <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal">
                Clear tenancy agreement review &amp; secure keys
              </h2>
              <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                Review verified standardized tenancy documentation drafted in compliance with Edo State tenancy laws. Move in with complete peace of mind.
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs font-bold text-primary">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Formal itemized receipts &amp; landlord verification</span>
              </div>
            </div>
            <div className="property-card-hover lg:col-span-7 lg:order-1 h-[280px] sm:h-[360px] rounded-3xl overflow-hidden bg-soft-stone border border-hairline shadow-sm">
              <img
                src="/images/generated/img_cf5daf1e9cf9439499d9088aa14ce3f9.png"
                alt="Settled residence"
                className="property-card-img w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* CTA Bar */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 border-t border-hairline text-center">
          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-hairline max-w-3xl mx-auto shadow-sm space-y-6">
            <h2 className="font-headline text-2xl sm:text-4xl font-extrabold text-charcoal">
              Ready to find a home you&apos;ll love?
            </h2>
            <p className="text-xs sm:text-base text-muted-ink max-w-lg mx-auto">
              Explore our current daylight inventory across GRA Benin, Boundary Road, Ugbor, and Sapele.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/browse"
                className="nestly-press px-8 py-3.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-all"
              >
                Browse Homes
              </Link>
              <Link
                href="/inspection-request"
                className="nestly-press px-8 py-3.5 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Schedule Inspection
              </Link>
            </div>
          </div>
        </section>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
