'use client';

import React, { useState, useRef, use } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { PropertyCard } from '@/components/public/PropertyCard';
import { PropertyGallery } from '@/components/public/PropertyGallery';
import { fetchPropertyById } from '@/lib/properties';
import { fetchProperties as fetchAllProperties } from '@/lib/properties';
import { PROPERTIES as FIXTURE_PROPERTIES } from '@/lib/fixtures/properties';
import { useSavedHomes } from '@/lib/saved-homes-context';
import { usePropertyTransition } from '@/lib/property-transition-context';
import { prefersReducedMotion, peekLastListingPath } from '@/lib/motion';
import {
  Heart,
  Share2,
  Calendar,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Compass,
  ArrowLeft,
  Info,
  Check,
  MapPin
} from 'lucide-react';

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [property, setProperty] = React.useState<import('@/lib/types').Property | null>(() => FIXTURE_PROPERTIES.find((p) => p.id === resolvedParams.id) || FIXTURE_PROPERTIES[0]);
  const [relatedProperties, setRelatedProperties] = React.useState<import('@/lib/types').Property[]>(() => FIXTURE_PROPERTIES.filter((p) => p.id !== (FIXTURE_PROPERTIES.find((x) => x.id === resolvedParams.id) || FIXTURE_PROPERTIES[0]).id).slice(0, 3));
  React.useEffect(() => {
    let c = false;
    fetchPropertyById(resolvedParams.id).then((row) => { if (!c && row) setProperty(row); });
    fetchAllProperties().then((rows) => { if (!c && rows.length) setRelatedProperties(rows.filter((r) => r.id !== resolvedParams.id).slice(0, 3)); });
    return () => { c = true; };
  }, [resolvedParams.id]);
  const { isSaved, toggleSave } = useSavedHomes();
  const { isMorphingProperty } = usePropertyTransition();
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [backHref] = useState(() => peekLastListingPath() || '/browse');

  const mainRef = useRef<HTMLElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const currentProperty = property ?? FIXTURE_PROPERTIES[0];

  // Coordinate destination title, badges, thumbnails, and booking card around the hero transition
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

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
    { scope: mainRef, dependencies: [currentProperty.id] }
  );

  if (!property) return null;

  const saved = isSaved(property.id);

  const handleSaveProperty = () => {
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

  // Fee calculation
  const annualRent = property.priceAnnual;
  const legalFee = annualRent * 0.1;
  const agencyFee = annualRent * 0.1;
  const cautionDeposit = 200000;
  const serviceCharge = 300000;
  const totalMoveIn = annualRent + legalFee + agencyFee + cautionDeposit + serviceCharge;

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
                <p className="font-headline text-sm font-extrabold text-charcoal truncate" title={property.powerRating}>
                  {property.powerRating.split(' ')[0]} Daily
                </p>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold block mb-1">Water Supply</span>
                <p className="font-headline text-sm font-extrabold text-charcoal truncate" title={property.waterSupply}>
                  Treated Borehole
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
                  Direct Instruction
                </span>
              </div>

              <div className="space-y-3.5 text-sm">
                <div className="flex items-center justify-between py-1">
                  <span className="text-charcoal/80 font-medium">Base Annual Rent (12 months)</span>
                  <span className="font-extrabold text-charcoal">{property.priceFormatted}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-t border-hairline">
                  <div className="flex items-center gap-1.5">
                    <span className="text-charcoal/80 font-medium">Refundable Caution Deposit</span>
                    <Info className="w-3.5 h-3.5 text-muted-ink" />
                  </div>
                  <span className="font-extrabold text-charcoal">₦{cautionDeposit.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-t border-hairline">
                  <span className="text-charcoal/80 font-medium">Legal Agreement Draft &amp; Stamping (10%)</span>
                  <span className="font-extrabold text-charcoal">₦{legalFee.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-t border-hairline">
                  <span className="text-charcoal/80 font-medium">Agency Service &amp; Handover (10%)</span>
                  <span className="font-extrabold text-charcoal">₦{agencyFee.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between py-1 border-t border-hairline">
                  <span className="text-charcoal/80 font-medium">Annual Estate Service Charge</span>
                  <span className="font-extrabold text-charcoal">₦{serviceCharge.toLocaleString()}</span>
                </div>

                <div className="pt-4 mt-2 border-t-2 border-charcoal flex items-center justify-between">
                  <div>
                    <span className="font-headline text-base font-extrabold text-charcoal block">
                      Total Estimated Move-in Cost
                    </span>
                    <span className="text-[11px] text-muted-ink">
                      Excludes optional furniture package. Paid directly upon title verification.
                    </span>
                  </div>
                  <span className="font-headline text-2xl font-extrabold text-persimmon">
                    ₦{totalMoveIn.toLocaleString()}
                  </span>
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
