'use client';

import { resolveEditorialImage } from '@/lib/editorial-images';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { fetchNeighborhoods } from '@/lib/neighborhoods';
import type { NeighborhoodGuide } from '@/lib/types';
import { prefersReducedMotion } from '@/lib/motion';
import {
  Search,
  ArrowRight,
  X
} from 'lucide-react';

export default function NeighborhoodsPage() {
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchNeighborhoods()
      .then((rows) => {
        if (!cancelled) setNeighborhoods(rows);
      })
      .catch(() => {
        if (!cancelled) setLoadError('The guides could not be loaded. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadTrigger]);
  const [stateFilter, setStateFilter] = useState<'all' | 'Edo' | 'Delta'>('all');
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  const filtered = useMemo(() => {
    return neighborhoods.filter((n) => {
      if (stateFilter !== 'all' && n.state !== stateFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          n.name.toLowerCase().includes(q) ||
          n.city.toLowerCase().includes(q) ||
          n.overview.toLowerCase().includes(q) ||
          n.popularStreets.some((s) => s.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [neighborhoods, stateFilter, searchTerm]);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-nh-enter]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.065, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef }
  );

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (prefersReducedMotion() || !gridRef.current) return;
    const cards = gridRef.current.querySelectorAll('[data-nh-card]');
    if (cards.length > 0) {
      gsap.fromTo(
        cards,
        { opacity: 0, y: 12, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, stagger: 0.05, ease: 'power2.out', clearProps: 'all' }
      );
    }
  }, [filtered]);

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-10 sm:py-16">
        {/* Hero Section */}
        <div data-nh-enter className="max-w-3xl mb-10 sm:mb-14">
          <span className="text-xs font-bold tracking-widest text-persimmon uppercase mb-3 inline-block">
            REGIONAL POCKETS · EDO &amp; DELTA
          </span>

          <h1 className="font-headline text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-charcoal leading-[1.06] mb-4">
            Neighborhood Guides.
          </h1>

          <p className="text-sm sm:text-lg text-muted-ink leading-relaxed font-normal">
            Explore area guides across Benin City and Delta State, with practical prompts on access, utilities, and questions to ask before choosing a home.
          </p>

          <div className="mt-4 inline-block px-3.5 py-1.5 rounded-full bg-persimmon-soft text-persimmon text-xs font-semibold border border-persimmon/20">
            General area information only. Confirm property conditions, fees, utilities, access, and availability independently.
          </div>
        </div>

        {/* Interactive Search & Filter Controls */}
        <div data-nh-enter className="mb-12 space-y-4">
          <div className="relative max-w-xl">
            <Search className="w-5 h-5 text-muted-ink absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search neighborhoods"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search neighborhood (e.g. GRA, Boundary Road, Clinic Road, Sapele)..."
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-hairline rounded-full text-xs sm:text-sm text-charcoal placeholder-muted-ink focus:outline-none focus:ring-2 focus:ring-charcoal/20 shadow-2xs transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-ink hover:text-charcoal cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'all', label: 'All Pockets' },
              { id: 'Edo', label: 'Edo State (Benin City)' },
              { id: 'Delta', label: 'Delta State (Sapele & Warri)' },
            ].map((f) => {
              const active = stateFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStateFilter(f.id as 'all' | 'Edo' | 'Delta')}
                  className={`px-4 py-2 rounded-full text-xs font-bold nestly-press cursor-pointer ${
                    active
                      ? 'bg-charcoal text-white shadow-xs'
                      : 'bg-white hover:bg-stone-card text-charcoal border border-hairline'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <p role="status" className="py-8 text-sm text-muted-ink">Loading neighbourhood guides…</p>
        ) : loadError ? (
          <div role="alert" className="mb-8 rounded-2xl border border-hairline bg-white p-6">
            <p className="mb-4 text-sm text-charcoal">{loadError}</p>
            <button type="button" className="shrink-0 rounded-full bg-charcoal px-5 py-3 text-sm font-bold text-white"
              onClick={() => { setLoading(true); setLoadError(null); setReloadTrigger((value) => value + 1); }}>
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p role="status" className="py-8 text-sm text-muted-ink">
            {neighborhoods.length === 0 ? 'Neighbourhood guides are being prepared. Browse available homes or ask Nia for help.' : 'No guides match your search. Try another area or clear the filters.'}
          </p>
        ) : null}

        {/* Neighborhoods Grid */}
        <div ref={gridRef} data-nh-enter className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filtered.map((n) => (
            <article
              key={n.id}
              data-nh-card
              className="property-card-hover bg-white rounded-3xl overflow-hidden border border-hairline shadow-sm flex flex-col justify-between group"
            >
              <div>
                <div className="relative w-full h-[240px] sm:h-[280px] bg-soft-stone overflow-hidden">
                  <img
                    src={resolveEditorialImage(n.heroImage)}
                    alt={`Residential architecture accompanying the ${n.name} guide`}
                    className="property-card-img w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[11px] font-extrabold uppercase tracking-wider text-charcoal">
                    {n.city}, {n.state}
                  </div>
                </div>

                <div className="p-6">
                  <Link href={`/neighborhoods/${n.slug}`}>
                    <h2 className="font-headline text-2xl font-bold text-charcoal mb-2 group-hover:text-persimmon transition-colors">
                      {n.name}
                    </h2>
                  </Link>
                  <p className="text-xs sm:text-sm text-muted-ink line-clamp-2 leading-relaxed mb-4">
                    {n.tagline}
                  </p>

                  {/* Micro Metrics */}
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-soft-stone border border-hairline text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-ink block">3-Bed guide price</span>
                      <span className="font-extrabold text-charcoal">{n.averageAnnualRent3Bed || 'Ask for current options'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-ink block">Guide covers</span>
                      <span className="font-extrabold text-charcoal">
                        Access, utilities & costs
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6 pt-2">
                <Link
                  href={`/neighborhoods/${n.slug}`}
                  className="w-full py-3 px-4 rounded-xl bg-warm border border-hairline hover:bg-stone-card text-charcoal text-xs font-bold flex items-center justify-center gap-2 nestly-press"
                >
                  <span>Explore In-Depth Guide</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-ink group-hover:translate-x-1 transition-transform duration-150" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
