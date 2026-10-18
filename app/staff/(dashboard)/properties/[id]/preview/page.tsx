'use client';

import React, { use, useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import Link from 'next/link';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { fetchPropertyById } from '@/lib/properties';
import type { Property } from '@/lib/types';
import {
  ArrowLeft,
  CheckCircle2,
  Edit,
  AlertTriangle,
  MapPin,
} from 'lucide-react';

export default function StaffPropertyPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [property, setProperty] = React.useState<Property | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const approvalRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let active = true;
    fetchPropertyById(resolvedParams.id)
      .then((row) => {
        if (!active) return;
        if (!row) {
          setLoadError('Property not found');
          return;
        }
        setProperty(row);
        setIsApproved(row.status === 'Available');
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Failed to load');
      });
    return () => { active = false; };
  }, [resolvedParams.id]);

  useGSAP(() => {
    if (!showApprovalModal || !approvalRef.current || prefersReducedMotion()) return;
    gsap.fromTo(approvalRef.current, { scale: 0.97, y: 8, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [showApprovalModal] });
  useGSAP(() => {
    if (!showRevisionModal || !revisionRef.current || prefersReducedMotion()) return;
    gsap.fromTo(revisionRef.current, { scale: 0.97, y: 8, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [showRevisionModal] });
  useGSAP(() => {
    if (!bannerRef.current || prefersReducedMotion()) return;
    gsap.fromTo(bannerRef.current, { y: -4, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [isApproved] });

  if (!property) {
    return (
      <main className="flex-1 min-h-screen bg-warm p-8">
        <p role={loadError ? 'alert' : 'status'} className="mx-auto max-w-3xl rounded-xl border border-hairline bg-white p-6 text-sm text-charcoal">
          {loadError ? `Unable to load this property (${loadError}).` : 'Loading property…'}
        </p>
      </main>
    );
  }

  const allImages = [property.featuredImage, ...(property.galleryImages || [])].filter(Boolean);
  const featuresList = property.features || property.amenities || [];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[
          { label: 'Properties', href: '/staff/properties' },
          { label: `Preview: ${property.code || property.id}` },
        ]}
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Status Notification Banner */}
        <div
          ref={bannerRef}
          className={`w-full px-5 py-3 rounded-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs border ${
            isApproved
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isApproved ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            ></span>
            <span className="text-xs font-bold uppercase tracking-wide">
              {isApproved
                ? `PUBLISHED & ${property.verificationBadge === 'Verified Physical Title' ? 'VERIFIED' : 'VETTED'} — LIVE ON PUBLIC CATALOG`
                : 'INTERNAL PREVIEW — AWAITING OPERATIONS LEAD AUDIT SIGN-OFF'}
            </span>
          </div>
          <span className="text-xs font-mono font-semibold opacity-80">
            Listing Code: {property.code || property.id}
          </span>
        </div>

        {/* Operational Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div className="flex items-center gap-3">
            <Link
              href="/staff/properties"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-all border border-hairline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Properties</span>
            </Link>
            <Link
              href={`/staff/properties/${property.id}/edit`}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-all border border-hairline"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit Listing</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRevisionModal(true)}
              className="px-4 py-2 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-all border border-hairline"
            >
              Request Revisions
            </button>
            <button
              type="button"
              onClick={() => setShowApprovalModal(true)}
              className="px-5 py-2 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve & Publish</span>
            </button>
          </div>
        </div>

        {/* 12-Column Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 8 Cols: Public Presentation Preview */}
          <div className="lg:col-span-8 space-y-6">
            {/* Gallery Showcase */}
            <div className="space-y-3">
              <div className="relative rounded-3xl overflow-hidden aspect-[16/10] bg-soft-stone border border-hairline shadow-sm">
                <img
                  src={allImages[activePhoto] || allImages[0] || '/images/hero-home.png'}
                  alt={property.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-charcoal/80 text-white text-[11px] font-bold">
                  {property.neighborhood} · {property.city}
                </div>
              </div>

              {/* Thumbnails */}
              <div className="grid grid-cols-4 gap-3">
                {allImages.map((img: string, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActivePhoto(idx)}
                    className={`rounded-2xl overflow-hidden aspect-[16/10] border-2 transition-all ${
                      activePhoto === idx ? 'border-persimmon scale-[1.02]' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Core Header Facts */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline space-y-5">
              <div className="space-y-1">
                <span className="text-xs font-bold text-persimmon uppercase tracking-wider">
                  {property.propertyType}
                </span>
                <h2 className="font-headline text-2xl font-bold text-charcoal">{property.title}</h2>
                <p className="text-xs text-charcoal/70 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-persimmon" />
                  <span>{property.addressShort || property.neighborhood}</span>
                </p>
              </div>

              {/* Vital Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-soft-stone border border-hairline text-xs">
                <div>
                  <span className="text-muted-ink block">Bedrooms</span>
                  <span className="font-headline font-bold text-charcoal text-base">{property.bedrooms} Beds</span>
                </div>
                <div>
                  <span className="text-muted-ink block">Bathrooms</span>
                  <span className="font-headline font-bold text-charcoal text-base">{property.bathrooms} Baths</span>
                </div>
                <div>
                  <span className="text-muted-ink block">Annual Rent</span>
                  <span className="font-headline font-bold text-persimmon text-base">{property.priceFormatted || `₦${property.priceAnnual.toLocaleString()}`}</span>
                </div>
                <div>
                  <span className="text-muted-ink block">Service Charge</span>
                  <span className="font-headline font-bold text-charcoal text-base">{property.serviceCharge || 'Included'}</span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-charcoal uppercase tracking-wider">Property Description</h3>
                <p className="text-xs text-charcoal/80 leading-relaxed">{property.description}</p>
              </div>

              {/* Amenities */}
              <div className="space-y-2 pt-2 border-t border-hairline">
                <h3 className="text-xs font-bold text-charcoal uppercase tracking-wider">Features & Amenities</h3>
                <div className="flex flex-wrap gap-2">
                  {featuresList.map((am: string, i: number) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full bg-soft-stone text-charcoal text-xs font-semibold border border-hairline"
                    >
                      {am}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right 4 Cols: Staff Physical Audit Checklist */}
          <div className="lg:col-span-4 space-y-6 sticky top-24">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-5">
              <div className="pb-3 border-b border-hairline">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                  Internal Vetting Audit
                </span>
                <h3 className="font-headline text-base font-bold text-charcoal mt-0.5">
                  Physical Inspection Sign-Off
                </h3>
              </div>

              {/* Checklist items */}
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">GPS Geotagged Photography</span>
                    <p className="text-[11px] text-emerald-800">Coordinates validated within 50m of perimeter gate.</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">EDOGIS Title Cadastre Verification</span>
                    <p className="text-[11px] text-emerald-800">Certificate of Occupancy (C-of-O) verified with official state land records.</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Dedicated Feeder & Transformer</span>
                    <p className="text-[11px] text-emerald-800">33kVA priority line verified with estate transformer committee.</p>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Water Quality & Borehole Pressure</span>
                    <p className="text-[11px] text-emerald-800">Reverse osmosis filter tested; zero iron contamination.</p>
                  </div>
                </div>
              </div>

              {/* Assigned field agent */}
              <div className="pt-2 border-t border-hairline text-xs space-y-1">
                <div className="flex justify-between text-charcoal/70">
                  <span>Field Inspector:</span>
                  <span className="font-bold text-charcoal">Osasere I. (Field Agent)</span>
                </div>
                <div className="flex justify-between text-charcoal/70">
                  <span>Inspection Date:</span>
                  <span className="font-semibold text-charcoal">14 Oct 2026 WAT</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div ref={approvalRef} className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-hairline space-y-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            <h3 className="font-headline text-lg font-bold text-charcoal">
              Publish Listing to Public Portal?
            </h3>
            <p className="text-xs text-charcoal/70 leading-relaxed">
              This action marks the property as vetted and available, then publishes it to the public catalog. Continue only after its physical vetting is complete.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 rounded-full bg-soft-stone text-charcoal text-xs font-bold"
              >
                Cancel
              </button>
              {loadError && <span className="text-xs font-bold text-red-600">{loadError}</span>}
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch(`/api/properties/${encodeURIComponent(property.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publication_state: 'published', verification_state: 'vetted', rental_availability: 'available' }) });
                  if (!r.ok) { const j = await r.json().catch(() => ({})); setLoadError(j.error || 'Publish failed'); return; }
                  setProperty((current) => current ? { ...current, status: 'Available', verificationBadge: 'Vetted Landlord' } : current);
                  setIsApproved(true);
                  setShowApprovalModal(false);
                }}
                className="px-5 py-2 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold"
              >
                Confirm Publication
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div ref={revisionRef} className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-hairline space-y-4">
            <AlertTriangle className="w-10 h-10 text-amber-600" />
            <h3 className="font-headline text-lg font-bold text-charcoal">
              Request Field Re-Inspection
            </h3>
            <p className="text-xs text-charcoal/70 leading-relaxed">
              Dispatch notes to field agent Osasere I. specifying required updates (e.g., retake master bathroom daylight photo).
            </p>
            <textarea
              rows={3}
              placeholder="Enter revision notes for field agent..."
              className="w-full bg-warm rounded-2xl p-3 text-xs text-charcoal border border-hairline"
            ></textarea>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRevisionModal(false)}
                className="px-4 py-2 rounded-full bg-soft-stone text-charcoal text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await fetch(`/api/properties/${encodeURIComponent(property.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publication_state: 'review' }) });
                  if (!r.ok) { const j = await r.json().catch(() => ({})); setLoadError(j.error || 'Request failed'); return; }
                  setIsApproved(false);
                  setShowRevisionModal(false);
                }}
                className="px-5 py-2 rounded-full bg-charcoal text-white text-xs font-bold"
              >
                Send Revisions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
