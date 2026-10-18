'use client';

import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  ShieldCheck,
  MapPin,
  Users,
  Eye,
  FileText,
} from 'lucide-react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export default function AboutPage() {
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      gsap.fromTo(
        '[data-about-hero]',
        { y: 18, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.entrance,
          stagger: 0.08,
          ease: MOTION.ease.softOut,
          clearProps: 'transform,opacity',
        }
      );

      gsap.fromTo(
        '[data-about-mosaic]',
        { y: 20, opacity: 0, scale: 0.985 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.55,
          stagger: 0.1,
          ease: MOTION.ease.softOut,
          clearProps: 'transform,opacity',
        }
      );

      gsap.fromTo(
        '[data-about-pillar]',
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.45,
          stagger: 0.09,
          ease: MOTION.ease.softOut,
          scrollTrigger: {
            trigger: '[data-about-pillars]',
            start: 'top 84%',
            once: true,
          },
          clearProps: 'transform,opacity',
        }
      );

      gsap.fromTo(
        '[data-about-hub]',
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.42,
          stagger: 0.08,
          ease: MOTION.ease.softOut,
          scrollTrigger: {
            trigger: '[data-about-hubs]',
            start: 'top 85%',
            once: true,
          },
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 w-full">
        {/* Origin & Philosophy Eyebrow */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 pt-10 sm:pt-14 pb-6">
          <div data-about-hero className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-muted-ink">
              <span className="w-2 h-2 rounded-full bg-persimmon"></span>
              <span>Our Origin &amp; Philosophy</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-ink hidden sm:inline">
              Est. 2024 — Southern Nigeria
            </span>
          </div>
        </section>

        {/* Hero Headline & Problem Statement */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 pb-16 sm:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-start">
            <div data-about-hero className="lg:col-span-8 space-y-4 sm:space-y-6">
              <h1 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-charcoal leading-[1.04]">
                Renting shouldn’t feel like navigating a maze blindfolded.
              </h1>
              <p className="text-base sm:text-lg text-muted-ink leading-relaxed max-w-2xl font-normal">
                In Benin City and Delta State, finding a good apartment traditionally meant paying mobilization fees to three separate roadside agents just to inspect a compound with no running water. We built Nestly to replace extortion with institutional clarity.
              </p>
            </div>

            <div data-about-hero className="lg:col-span-4">
              <div className="p-6 sm:p-8 rounded-3xl bg-soft-stone border border-hairline shadow-2xs space-y-4">
                <div className="flex items-center gap-2 text-primary font-bold text-lg">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                  <span>Zero Extortion Guarantee</span>
                </div>
                <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                  By eliminating informal gatekeepers, unverified WhatsApp forwards, and multiple middleman commission markups, every seeker gains verified institutional trust.
                </p>
                <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs text-muted-ink">
                  <span>Physical Inspections</span>
                  <span className="font-bold text-charcoal">100% Daylight Checked</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Photographic Visual Mosaic */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div data-about-mosaic className="property-card-hover md:col-span-8 h-[300px] sm:h-[420px] rounded-3xl overflow-hidden bg-soft-stone border border-hairline shadow-sm">
              <img
                src="/images/editorial/tropical-residence.webp" loading="lazy" decoding="async"
                alt="Contemporary home surrounded by tropical greenery"
                className="property-card-img w-full h-full object-cover"
              />
            </div>
            <div data-about-mosaic className="property-card-hover md:col-span-4 h-[300px] sm:h-[420px] rounded-3xl overflow-hidden bg-soft-stone border border-hairline shadow-sm">
              <img
                src="/images/editorial/architectural-interior.webp" loading="lazy" decoding="async"
                alt="Light-filled interior with a sculptural staircase"
                className="property-card-img w-full h-full object-cover"
              />
            </div>
          </div>
        </section>

        {/* 3 Core Operating Pillars */}
        <section data-about-pillars className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 sm:py-24 border-t border-hairline">
          <div className="max-w-2xl mb-12 sm:mb-16">
            <span className="text-xs font-extrabold uppercase tracking-widest text-persimmon block mb-2">
              Our Commitments
            </span>
            <h2 className="font-headline text-3xl sm:text-4xl font-extrabold text-charcoal tracking-tight">
              Architectural honesty meets operational integrity.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div data-about-pillar className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-sm space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-soft-stone flex items-center justify-center text-primary font-bold">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-headline text-xl font-bold text-charcoal">
                Transparent Upfront Ledgers
              </h3>
              <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                Before you even visit, every listing specifies base rent, refundable caution deposits, legal drafting percentages, and compound service fees. Zero surprise charges at the gate.
              </p>
            </div>

            <div data-about-pillar className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-sm space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-soft-stone flex items-center justify-center text-primary font-bold">
                <Eye className="w-6 h-6" />
              </div>
              <h3 className="font-headline text-xl font-bold text-charcoal">
                Physical Verification over Rumors
              </h3>
              <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                We physically test borehole pumping pressure, check BEDC prepaid meter phase stability, confirm access roads during rainy seasons, and verify land registry documentation.
              </p>
            </div>

            <div data-about-pillar className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-sm space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-soft-stone flex items-center justify-center text-primary font-bold">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-headline text-xl font-bold text-charcoal">
                Nia AI + Human Accompaniment
              </h3>
              <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                Technology handles initial discovery and rapid answers 24/7. When it comes time to inspect, real authorized Nestly field agents meet you at the compound gate.
              </p>
            </div>
          </div>
        </section>

        {/* Regional Hubs Section */}
        <section data-about-hubs className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 sm:py-20 border-t border-hairline">
          <div className="bg-stone-card rounded-3xl p-6 sm:p-12 border border-hairline">
            <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal mb-6">
              Our Regional Operations Desks
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div data-about-hub className="bg-white rounded-2xl p-6 border border-hairline space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-persimmon" />
                  <h4 className="font-bold text-base text-charcoal">Edo State Central Hub</h4>
                </div>
                <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                  Off Boundary Road, GRA, Benin City. Covering GRA, Ihama, Airport Road Corridor, Ugbor, and Ugbowo axis.
                </p>
                <div className="pt-2 text-xs font-bold text-primary">
                  Field Vetting Lead: Victoria Nosa · +234 812 345 6789
                </div>
              </div>

              <div data-about-hub className="bg-white rounded-2xl p-6 border border-hairline space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-persimmon" />
                  <h4 className="font-bold text-base text-charcoal">Delta State Commuter Desk</h4>
                </div>
                <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                  Clinic Road, Sapele. Covering Sapele Urban, Amukpe, and Effurun / Warri residential estates.
                </p>
                <div className="pt-2 text-xs font-bold text-primary">
                  Delta Operations Officer: Efe Mukoro · +234 809 876 5432
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
