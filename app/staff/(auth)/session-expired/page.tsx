'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

export default function SessionExpiredPage() {
  const cardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !cardRef.current) return;
      gsap.fromTo(
        cardRef.current,
        { y: 14, opacity: 0, scale: 0.985 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: MOTION.duration.normal,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: cardRef }
  );

  return (
    <div className="max-w-md mx-auto w-full px-4 py-12">
      <div
        ref={cardRef}
        className="w-full bg-white rounded-3xl shadow-sm border border-hairline overflow-hidden p-6 sm:p-8 flex flex-col justify-between"
      >
        <div>
          {/* Brand & Security Badge */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-persimmon inline-block"></span>
              <span className="font-headline text-lg font-bold tracking-tight text-charcoal">Nestly</span>
              <span className="text-[10px] text-muted-ink uppercase font-bold tracking-widest pl-1">
                Internal
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-soft-stone text-muted-ink text-[10px] font-bold uppercase tracking-wider border border-hairline">
              <span className="w-1.5 h-1.5 rounded-full bg-persimmon"></span>
              <span>TIMED OUT</span>
            </div>
          </div>

          {/* Typography Heading Group */}
          <div className="space-y-1.5 mb-6">
            <h1 className="font-headline text-2xl font-bold text-charcoal tracking-tight">
              Your session has expired
            </h1>
            <p className="text-xs text-charcoal/70 leading-relaxed">
              For the security of operational records and tenant inquiry privacy, staff sessions automatically expire after periods of inactivity.
            </p>
          </div>

          {/* Cache Security Callout Note */}
          <div className="bg-soft-stone rounded-2xl p-4 mb-6 flex items-start gap-3 border border-hairline">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-xs text-charcoal/80 leading-relaxed">
              Sign in again to continue. Your staff role and access scope are verified from your Supabase session and staff profile.
            </p>
          </div>

          <div className="space-y-3">
            <Link
              href="/staff/signin"
              className="nestly-press w-full bg-persimmon hover:bg-persimmon-hover text-white text-sm font-bold py-3.5 px-6 rounded-full transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <span>Return to staff sign in</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/staff/forgot-password"
              className="block text-center text-xs font-semibold text-muted-ink hover:text-charcoal transition-colors"
            >
              Reset password
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
