'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { PropertyCard } from '@/components/public/PropertyCard';
import { useSavedHomes } from '@/lib/saved-homes-context';
import { prefersReducedMotion } from '@/lib/motion';
import {
  Heart,
  Share2,
  Trash2,
  Copy,
  Check,
  ShieldCheck,
  Home
} from 'lucide-react';

export default function SavedHomesPage() {
  const { savedProperties, savedCount, removeSave, clearAll } = useSavedHomes();
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const modalBackdropRef = useRef<HTMLDivElement>(null);
  const modalContentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-saved-enter]',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.38, stagger: 0.06, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef }
  );

  // Animate empty state when last item is removed
  useEffect(() => {
    if (savedCount === 0 && emptyRef.current && !prefersReducedMotion()) {
      gsap.fromTo(
        emptyRef.current,
        { opacity: 0, y: 14, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.32, ease: 'power2.out', clearProps: 'all' }
      );
    }
  }, [savedCount]);

  // Share Modal entrance & Escape dismissal
  useEffect(() => {
    if (!showShareModal) return;
    if (!prefersReducedMotion() && modalBackdropRef.current && modalContentRef.current) {
      gsap.fromTo(modalBackdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.2 });
      gsap.fromTo(
        modalContentRef.current,
        { opacity: 0, scale: 0.95, y: 10 },
        { opacity: 1, scale: 1, y: 0, duration: 0.26, ease: 'power3.out' }
      );
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowShareModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showShareModal]);

  const handleAnimatedRemove = (propertyId: string, wrapperEl?: HTMLElement | null) => {
    const target =
      wrapperEl ||
      (gridRef.current?.querySelector(`[data-saved-item="${propertyId}"]`) as HTMLElement | null);

    if (prefersReducedMotion() || !target) {
      removeSave(propertyId);
      return true;
    }

    gsap.to(target, {
      opacity: 0,
      scale: 0.92,
      y: -10,
      duration: 0.24,
      ease: 'power2.in',
      onComplete: () => {
        removeSave(propertyId);
      },
    });
    return true;
  };

  const handleAnimatedClearAll = () => {
    if (prefersReducedMotion() || !gridRef.current) {
      clearAll();
      return;
    }
    const items = gridRef.current.querySelectorAll('[data-saved-item]');
    gsap.to(items, {
      opacity: 0,
      scale: 0.94,
      y: -8,
      duration: 0.22,
      stagger: 0.03,
      ease: 'power2.in',
      onComplete: () => {
        clearAll();
      },
    });
  };

  const handleCopyCodes = () => {
    if (savedProperties.length === 0) return;
    const text = savedProperties
      .map((p, i) => `${i + 1}. ${p.title} (${p.neighborhood}, ${p.city}) - ${p.priceFormatted}/yr [Ref: ${p.id}]`)
      .join('\n');
    navigator.clipboard.writeText(`Nestly Saved Homes (${savedProperties.length}):\n${text}\n\nBrowse listings at https://nestly.ng/browse`);
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2500);
  };

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-8 sm:py-12">
        {/* Top Header Row */}
        <div data-saved-enter className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 mb-8 border-b border-hairline">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-muted-ink mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Local Browser Storage · No Account Required</span>
            </div>

            <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal">
              Saved Homes <span className="text-persimmon">({savedCount})</span>
            </h1>

            <p className="text-sm sm:text-base text-muted-ink mt-2 max-w-xl">
              Compare key rent terms, water supply, and power arrangements for your shortlisted flats. Anonymous saves belong only to this browser.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {savedCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowShareModal(true)}
                  className="px-4 py-2 rounded-full bg-white border border-hairline hover:bg-soft-stone text-xs font-bold text-charcoal flex items-center gap-2 shadow-2xs nestly-press cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share with Nia</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyCodes}
                  className="px-4 py-2 rounded-full bg-white border border-hairline hover:bg-soft-stone text-xs font-bold text-charcoal flex items-center gap-2 shadow-2xs nestly-press cursor-pointer"
                >
                  {copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCodes ? 'Copied Codes!' : 'Copy Reference Codes'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAnimatedClearAll}
                  className="px-3.5 py-2 rounded-full hover:bg-red-50 text-xs font-bold text-red-600 hover:text-red-700 nestly-press flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Saved Listings Grid or Empty State */}
        {savedCount > 0 ? (
          <div data-saved-enter className="space-y-10">
            <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {savedProperties.map((prop) => (
                <div
                  key={prop.id}
                  data-saved-item={prop.id}
                  className="relative group"
                >
                  <PropertyCard
                    property={prop}
                    onBeforeUnsave={(id) => handleAnimatedRemove(id)}
                  />
                  <button
                    type="button"
                    onClick={() => handleAnimatedRemove(prop.id)}
                    aria-label={`Remove ${prop.title} from shortlist`}
                    className="absolute -top-2 -right-2 z-20 w-8 h-8 rounded-full bg-charcoal hover:bg-red-600 text-white flex items-center justify-center shadow-md nestly-press cursor-pointer"
                    title="Remove from saved shortlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Quick Summary Strip */}
            <div className="bg-soft-stone rounded-3xl p-6 sm:p-8 border border-hairline flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white border border-hairline flex items-center justify-center text-primary shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-headline text-lg font-bold text-charcoal">
                    Ready to schedule in-person accompanied visits?
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-ink mt-0.5">
                    Our field officers in Benin City and Sapele can coordinate inspections for multiple shortlisted properties in a single morning.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNiaOpen(true)}
                className="px-6 py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider shadow-sm shrink-0 nestly-press cursor-pointer"
              >
                Arrange Multi-Home Visit with Nia
              </button>
            </div>
          </div>
        ) : (
          /* Empty Saved State */
          <div
            ref={emptyRef}
            className="bg-white rounded-3xl p-12 sm:p-16 text-center border border-hairline max-w-lg mx-auto shadow-sm my-12"
          >
            <div className="w-16 h-16 rounded-full bg-soft-stone text-muted-ink flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 stroke-[1.5]" />
            </div>
            <h2 className="font-headline text-2xl font-bold text-charcoal mb-2">
              Your shortlist is empty
            </h2>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed mb-6">
              Tap the heart icon on any property in Benin City or Delta to bookmark homes locally on this device. No sign-up required.
            </p>
            <Link
              href="/browse"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider shadow-sm nestly-press"
            >
              <Home className="w-4 h-4" />
              <span>Browse Homes</span>
            </Link>
          </div>
        )}

        {/* Share Shortlist Modal */}
        {showShareModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Share Shortlist with Nia"
          >
            <div
              ref={modalBackdropRef}
              onClick={() => setShowShareModal(false)}
              className="fixed inset-0 bg-charcoal/45 backdrop-blur-xs"
            />
            <div
              ref={modalContentRef}
              className="relative z-10 bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-hairline shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                    N
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-charcoal">Share Shortlist with Nia</h3>
                    <p className="text-[11px] text-muted-ink">Reference codes for rapid inquiry</p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setShowShareModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-soft-stone text-muted-ink flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-muted-ink">
                Copy the text below to share with your family or paste directly into chat with Nia. No external WhatsApp messages are transmitted automatically.
              </p>

              <div className="p-4 rounded-2xl bg-soft-stone border border-hairline text-xs font-mono text-charcoal max-h-48 overflow-y-auto space-y-1.5">
                <p className="font-bold text-primary">{`// Nestly Shortlist (${savedProperties.length} homes)`}</p>
                {savedProperties.map((p, idx) => (
                  <p key={p.id}>
                    {idx + 1}. {p.title} · {p.neighborhood} [ID: {p.id}] · {p.priceFormatted}
                  </p>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowShareModal(false)}
                  className="px-5 py-2.5 rounded-full bg-soft-stone text-charcoal text-xs font-bold hover:bg-stone-card nestly-press cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleCopyCodes}
                  className="px-5 py-2.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold flex items-center gap-2 shadow-sm nestly-press cursor-pointer"
                >
                  {copiedCodes ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCodes ? 'Copied to Clipboard!' : 'Copy Formatted Text'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
