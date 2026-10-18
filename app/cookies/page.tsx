'use client';

import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { Check, AlertCircle } from 'lucide-react';

export default function CookiePreferencesPage() {
  const [savedHomesStorage, setSavedHomesStorage] = useState(true);
  const [personalization, setPersonalization] = useState(true);
  const [telemetry, setTelemetry] = useState(false);
  const [savedBanner, setSavedBanner] = useState(false);
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-cookie-card]',
        { y: 14, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.entrance,
          stagger: 0.06,
          ease: MOTION.ease.softOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: pageRef }
  );

  useGSAP(
    () => {
      if (!savedBanner || !bannerRef.current || prefersReducedMotion()) return;
      gsap.fromTo(
        bannerRef.current,
        { y: -10, opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, duration: 0.28, ease: MOTION.ease.crispOut }
      );
    },
    { dependencies: [savedBanner] }
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3500);
  };

  const handleAcceptAll = () => {
    setSavedHomesStorage(true);
    setPersonalization(true);
    setTelemetry(true);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3500);
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-16">
        {/* Header */}
        <div data-cookie-card className="text-center mb-10">
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-persimmon block mb-3">
            PRIVACY CONTROLS · BROWSER STORAGE
          </span>

          <h1 className="font-headline text-3xl sm:text-4xl font-extrabold tracking-tight text-charcoal mb-4">
            Cookie &amp; Storage Preferences
          </h1>

          <p className="text-sm sm:text-base text-muted-ink max-w-xl mx-auto leading-relaxed">
            Manage how Nestly uses cookies and local browser storage to personalize your browsing and retain shortlisted homes.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200/80 text-amber-900 text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Draft prototype notice:</strong> You can test saving and toggling preferences in this interface. Changes are stored locally.
            </span>
          </div>
        </div>

        {/* Confirmation Banner */}
        {savedBanner && (
          <div
            ref={bannerRef}
            role="status"
            aria-live="polite"
            className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Cookie preferences updated successfully for this browser.</span>
            </span>
            <button
              type="button"
              onClick={() => setSavedBanner(false)}
              className="text-emerald-700 hover:text-emerald-900 px-2 py-0.5 rounded"
            >
              ✕
            </button>
          </div>
        )}

        {/* Form Container */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* 1. Strictly Necessary */}
          <div data-cookie-card className="p-6 rounded-3xl bg-white border border-hairline shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline text-base font-bold text-charcoal">Strictly Necessary Storage</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-soft-stone text-muted-ink border border-hairline">
                    Required
                  </span>
                </div>
                <p className="text-xs text-muted-ink leading-relaxed">
                  Essential for core application routing, security tokens, and responsive UI layout rendering. Cannot be disabled.
                </p>
              </div>
              <div
                role="switch"
                aria-checked="true"
                aria-disabled="true"
                aria-label="Strictly Necessary Storage"
                className="w-11 h-6 rounded-full bg-charcoal p-1 cursor-not-allowed opacity-80 shrink-0"
              >
                <div className="w-4 h-4 rounded-full bg-white translate-x-5 transition-transform" />
              </div>
            </div>
          </div>

          {/* 2. Saved Homes LocalStorage */}
          <div data-cookie-card className="p-6 rounded-3xl bg-white border border-hairline shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="font-headline text-base font-bold text-charcoal">Saved Homes Persistence</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-muted-ink leading-relaxed">
                  Permits saving shortlisted properties in your device’s local storage (<code>nestly_saved_homes_v2</code>) so they remain available when you return.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={savedHomesStorage}
                aria-label="Saved Homes Persistence"
                onClick={() => setSavedHomesStorage(!savedHomesStorage)}
                className={`nestly-press w-11 h-6 rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  savedHomesStorage ? 'bg-primary' : 'bg-hairline'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-2xs transition-transform duration-200 ${
                    savedHomesStorage ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 3. Functional Personalization */}
          <div data-cookie-card className="p-6 rounded-3xl bg-white border border-hairline shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-headline text-base font-bold text-charcoal">Functional Preferences</h2>
                <p className="text-xs text-muted-ink leading-relaxed">
                  Remembers your last selected search filters (e.g. GRA Benin, Sapele) and bedroom preferences across page reloads.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={personalization}
                aria-label="Functional Preferences"
                onClick={() => setPersonalization(!personalization)}
                className={`nestly-press w-11 h-6 rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  personalization ? 'bg-primary' : 'bg-hairline'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-2xs transition-transform duration-200 ${
                    personalization ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 4. Telemetry */}
          <div data-cookie-card className="p-6 rounded-3xl bg-white border border-hairline shadow-2xs">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-headline text-base font-bold text-charcoal">Anonymous Quality Telemetry</h2>
                <p className="text-xs text-muted-ink leading-relaxed">
                  Collects aggregated, non-identifiable client performance metrics to help detect broken images or layout glitches.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={telemetry}
                aria-label="Anonymous Quality Telemetry"
                onClick={() => setTelemetry(!telemetry)}
                className={`nestly-press w-11 h-6 rounded-full p-1 transition-colors duration-200 shrink-0 ${
                  telemetry ? 'bg-primary' : 'bg-hairline'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow-2xs transition-transform duration-200 ${
                    telemetry ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div data-cookie-card className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="nestly-press w-full sm:w-auto px-6 py-3 rounded-full bg-white hover:bg-soft-stone text-charcoal border border-hairline text-xs font-bold transition-colors"
            >
              Accept All Categories
            </button>

            <button
              type="submit"
              className="nestly-press w-full sm:w-auto px-8 py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
            >
              Save Preferences
            </button>
          </div>
        </form>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
