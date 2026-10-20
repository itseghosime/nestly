'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { ArrowRight } from 'lucide-react';

export default function NotFound() {
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-404-reveal]',
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.entrance,
          stagger: 0.07,
          ease: MOTION.ease.softOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 flex items-center py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
          {/* Left Column: Copy & Actions */}
          <div data-404-reveal className="md:col-span-7 flex flex-col items-start">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-stone text-[11px] font-bold tracking-widest text-muted-ink uppercase mb-6 border border-hairline">
              <span className="w-1.5 h-1.5 rounded-full bg-persimmon"></span>
              <span>ERROR 404 · PAGE NOT FOUND</span>
            </div>

            <h1 className="font-headline text-3xl sm:text-5xl font-extrabold text-charcoal tracking-tight leading-[1.15] mb-5">
              This corridor seems to end here.
            </h1>

            <p className="text-sm sm:text-base text-muted-ink leading-relaxed font-normal mb-8 max-w-lg">
              The page or listing you requested could not be found. It may have moved or been removed.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/browse"
                className="nestly-press inline-flex items-center justify-center px-6 py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs sm:text-sm font-bold tracking-tight shadow-sm transition-all"
              >
                <span>Browse Homes</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>

              <Link
                href="/"
                className="nestly-press inline-flex items-center justify-center px-5 py-3 rounded-full bg-white border border-hairline text-charcoal text-xs sm:text-sm font-bold hover:bg-soft-stone transition-colors shadow-2xs"
              >
                Return Home
              </Link>

              <Link
                href="/contact"
                className="inline-flex items-center justify-center px-5 py-3 rounded-full text-muted-ink hover:text-charcoal text-xs sm:text-sm font-semibold transition-colors"
              >
                Contact Operations
              </Link>
            </div>
          </div>

          {/* Right Column: Architectural Graphic Frame */}
          <div data-404-reveal className="md:col-span-5 flex justify-center">
            <div className="w-full max-w-[320px] aspect-square rounded-4xl bg-soft-stone border border-hairline p-8 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden">
              <div className="w-20 h-20 rounded-3xl bg-charcoal text-white flex items-center justify-center mb-4 shadow-sm">
                <svg fill="none" height="40" viewBox="0 0 24 24" width="40" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 21V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v15" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
                  <path d="M9 21v-8a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v8" stroke="#ED572E" strokeLinecap="round" strokeWidth="2.2" />
                  <circle cx="15" cy="14" fill="#ED572E" r="1.5" />
                </svg>
              </div>
              <span className="font-headline text-3xl font-extrabold text-charcoal">404</span>
              <p className="text-xs text-muted-ink mt-1">Edo &amp; Delta Cadastre</p>
            </div>
          </div>
        </div>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
