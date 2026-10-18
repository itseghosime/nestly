'use client';

import React, { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { PropertyCard } from '@/components/public/PropertyCard';
import { fetchProperties } from '@/lib/properties';
import { PROPERTIES as FIXTURE_PROPERTIES } from '@/lib/fixtures/properties';
import { prefersReducedMotion } from '@/lib/motion';
import {
  Search,
  SlidersHorizontal,
  MapPin,
  X,
  RotateCcw,
  ShieldCheck,
  ArrowUpDown
} from 'lucide-react';

function BrowseContent() {
  const searchParams = useSearchParams();
  const initialLocation = searchParams.get('location') || 'all';
  const initialBeds = searchParams.get('beds') || 'all';

  const [locationFilter, setLocationFilter] = useState(initialLocation);
  const [bedsFilter, setBedsFilter] = useState(initialBeds);
  const [maxPrice, setMaxPrice] = useState<number>(6000000);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'beds'>('featured');
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const [mobileFilterDrawerOpen, setMobileFilterDrawerOpen] = useState(false);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 9;
  const [properties, setProperties] = useState(FIXTURE_PROPERTIES);
  useEffect(() => {
    let cancelled = false;
    fetchProperties({ location: locationFilter, beds: bedsFilter, maxPrice, type: propertyTypeFilter, keyword, sort: sortBy })
      .then((rows) => {
        if (!cancelled) {
          setProperties(rows);
          setPropertiesError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPropertiesError(error instanceof Error ? error.message : 'Failed to load listings.');
        }
      });
    return () => { cancelled = true; };
  }, [locationFilter, bedsFilter, maxPrice, propertyTypeFilter, keyword, sortBy]);

  const mainRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const filterDrawerRef = useRef<HTMLDivElement>(null);
  const filterBackdropRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  const [prevLocation, setPrevLocation] = useState(initialLocation);
  if (initialLocation !== prevLocation) {
    setPrevLocation(initialLocation);
    setLocationFilter(initialLocation);
  }

  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      if (locationFilter !== 'all') {
        const locLower = locationFilter.toLowerCase();
        const matchesLoc =
          p.neighborhood.toLowerCase().includes(locLower) ||
          p.city.toLowerCase().includes(locLower) ||
          p.state.toLowerCase().includes(locLower) ||
          locLower.includes(p.city.toLowerCase()) ||
          locLower.includes(p.neighborhood.toLowerCase().split(' ')[0]);
        if (!matchesLoc) return false;
      }

      if (bedsFilter !== 'all') {
        if (bedsFilter === '1' && p.bedrooms !== 1) return false;
        if (bedsFilter === '2' && p.bedrooms !== 2) return false;
        if (bedsFilter === '3' && p.bedrooms !== 3) return false;
        if (bedsFilter === '4+' && p.bedrooms < 4) return false;
        if (bedsFilter.includes('2 or 3') && p.bedrooms !== 2 && p.bedrooms !== 3) return false;
      }

      if (propertyTypeFilter !== 'all' && p.propertyType !== propertyTypeFilter) {
        return false;
      }

      if (p.priceAnnual > maxPrice) {
        return false;
      }

      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const matchesKeyword =
          p.title.toLowerCase().includes(q) ||
          p.tagline.toLowerCase().includes(q) ||
          p.neighborhood.toLowerCase().includes(q) ||
          p.features.some((f) => f.toLowerCase().includes(q));
        if (!matchesKeyword) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'price-asc') return a.priceAnnual - b.priceAnnual;
      if (sortBy === 'price-desc') return b.priceAnnual - a.priceAnnual;
      if (sortBy === 'beds') return b.bedrooms - a.bedrooms;
      return 0;
    });
  }, [properties, locationFilter, bedsFilter, maxPrice, propertyTypeFilter, keyword, sortBy]);

  // Initial page entrance
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-browse-enter]',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.38, stagger: 0.06, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef }
  );

  // Animate result changes & empty state when filters change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (prefersReducedMotion()) return;

    if (filteredProperties.length > 0 && gridRef.current) {
      const cards = gridRef.current.querySelectorAll('.property-card');
      gsap.fromTo(
        cards,
        { opacity: 0, y: 12, scale: 0.985 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.26,
          stagger: 0.04,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    } else if (filteredProperties.length === 0 && emptyRef.current) {
      gsap.fromTo(
        emptyRef.current,
        { opacity: 0, y: 14, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power2.out', clearProps: 'all' }
      );
    }
  }, [filteredProperties]);

  // Mobile Filter Drawer coordination
  useEffect(() => {
    if (!mobileFilterDrawerOpen) return;
    if (!prefersReducedMotion() && filterDrawerRef.current && filterBackdropRef.current) {
      gsap.fromTo(filterBackdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.22 });
      gsap.fromTo(
        filterDrawerRef.current,
        { yPercent: 100 },
        { yPercent: 0, duration: 0.3, ease: 'power3.out' }
      );
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileFilterDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileFilterDrawerOpen]);

  const resetFilters = () => {
    setLocationFilter('all');
    setBedsFilter('all');
    setMaxPrice(6000000);
    setPropertyTypeFilter('all');
    setKeyword('');
    setSortBy('featured');
  };

  const hasActiveFilters =
    locationFilter !== 'all' ||
    bedsFilter !== 'all' ||
    propertyTypeFilter !== 'all' ||
    Boolean(keyword.trim()) ||
    maxPrice < 6000000;

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-[1360px] mx-auto w-full px-4 sm:px-8 lg:px-12 py-8 sm:py-12">
        {/* Breadcrumb & Page Header */}
        <div data-browse-enter className="mb-8 sm:mb-10">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-ink mb-3">
            <Link href="/" className="hover:text-charcoal transition-colors">Home</Link>
            <span>/</span>
            <span className="text-charcoal font-bold">Browse Verified Homes</span>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal">
                Explore Homes in Edo &amp; Delta
              </h1>
              <p className="text-sm sm:text-base text-muted-ink mt-2 max-w-xl">
                Every listing is visited and vetted by our authorized field operations team. Verified C-of-O/deed status, independent prepaid power, and treated borehole water.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-soft-stone text-xs font-bold text-charcoal border border-hairline">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Zero Upfront Registration Fee</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileFilterDrawerOpen(true)}
                className="sm:hidden inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-charcoal text-white text-xs font-bold nestly-press"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters</span>
              </button>
            </div>
          </div>
        </div>

        {/* Floating Comprehensive Filter Surface */}
        <div data-browse-enter className="bg-white rounded-3xl p-4 sm:p-6 border border-hairline shadow-sm mb-10">
          {/* Top Filter Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-muted-ink absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                aria-label="Search amenities or keywords"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Search amenities (solar, gated, etc)..."
                className="w-full pl-9 pr-8 py-2.5 rounded-full bg-soft-stone text-xs font-medium text-charcoal placeholder-muted-ink focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-shadow"
              />
              {keyword && (
                <button
                  type="button"
                  aria-label="Clear keyword search"
                  onClick={() => setKeyword('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-ink hover:text-charcoal cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Location Selector */}
            <div className="flex items-center justify-between px-4 py-2 rounded-full bg-soft-stone border border-hairline">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <MapPin className="w-4 h-4 text-muted-ink shrink-0" />
                <select
                  aria-label="Filter by location"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="bg-transparent text-xs font-bold text-charcoal focus:outline-none cursor-pointer w-full"
                >
                  <option value="all">All Locations (Benin &amp; Delta)</option>
                  <option value="GRA">GRA Benin City</option>
                  <option value="Boundary">Boundary Road, Benin</option>
                  <option value="Ihama">Ihama Road Axis</option>
                  <option value="Ugbor">Ugbor / Airport Rd</option>
                  <option value="Sapele">Clinic Road, Sapele</option>
                  <option value="Warri">Effurun GRA, Warri</option>
                </select>
              </div>
            </div>

            {/* Bedroom Pills */}
            <div className="flex items-center justify-between px-4 py-1.5 rounded-full bg-soft-stone border border-hairline">
              <span className="text-[11px] font-extrabold uppercase text-muted-ink tracking-wider mr-2">Beds:</span>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {['all', '1', '2', '3', '4+'].map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBedsFilter(b)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold nestly-press cursor-pointer ${
                      bedsFilter === b
                        ? 'bg-primary text-white shadow-2xs'
                        : 'text-charcoal/70 hover:bg-stone-card'
                    }`}
                  >
                    {b === 'all' ? 'Any' : b}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Rent Slider */}
            <div className="flex flex-col justify-center px-4 py-1 rounded-2xl bg-soft-stone border border-hairline">
              <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                <span className="text-muted-ink uppercase tracking-wider">Max Rent:</span>
                <span className="text-persimmon font-extrabold">
                  {maxPrice >= 6000000 ? '₦6,000,000+' : `₦${(maxPrice / 1000000).toFixed(1)}M`}
                </span>
              </div>
              <input
                type="range"
                aria-label="Maximum annual rent"
                min="1000000"
                max="6000000"
                step="250000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-persimmon cursor-pointer h-1.5 bg-hairline rounded-lg"
              />
            </div>
          </div>

          {/* Property Type Quick Chips */}
          <div className="flex items-center gap-2 pt-3.5 mt-3.5 border-t border-hairline/70 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-ink shrink-0 mr-1">
              Type:
            </span>
            {[
              { id: 'all', label: 'All Types' },
              { id: 'Apartment', label: 'Apartments' },
              { id: 'Terrace Duplex', label: 'Terrace Duplexes' },
              { id: 'Self-Contained', label: 'Self-Contained / Studio' },
              { id: 'Detached House', label: 'Detached Homes' },
            ].map((type) => {
              const active = propertyTypeFilter === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setPropertyTypeFilter(type.id)}
                  className={`px-3.5 py-1 rounded-full text-xs font-bold whitespace-nowrap nestly-press cursor-pointer ${
                    active
                      ? 'bg-charcoal text-white'
                      : 'bg-soft-stone text-charcoal/80 hover:bg-stone-card'
                  }`}
                >
                  {type.label}
                </button>
              );
            })}
          </div>

          {/* Active Filter Badges & Sort Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 mt-4 border-t border-hairline">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-charcoal bg-soft-stone px-3 py-1 rounded-full border border-hairline">
                {filteredProperties.length} {filteredProperties.length === 1 ? 'verified home' : 'verified homes'}
              </span>

              {locationFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setLocationFilter('all')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-persimmon-soft text-persimmon border border-persimmon/20 text-[11px] font-bold nestly-press cursor-pointer"
                >
                  <span>Location: {locationFilter}</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {bedsFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setBedsFilter('all')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-persimmon-soft text-persimmon border border-persimmon/20 text-[11px] font-bold nestly-press cursor-pointer"
                >
                  <span>{bedsFilter} Beds</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {propertyTypeFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setPropertyTypeFilter('all')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-persimmon-soft text-persimmon border border-persimmon/20 text-[11px] font-bold nestly-press cursor-pointer"
                >
                  <span>{propertyTypeFilter}</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {maxPrice < 6000000 && (
                <button
                  type="button"
                  onClick={() => setMaxPrice(6000000)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-persimmon-soft text-persimmon border border-persimmon/20 text-[11px] font-bold nestly-press cursor-pointer"
                >
                  <span>Max ₦{(maxPrice / 1000000).toFixed(1)}M</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {keyword.trim() && (
                <button
                  type="button"
                  onClick={() => setKeyword('')}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-persimmon-soft text-persimmon border border-persimmon/20 text-[11px] font-bold nestly-press cursor-pointer"
                >
                  <span>&ldquo;{keyword.trim()}&rdquo;</span>
                  <X className="w-3 h-3" />
                </button>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-ink hover:text-persimmon underline ml-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Clear all</span>
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-ink" />
              <label htmlFor="browse-sort" className="text-muted-ink font-medium">Sort:</label>
              <select
                id="browse-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'featured' | 'price-asc' | 'price-desc' | 'beds')}
                className="bg-soft-stone border border-hairline px-3 py-1.5 rounded-full font-bold text-xs text-charcoal focus:outline-none cursor-pointer"
              >
                <option value="featured">Featured / Recommended</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="beds">Most Bedrooms</option>
              </select>
            </div>
          </div>
        </div>

        {/* Listings Grid */}
        {filteredProperties.length > 0 ? (
          <div ref={gridRef} data-browse-enter className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProperties.map((prop) => (
              <PropertyCard key={prop.id} property={prop} />
            ))}
          </div>
        ) : (
          /* Empty Search State */
          <div
            ref={emptyRef}
            className="bg-white rounded-3xl p-12 text-center border border-hairline max-w-lg mx-auto shadow-sm"
          >
            <div className="w-16 h-16 rounded-full bg-soft-stone text-muted-ink flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h3 className="font-headline text-2xl font-bold text-charcoal mb-2">
              No matching verified homes
            </h3>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed mb-6">
              We couldn&apos;t find any listings matching your specific combination of location, bedroom count, and budget. Try loosening the filters or ask Nia.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="px-6 py-2.5 rounded-full bg-charcoal text-white text-xs font-bold hover:bg-black nestly-press cursor-pointer"
              >
                Reset All Filters
              </button>
              <button
                type="button"
                onClick={() => setIsNiaOpen(true)}
                className="px-6 py-2.5 rounded-full bg-persimmon text-white text-xs font-bold hover:bg-persimmon-hover nestly-press cursor-pointer"
              >
                Ask Nia for Off-Market Options
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Sheet Filter Drawer */}
      {mobileFilterDrawerOpen && (
        <div
          className="fixed inset-0 z-50 sm:hidden flex flex-col justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Filter Homes"
        >
          <div
            ref={filterBackdropRef}
            onClick={() => setMobileFilterDrawerOpen(false)}
            className="fixed inset-0 bg-charcoal/45 backdrop-blur-xs"
          />
          <div
            ref={filterDrawerRef}
            className="relative bg-warm rounded-t-3xl p-6 border-t border-hairline shadow-2xl z-10 space-y-5 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-hairline">
              <h3 className="font-headline text-lg font-extrabold text-charcoal">Refine Search</h3>
              <button
                type="button"
                onClick={() => setMobileFilterDrawerOpen(false)}
                className="w-8 h-8 rounded-full bg-soft-stone flex items-center justify-center text-charcoal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-ink block mb-1.5">Property Type</label>
                <div className="flex flex-wrap gap-2">
                  {['all', 'Apartment', 'Terrace Duplex', 'Self-Contained', 'Detached House'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPropertyTypeFilter(t)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold ${
                        propertyTypeFilter === t ? 'bg-charcoal text-white' : 'bg-white border border-hairline text-charcoal'
                      }`}
                    >
                      {t === 'all' ? 'All Types' : t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-muted-ink block mb-1.5">Bedrooms</label>
                <div className="flex flex-wrap gap-2">
                  {['all', '1', '2', '3', '4+'].map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBedsFilter(b)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                        bedsFilter === b ? 'bg-primary text-white' : 'bg-white border border-hairline text-charcoal'
                      }`}
                    >
                      {b === 'all' ? 'Any' : `${b} Beds`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-hairline flex items-center gap-3">
              <button
                type="button"
                onClick={resetFilters}
                className="flex-1 py-3 rounded-full bg-soft-stone text-charcoal text-xs font-bold"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setMobileFilterDrawerOpen(false)}
                className="flex-1 py-3 rounded-full bg-persimmon text-white text-xs font-bold"
              >
                Show {filteredProperties.length} Homes
              </button>
            </div>
          </div>
        </div>
      )}

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}

export default function BrowseHomesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-warm flex items-center justify-center text-sm font-bold text-muted-ink">Loading verified listings...</div>}>
      <BrowseContent />
    </Suspense>
  );
}
