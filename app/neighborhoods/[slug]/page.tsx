'use client';

import React, { use, useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { PropertyCard } from '@/components/public/PropertyCard';
import { fetchNeighborhoodBySlug } from '@/lib/neighborhoods';
import { PROPERTIES as FIXTURE_PROPERTIES } from '@/lib/fixtures/properties';
import { fetchProperties } from '@/lib/properties';
import { NEIGHBORHOODS as FIXTURE_NEIGHBORHOODS } from '@/lib/fixtures/neighborhoods';
// (PROPERTIES via FIXTURE_PROPERTIES)
import { prefersReducedMotion } from '@/lib/motion';
import {
  ChevronRight,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

export default function NeighborhoodGuideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const [neighborhood, setNeighborhood] = useState(() => FIXTURE_NEIGHBORHOODS.find((n) => n.slug === resolvedParams.slug) || FIXTURE_NEIGHBORHOODS[0]);
  const [relatedProperties, setRelatedProperties] = useState<import('@/lib/types').Property[]>(FIXTURE_PROPERTIES);
  useEffect(() => {
    let c=false;
    fetchNeighborhoodBySlug(resolvedParams.slug).then((row)=>{ if(!c && row) setNeighborhood(row); });
    fetchProperties().then((rows)=>{ if(!c && rows.length) setRelatedProperties(rows); });
    return ()=>{c=true};
  }, [resolvedParams.slug]);
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const localProperties = relatedProperties.filter(
    (p) =>
      p.neighborhood.toLowerCase().includes(neighborhood.name.toLowerCase().split(' ')[0]) ||
      p.city.toLowerCase() === neighborhood.city.toLowerCase()
  );

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-nhdetail-enter]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.42, stagger: 0.065, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef, dependencies: [neighborhood.slug] }
  );

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-8 sm:py-12">
        {/* Breadcrumb Navigation */}
        <div data-nhdetail-enter className="flex items-center gap-2 text-xs font-semibold text-muted-ink mb-6">
          <Link href="/neighborhoods" className="hover:text-charcoal transition-colors">
            Neighborhoods
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-hairline" />
          <span>{neighborhood.city}</span>
          <ChevronRight className="w-3.5 h-3.5 text-hairline" />
          <span className="text-charcoal font-bold">{neighborhood.name}</span>
        </div>

        {/* Panoramic Hero Visual */}
        <div data-nhdetail-enter className="relative w-full h-[320px] sm:h-[420px] rounded-3xl sm:rounded-4xl overflow-hidden bg-soft-stone border border-hairline shadow-sm mb-10">
          <img
            src={neighborhood.heroImage}
            alt={neighborhood.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/30 to-transparent"></div>
          <div className="absolute bottom-6 left-6 right-6 text-white max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm mb-2 inline-block">
              {neighborhood.city}, {neighborhood.state} State
            </span>
            <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight">
              {neighborhood.name}
            </h1>
            <p className="text-xs sm:text-sm text-white/80 mt-1">
              {neighborhood.tagline}
            </p>
          </div>
        </div>

        {/* Key Quick Facts Grid */}
        <div data-nhdetail-enter className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 sm:p-6 bg-white rounded-3xl border border-hairline shadow-2xs mb-12">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">
              Avg 2-Bed Flat
            </span>
            <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">
              {neighborhood.averageAnnualRent2Bed}
            </p>
            <span className="text-[11px] text-muted-ink">per annum</span>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">
              Avg 3-Bed Terrace
            </span>
            <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">
              {neighborhood.averageAnnualRent3Bed}
            </p>
            <span className="text-[11px] text-muted-ink">per annum</span>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">
              Electrical Uptime
            </span>
            <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">
              {neighborhood.powerReliability.split(' ')[0]} Daily
            </p>
            <span className="text-[11px] text-emerald-700 font-medium">Priority Feeder</span>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">
              Road &amp; Topography
            </span>
            <p className="font-headline text-sm font-extrabold text-charcoal truncate" title={neighborhood.roadNetwork}>
              {neighborhood.roadNetwork}
            </p>
            <span className="text-[11px] text-muted-ink">Flood-free checked</span>
          </div>
        </div>

        {/* Narrative & Details Layout */}
        <div data-nhdetail-enter className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start mb-16">
          <div className="lg:col-span-8 space-y-8">
            <div>
              <h2 className="font-headline text-2xl font-extrabold text-charcoal mb-3">
                Overview &amp; Living Realities
              </h2>
              <p className="text-sm sm:text-base text-charcoal/80 leading-relaxed font-normal">
                {neighborhood.overview}
              </p>
            </div>

            <div>
              <h3 className="font-headline text-xl font-bold text-charcoal mb-3">
                Neighborhood Highlights
              </h3>
              <div className="space-y-2.5">
                {neighborhood.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-charcoal/80">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-headline text-xl font-bold text-charcoal mb-3">
                Popular &amp; High-Demand Streets
              </h3>
              <div className="flex flex-wrap gap-2">
                {neighborhood.popularStreets.map((st, i) => (
                  <span
                    key={i}
                    className="px-3.5 py-1.5 rounded-full bg-soft-stone text-xs font-semibold text-charcoal border border-hairline"
                  >
                    {st}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-hairline shadow-sm space-y-4">
              <h3 className="font-headline text-lg font-bold text-charcoal">
                Recommended For
              </h3>
              <div className="space-y-2">
                {neighborhood.recommendedFor.map((rec, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-soft-stone text-xs font-semibold text-charcoal">
                    {rec}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsNiaOpen(true)}
                className="w-full py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold shadow-sm nestly-press cursor-pointer"
              >
                Ask Nia about {neighborhood.name.split(' ')[0]}
              </button>
            </div>
          </div>
        </div>

        {/* Local Verified Listings in this neighborhood */}
        <section data-nhdetail-enter className="pt-10 border-t border-hairline">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal">
                Available Homes in {neighborhood.name}
              </h2>
              <p className="text-xs sm:text-sm text-muted-ink mt-0.5">
                Verified daylight listings ready for accompanied walkthroughs.
              </p>
            </div>
            <Link
              href="/browse"
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              <span>View all Edo &amp; Delta homes</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {localProperties.map((prop) => (
              <PropertyCard key={prop.id} property={prop} />
            ))}
          </div>
        </section>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
