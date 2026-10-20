'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { AlertTriangle, RotateCcw, CheckCircle2 } from 'lucide-react';

export default function ServiceUnavailablePage() {
  const [retrying, setRetrying] = useState(false);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-503-reveal]',
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.entrance,
          stagger: 0.08,
          ease: MOTION.ease.softOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: pageRef }
  );

  const handleRetry = () => {
    setRetrying(true);
    setRetryFeedback(null);
    setTimeout(() => {
      setRetrying(false);
      setRetryFeedback('Status check: Scheduled maintenance is currently active. Services will restore shortly. Your saved homes remain intact.');
    }, 900);
  };

  return (
    <div ref={pageRef} className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 flex items-center py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left Column: Copy & Recovery Actions */}
          <div data-503-reveal className="lg:col-span-7 flex flex-col items-start">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wider uppercase bg-persimmon-soft border border-persimmon/20 text-persimmon mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-persimmon"></span>
              <span>SERVICE STATUS · TEMPORARILY UNAVAILABLE</span>
            </div>

            <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.15] mb-5">
              Service Unavailable
            </h1>

            <p className="text-sm sm:text-base text-muted-ink font-normal leading-relaxed mb-8 max-w-xl">
              We could not load this page right now due to routine system maintenance or network latency. Your locally saved homes remain safely stored in your browser.
            </p>

            {retryFeedback && (
              <div
                role="status"
                aria-live="polite"
                className="mb-6 p-3.5 rounded-2xl bg-soft-stone border border-hairline text-xs font-medium text-charcoal max-w-xl"
              >
                {retryFeedback}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 w-full mb-8">
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="nestly-press inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-bold text-white bg-persimmon hover:bg-persimmon-hover shadow-sm transition-all disabled:opacity-50"
              >
                <RotateCcw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
                <span>{retrying ? 'Checking Status...' : 'Retry Connection'}</span>
              </button>

              <Link
                href="/saved"
                className="nestly-press inline-flex items-center justify-center px-5 py-3 rounded-full text-xs sm:text-sm font-bold bg-white text-charcoal border border-hairline hover:bg-soft-stone transition-colors shadow-2xs"
              >
                View saved homes
              </Link>

              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-5 py-3 rounded-full text-xs sm:text-sm font-semibold text-muted-ink hover:text-charcoal hover:bg-soft-stone transition-colors"
              >
                Contact Operations Desk
              </Link>
            </div>

            {/* Diagnostic Footer */}
            <div className="pt-6 border-t border-hairline w-full text-xs text-muted-ink flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Live service status is unavailable</span>
              </span>
              <span className="font-mono text-[11px]">No live health check</span>
            </div>
          </div>

          {/* Right Column: Status Card */}
          <div data-503-reveal className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-[340px] rounded-3xl bg-white border border-hairline p-6 shadow-sm space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="font-headline text-lg font-bold text-charcoal">
                Service status unavailable
              </h3>
              <p className="text-xs text-muted-ink leading-relaxed">
                This page does not perform a live health check or confirm a maintenance window. Try again later or return to browsing.
              </p>
              <div className="pt-2 border-t border-hairline flex items-center justify-between text-[11px] text-muted-ink">
                <span>Current status:</span>
                <span className="font-bold text-charcoal">Not checked</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
