'use client';

import { resolveEditorialImage } from '@/lib/editorial-images';

import React, { use, useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { PropertyCard } from '@/components/public/PropertyCard';
import { fetchNeighborhoodBySlug, IS_DEMO_MODE } from '@/lib/neighborhoods';
import { PROPERTIES as FIXTURE_PROPERTIES } from '@/lib/fixtures/properties';
import { fetchProperties } from '@/lib/properties';
import { NEIGHBORHOODS as FIXTURE_NEIGHBORHOODS } from '@/lib/fixtures/neighborhoods';
import type { NeighborhoodGuide, Property } from '@/lib/types';
import { prefersReducedMotion } from '@/lib/motion';
import {
  ChevronRight,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

export default function NeighborhoodGuideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const initialNeighborhood = IS_DEMO_MODE ? FIXTURE_NEIGHBORHOODS.find((n) => n.slug === resolvedParams.slug) || null : null;
  const [currentSlug, setCurrentSlug] = useState(resolvedParams.slug);
  const [neighborhood, setNeighborhood] = useState<NeighborhoodGuide | null>(initialNeighborhood);
  const [loading, setLoading] = useState(!initialNeighborhood);
  const [neighborhoodError, setNeighborhoodError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [relatedProperties, setRelatedProperties] = useState<Property[]>(() =>
    IS_DEMO_MODE ? FIXTURE_PROPERTIES : []
  );

  // Reset loading and data correctly when slug changes
  if (resolvedParams.slug !== currentSlug) {
    setCurrentSlug(resolvedParams.slug);
    const nextN = IS_DEMO_MODE ? FIXTURE_NEIGHBORHOODS.find((n) => n.slug === resolvedParams.slug) || null : null;
    setNeighborhood(nextN);
    setLoading(!nextN);
    setNeighborhoodError(null);
    setRelatedProperties(IS_DEMO_MODE ? FIXTURE_PROPERTIES : []);
  }

  useEffect(() => {
    let c = false;
    fetchNeighborhoodBySlug(resolvedParams.slug)
      .then((row) => {
        if (!c) {
          setNeighborhood(row);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!c) {
          setNeighborhoodError(err instanceof Error ? err.message : 'Unable to load neighborhood guide.');
          setLoading(false);
        }
      });
    return () => { c = true; };
  }, [resolvedParams.slug, reloadTrigger]);

  const propertyCities = neighborhood?.city;
  useEffect(() => {
    if (!propertyCities) return;
    let cancelled = false;
    const cities = propertyCities.split('/').map((city) => city.trim()).filter(Boolean);
    Promise.all(cities.map((location) => fetchProperties({ location })))
      .then((groups) => {
        if (!cancelled) {
          const unique = new Map(groups.flat().map((property) => [property.id, property]));
          setRelatedProperties([...unique.values()]);
        }
      })
      .catch(() => { if (!cancelled) setRelatedProperties([]); });
    return () => { cancelled = true; };
  }, [propertyCities, reloadTrigger]);

  const handleRetry = () => {
    setLoading(true);
    setNeighborhoodError(null);
    setRelatedProperties([]);
    setReloadTrigger((t) => t + 1);
  };

  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  const localProperties = neighborhood
    ? relatedProperties.filter(
        (p) =>
          p.neighborhood.toLowerCase().includes(neighborhood.name.toLowerCase().split(' ')[0]) ||
          neighborhood.city.toLowerCase().split('/').map((city) => city.trim()).includes(p.city.toLowerCase())
      )
    : [];

  useGSAP(
    () => {
      if (prefersReducedMotion() || !neighborhood) return;
      gsap.fromTo(
        '[data-nhdetail-enter]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.42, stagger: 0.065, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef, dependencies: [neighborhood?.slug] }
  );

  if (loading && !neighborhood) {
    return (
      <div className="min-h-screen bg-warm text-charcoal flex flex-col">
        <Header onOpenNia={() => setIsNiaOpen(true)} />
        <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-20 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-9 h-9 border-3 border-persimmon border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-muted-ink uppercase tracking-wider">Loading neighborhood guide...</p>
          </div>
        </main>
        <Footer onOpenNia={() => setIsNiaOpen(true)} />
      </div>
    );
  }

  // Recoverable error view for network/server failures
  if (neighborhoodError && !neighborhood) {
    return (
      <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
        <Header onOpenNia={() => setIsNiaOpen(true)} />
        <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-16 flex flex-col items-center justify-center text-center">
          <div className="bg-white rounded-3xl p-10 sm:p-14 border border-hairline shadow-sm max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal mb-2">
              Guide Temporarily Unavailable
            </h1>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed mb-6">
              {neighborhoodError}. Check your network connection or try again.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleRetry}
                className="px-6 py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider shadow-sm nestly-press cursor-pointer flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Retry Connection</span>
              </button>
              <Link
                href="/neighborhoods"
                className="px-6 py-3 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal text-xs font-bold uppercase tracking-wider border border-hairline nestly-press"
              >
                <span>All Neighborhoods</span>
              </Link>
            </div>
          </div>
        </main>
        <Footer onOpenNia={() => setIsNiaOpen(true)} />
        <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      </div>
    );
  }

  // 404 Not Found view
  if (!neighborhood) {
    return (
      <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
        <Header onOpenNia={() => setIsNiaOpen(true)} />
        <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-16 flex flex-col items-center justify-center text-center">
          <div className="bg-white rounded-3xl p-10 sm:p-14 border border-hairline shadow-sm max-w-lg mx-auto">
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal mb-2">
              Neighborhood Guide Not Found
            </h1>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed mb-6">
              We couldn&apos;t find an active neighborhood guide for &ldquo;{resolvedParams.slug}&rdquo;. Explore our other residential pockets in Edo and Delta States.
            </p>
            <Link
              href="/neighborhoods"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider shadow-sm nestly-press"
            >
              <span>Explore All Neighborhoods</span>
            </Link>
          </div>
        </main>
        <Footer onOpenNia={() => setIsNiaOpen(true)} />
        <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      </div>
    );
  }

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
            src={resolveEditorialImage(neighborhood.heroImage)}
            alt={`Residential architecture accompanying the ${neighborhood.name} guide`}
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
              2-Bed guide price
            </span>
            <p className="text-sm font-semibold text-charcoal leading-relaxed">
              {neighborhood.averageAnnualRent2Bed || 'Ask for current options'}
            </p>
            <span className="text-[11px] text-muted-ink">Confirm rent and fees on the listing</span>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">
              3-Bed guide price
            </span>
            <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">
              {neighborhood.averageAnnualRent3Bed || 'Ask for current options'}
            </p>
            <span className="text-[11px] text-muted-ink">Confirm rent and fees on the listing</span>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">
              Power & utilities
            </span>
            <p className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">
              {neighborhood.powerReliability || 'Confirm at the property'}
            </p>

          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">
              Access &amp; drainage
            </span>
            <p className="text-sm font-semibold text-charcoal leading-relaxed" title={neighborhood.roadNetwork}>
              {neighborhood.roadNetwork}
            </p>
            <span className="text-[11px] text-muted-ink">Check conditions during your viewing</span>
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
                Roads &amp; search areas
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
                Current listings around {neighborhood.city}
              </h2>
              <p className="text-xs sm:text-sm text-muted-ink mt-0.5">
                Compare the published details, fees and inspection availability for each home.
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

          {localProperties.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {localProperties.map((prop) => (
                <PropertyCard key={prop.id} property={prop} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 border border-hairline text-center max-w-md mx-auto">
              <p className="text-sm font-bold text-charcoal mb-1">No current listings in this area</p>
              <p className="text-xs text-muted-ink mb-4">Explore other areas or ask Nia to help refine your search.</p>
              <Link
                href="/browse"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider nestly-press"
              >
                <span>Browse available homes</span>
              </Link>
            </div>
          )}
        </section>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
