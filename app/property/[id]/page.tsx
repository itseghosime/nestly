'use client';

import React, { useState, useRef, use, useMemo, useEffect } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { PropertyCard } from '@/components/public/PropertyCard';
import { PropertyGallery } from '@/components/public/PropertyGallery';
import { fetchPropertyById, fetchProperties as fetchAllProperties, syncRelatedProperties, IS_DEMO_MODE } from '@/lib/properties';
import { PROPERTIES as FIXTURE_PROPERTIES } from '@/lib/fixtures/properties';
import { computeTotal, computeFeeBreakdown, formatPrice } from '@/lib/price';
import type { Property } from '@/lib/types';
import { useSavedHomes } from '@/lib/saved-homes-context';
import { usePropertyTransition } from '@/lib/property-transition-context';
import { prefersReducedMotion, peekLastListingPath } from '@/lib/motion';
import {
  Heart,
  Share2,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Compass,
  ArrowLeft,
  Check,
  MapPin,
  Home,
  MessageSquare,
  AlertCircle,
  RotateCcw
} from 'lucide-react';

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const initialProp = IS_DEMO_MODE ? FIXTURE_PROPERTIES.find((p) => p.id === resolvedParams.id) || null : null;
  const [currentId, setCurrentId] = useState(resolvedParams.id);
  const [property, setProperty] = useState<Property | null>(initialProp);
  const [loading, setLoading] = useState(!initialProp);
  const [propertyError, setPropertyError] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [relatedProperties, setRelatedProperties] = useState<Property[]>(() =>
    IS_DEMO_MODE ? FIXTURE_PROPERTIES.filter((p) => p.id !== resolvedParams.id).slice(0, 3) : []
  );

  // Reset loading and data correctly when route params change
  if (resolvedParams.id !== currentId) {
    setCurrentId(resolvedParams.id);
    const nextProp = IS_DEMO_MODE ? FIXTURE_PROPERTIES.find((p) => p.id === resolvedParams.id) || null : null;
    setProperty(nextProp);
    setLoading(!nextProp);
    setPropertyError(null);
    setRelatedProperties(IS_DEMO_MODE ? FIXTURE_PROPERTIES.filter((p) => p.id !== resolvedParams.id).slice(0, 3) : []);
  }

  useEffect(() => {
    let c = false;
    fetchPropertyById(resolvedParams.id)
      .then((row) => {
        if (!c) {
          setProperty(row);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!c) {
          setPropertyError(err instanceof Error ? err.message : 'Unable to load property details.');
          setLoading(false);
        }
      });

    syncRelatedProperties(resolvedParams.id, setRelatedProperties, () => c, fetchAllProperties);
    return () => { c = true; };
  }, [resolvedParams.id, reloadTrigger]);

  const { isSaved, toggleSave } = useSavedHomes();
  const { isMorphingProperty } = usePropertyTransition();
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [backHref] = useState(() => peekLastListingPath() || '/browse');

  const mainRef = useRef<HTMLElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const currentProperty = property;

  // Grounded fee calculation using confirmed per-property fee ledger and existing computeTotal contract
  const propertyFees = property?.fees;
  const annualRent = property?.priceAnnual;

  const feeBreakdown = useMemo(() => {
    if (annualRent == null || !propertyFees || !Array.isArray(propertyFees)) return [];
    return computeFeeBreakdown(annualRent, propertyFees);
  }, [annualRent, propertyFees]);

  const totalMoveIn = useMemo(() => {
    if (annualRent == null || !propertyFees || !Array.isArray(propertyFees)) return null;
    return computeTotal(annualRent, propertyFees);
  }, [annualRent, propertyFees]);

  const saved = property ? isSaved(property.id) : false;

  const handleSaveProperty = () => {
    if (!property) return;
    toggleSave(property.id);
    if (!prefersReducedMotion() && saveBtnRef.current) {
      gsap.fromTo(
        saveBtnRef.current,
        { scale: 0.9 },
        { scale: 1, duration: 0.32, ease: 'back.out(2.2)' }
      );
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleRetry = () => {
    setLoading(true);
    setPropertyError(null);
    setRelatedProperties([]);
    setReloadTrigger((t) => t + 1);
  };

  // Coordinate destination title, badges, thumbnails, and booking card around the hero transition
  useGSAP(
    () => {
      if (prefersReducedMotion() || !currentProperty) return;

      const morphing = isMorphingProperty(currentProperty.id);
      const baseDelay = morphing ? 0.14 : 0;

      gsap.fromTo(
        '[data-property-meta]',
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.42,
          stagger: 0.055,
          delay: baseDelay,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );

      gsap.fromTo(
        '[data-property-section]',
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.44,
          stagger: 0.07,
          delay: baseDelay + 0.12,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: mainRef, dependencies: [currentProperty?.id] }
  );

  if (loading && !property) {
    return (
      <div className="min-h-screen bg-warm text-charcoal flex flex-col">
        <Header onOpenNia={() => setIsNiaOpen(true)} />
        <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-20 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-9 h-9 border-3 border-persimmon border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-muted-ink uppercase tracking-wider">Verifying listing details...</p>
          </div>
        </main>
        <Footer onOpenNia={() => setIsNiaOpen(true)} />
      </div>
    );
  }

  // Recoverable network/server error view
  if (propertyError && !property) {
    return (
      <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
        <Header onOpenNia={() => setIsNiaOpen(true)} />
        <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-16 flex flex-col items-center justify-center text-center">
          <div className="bg-white rounded-3xl p-10 sm:p-14 border border-hairline shadow-sm max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-4 border border-amber-200">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal mb-2">
              Listing Temporarily Unavailable
            </h1>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed mb-6">
              {propertyError}. Check your network connection or retry the request.
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
                href="/browse"
                className="px-6 py-3 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal text-xs font-bold uppercase tracking-wider border border-hairline nestly-press"
              >
                <span>Browse Listings</span>
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
  if (!property) {
    return (
      <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
        <Header onOpenNia={() => setIsNiaOpen(true)} />
        <main className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-16 flex flex-col items-center justify-center text-center">
          <div className="bg-white rounded-3xl p-10 sm:p-14 border border-hairline shadow-sm max-w-lg mx-auto">
            <div className="w-16 h-16 rounded-full bg-soft-stone text-persimmon flex items-center justify-center mx-auto mb-4">
              <Home className="w-8 h-8" />
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal mb-2">
              Property Not Found
            </h1>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed mb-6">
              Listing reference &ldquo;{resolvedParams.id}&rdquo; was not found in our verified database or may have been archived following a confirmed lease.
            </p>
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider shadow-sm nestly-press"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Browse Verified Homes</span>
            </Link>
          </div>
        </main>
        <Footer onOpenNia={() => setIsNiaOpen(true)} />
        <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      </div>
    );
  }

  const morphing = isMorphingProperty(property.id);

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-8 sm:py-12">
        {/* Navigation Breadcrumb & Back */}
        <div data-property-meta className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-charcoal/70 hover:text-persimmon transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
            <span>Back to all verified listings</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="px-3.5 py-1.5 rounded-full bg-white border border-hairline hover:bg-soft-stone text-xs font-bold text-charcoal flex items-center gap-1.5 shadow-2xs nestly-press cursor-pointer"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Link Copied!' : 'Share Listing'}</span>
            </button>

            <button
              ref={saveBtnRef}
              type="button"
              onClick={handleSaveProperty}
              aria-pressed={saved}
              className={`px-3.5 py-1.5 rounded-full border border-hairline text-xs font-bold flex items-center gap-1.5 shadow-2xs nestly-press cursor-pointer ${
                saved ? 'bg-persimmon text-white border-persimmon' : 'bg-white hover:bg-soft-stone text-charcoal'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${saved ? 'fill-white' : ''}`} />
              <span>{saved ? 'Saved in Shortlist' : 'Save Property'}</span>
            </button>
          </div>
        </div>

        {/* Title, Badge & Location Header */}
        <div data-property-meta className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{property.verificationBadge}</span>
            </span>
            <span className="px-3 py-1 rounded-full bg-soft-stone text-muted-ink text-xs font-semibold">
              Ref ID: {property.id}
            </span>
            <span className="px-3 py-1 rounded-full bg-soft-stone text-muted-ink text-xs font-semibold">
              Inspection Status: {property.inspectionStatus}
            </span>
          </div>

          <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal mt-2 mb-2">
            {property.title}
          </h1>

          <div className="flex items-center gap-2 text-sm text-muted-ink font-medium">
            <MapPin className="w-4 h-4 text-persimmon shrink-0" />
            <span>{property.addressShort}</span>
          </div>
        </div>

        <PropertyGallery property={property} morphing={morphing} />

        {/* Content & Sticky Booking Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column (Details, Amenities, Fee Sheet) */}
          <div className="lg:col-span-8 space-y-12">
            {/* Quick Spec Pills */}
            <div
              data-property-section
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white rounded-3xl p-5 border border-hairline shadow-2xs"
            >
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">Bedrooms</span>
                <p className="font-headline text-xl font-extrabold text-charcoal">{property.bedrooms} En-Suite</p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">Bathrooms</span>
                <p className="font-headline text-xl font-extrabold text-charcoal">{property.bathrooms} Baths</p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">Power</span>
                <p className="font-headline text-sm font-extrabold text-charcoal truncate" title={property.powerRating || 'Not provided'}>
                  {property.powerRating ? `${property.powerRating.split(' ')[0]} Daily` : 'Not provided'}
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">Water Supply</span>
                <p className="font-headline text-sm font-extrabold text-charcoal truncate" title={property.waterSupply || 'Not provided'}>
                  {property.waterSupply ? 'Treated Borehole' : 'Not provided'}
                </p>
              </div>
            </div>

            {/* Description Section */}
            <div data-property-section>
              <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal mb-4">
                About the Residence
              </h2>
              <p className="text-sm sm:text-base leading-relaxed text-charcoal/80 font-normal">
                {property.description}
              </p>
              <p className="text-sm sm:text-base leading-relaxed text-charcoal/80 font-normal mt-3">
                {property.tagline}
              </p>
            </div>

            {/* Verified Amenities */}
            <div data-property-section>
              <h2 className="font-headline text-2xl font-extrabold text-charcoal mb-4">
                Verified Building Features
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {property.features.map((feature, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-hairline shadow-2xs"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs sm:text-sm font-bold text-charcoal">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 100% Itemized Upfront Costs */}
            <div data-property-section className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-sm">
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-hairline">
                <div>
                  <h2 className="font-headline text-2xl font-extrabold text-charcoal">
                    100% Itemized Upfront Costs
                  </h2>
                  <p className="text-xs text-muted-ink mt-0.5">
                    Clear transparent breakdown with zero undisclosed agency mobilizations.
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-700 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200">
                  {property.verificationBadge}
                </span>
              </div>

              <div className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between py-1">
                  <span className="text-charcoal/80 font-medium">Base Annual Rent (12 months)</span>
                  <span className="font-extrabold text-charcoal">{property.priceFormatted}</span>
                </div>

                {feeBreakdown.length > 0 ? (
                  feeBreakdown.map((fee) => {
                    const isConfirmed = !!fee.confirmed_at;
                    const feeAmountNum = Number(fee.amount);
                    const feeValueDisplay = fee.kind === 'fixed'
                      ? formatPrice(feeAmountNum)
                      : `${feeAmountNum}% of ${fee.base === 'rent' ? 'Annual Rent' : 'Subtotal'} (${formatPrice(fee.calculatedAmount)})`;

                    const feeLabel = (fee as { label?: string }).label || (
                      fee.fee_key === 'caution_deposit'
                        ? 'Refundable Caution Deposit'
                        : fee.fee_key === 'legal_fee'
                          ? 'Legal Agreement Draft & Stamping'
                          : fee.fee_key === 'agency_fee'
                            ? 'Agency Service & Handover'
                            : fee.fee_key === 'service_charge'
                              ? 'Annual Estate Service Charge'
                              : fee.fee_key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                    );

                    return (
                      <div key={fee.fee_key} className="flex items-center justify-between py-1 border-t border-hairline">
                        <div className="flex items-center gap-1.5">
                          <span className="text-charcoal/80 font-medium">{feeLabel}</span>
                          {!isConfirmed && (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              Pending Confirmation
                            </span>
                          )}
                        </div>
                        <span className={`font-extrabold ${isConfirmed ? 'text-charcoal' : 'text-amber-800'}`}>
                          {feeValueDisplay}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-2 border-t border-hairline text-xs text-muted-ink">
                    No confirmed fee ledger recorded for this listing. All additional fees remain subject to landlord confirmation.
                  </div>
                )}

                <div className="pt-4 mt-2 border-t-2 border-charcoal flex items-center justify-between">
                  <div>
                    <span className="font-headline text-base font-extrabold text-charcoal block">
                      Total Estimated Move-in Cost
                    </span>
                    <span className="text-[11px] text-muted-ink">
                      {totalMoveIn !== null
                        ? 'Excludes optional furniture package. Paid directly upon title verification.'
                        : 'One or more required fees are pending landlord/agent confirmation.'}
                    </span>
                  </div>
                  {totalMoveIn !== null ? (
                    <span className="font-headline text-2xl font-extrabold text-persimmon">
                      {formatPrice(totalMoveIn)}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                      Total unavailable — pending fee confirmation
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Neighborhood & Proximity */}
            <div data-property-section>
              <h2 className="font-headline text-2xl font-extrabold text-charcoal mb-4">
                Neighborhood &amp; Proximity
              </h2>
              <div className="bg-soft-stone rounded-3xl p-6 border border-hairline space-y-3">
                {property.nearbyLandmarks.map((lm, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm font-medium text-charcoal">
                    <Compass className="w-4 h-4 text-persimmon shrink-0" />
                    <span>{lm}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column (Sticky Booking Box) */}
          <div data-property-section className="lg:col-span-4 sticky top-28 space-y-6">
            <div className="bg-white rounded-3xl p-6 border border-hairline shadow-md">
              <div className="pb-4 mb-5 border-b border-hairline">
                <span className="text-[11px] uppercase tracking-wider text-muted-ink font-semibold block">
                  Annual Rent
                </span>
                <p className="font-headline text-3xl font-extrabold text-charcoal">
                  {property.priceFormatted}
                  <span className="text-sm font-normal text-muted-ink"> / year</span>
                </p>
                <p className="text-[11px] text-emerald-700 font-bold mt-1">
                  ✓ Title Verified &amp; Ready for Viewing
                </p>
              </div>

              <div className="space-y-3.5">
                <Link
                  href={`/inspection-request?property=${property.id}`}
                  className="w-full py-3.5 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md nestly-press"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Request In-Person Viewing</span>
                </Link>

                <button
                  type="button"
                  onClick={() => setIsNiaOpen(true)}
                  className="w-full py-3 px-4 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal text-xs font-bold flex items-center justify-center gap-2 border border-hairline nestly-press cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <span>Ask Nia About This Listing</span>
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-hairline space-y-2.5 text-xs text-muted-ink">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Accompanied inspection with real staff</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Key handover coordinated directly with landlord</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>No blind deposits required before viewing</span>
                </div>
              </div>
            </div>

            {/* Landlord & Agent Trust Card */}
            {property.landlordContact && (
              <div className="bg-soft-stone rounded-3xl p-5 border border-hairline text-xs">
                <h4 className="font-bold text-charcoal mb-1">Landlord Instruction</h4>
                <p className="text-muted-ink">
                  Vetted Landlord: <span className="font-bold text-charcoal">{property.landlordContact.name}</span>
                </p>
                <p className="text-muted-ink mt-0.5">
                  Verified with Nestly since {property.landlordContact.verifiedSince}. Direct instruction with physical title confirmation.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Related Verified Homes (Supports Signature Card-to-Detail Transition) */}
        <section className="mt-20 pt-14 border-t border-hairline">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-muted-ink">
                Continue Exploring
              </span>
              <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal mt-1">
                Similar Verified Homes in Edo &amp; Delta
              </h2>
            </div>
            <Link
              href="/browse"
              className="text-xs font-bold text-persimmon hover:text-charcoal transition-colors"
            >
              View all verified listings →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {relatedProperties.map((relProp) => (
              <PropertyCard key={relProp.id} property={relProp} />
            ))}
          </div>
        </section>
      </main>



      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
