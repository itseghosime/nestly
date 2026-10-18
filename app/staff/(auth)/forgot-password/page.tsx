'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { ArrowLeft, Mail, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const confirmCardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-forgot-reveal]',
        { y: 12, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.normal,
          stagger: 0.05,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: pageRef }
  );

  useGSAP(
    () => {
      if (!isSubmitted || !confirmCardRef.current || prefersReducedMotion()) return;
      gsap.fromTo(
        confirmCardRef.current,
        { scale: 0.98, y: 6 },
        { scale: 1, y: 0, duration: 0.26, ease: MOTION.ease.crispOut }
      );
    },
    { dependencies: [isSubmitted] }
  );

  const [formError, setFormError] = React.useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setFormError(null);
    try {
      const res = await fetch('/api/auth/recover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to send reset link');
      setIsSubmitted(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to send reset link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-10 lg:py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        {/* Left Column: Recovery Form */}
        <div data-forgot-reveal className="lg:col-span-6 flex flex-col justify-between space-y-8 pr-0 lg:pr-6">
          <div className="space-y-6">
            {/* Back Navigation Link */}
            <div>
              <Link
                href="/staff/signin"
                className="group inline-flex items-center gap-2 text-xs font-bold text-muted-ink hover:text-charcoal transition-colors"
              >
                <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                <span>Back to sign in</span>
              </Link>
            </div>

            {/* Section Eyebrow Badge & Title */}
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-soft-stone text-muted-ink text-[11px] font-bold uppercase tracking-wider border border-hairline">
                <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                Staff Recovery Desk
              </span>
              <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
                Reset your staff credentials
              </h1>
              <p className="text-sm text-charcoal/70 max-w-lg leading-relaxed">
                Enter your verified work email address to receive a secure credential reset link.
              </p>
            </div>

            {/* Form Module */}
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-charcoal" htmlFor="workEmail">
                  Work Email Address
                </label>
                <div className="relative">
                  <input
                    id="workEmail"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your work email"
                    className="w-full bg-white text-charcoal text-sm rounded-full pl-5 pr-12 py-3.5 border border-hairline focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-2xs transition-all"
                  />
                  <Mail className="w-4 h-4 text-muted-ink absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {formError && <p className="text-xs font-bold text-red-600">{formError}</p>}
              <button
                type="submit"
                disabled={isLoading || isSubmitted}
                className="nestly-press w-full bg-persimmon hover:bg-persimmon-hover text-white text-sm font-bold rounded-full py-3.5 px-6 transition-all duration-200 shadow-xs flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Requesting recovery link...</span>
                  </>
                ) : (
                  <>
                    <span>{isSubmitted ? 'Recovery request submitted' : 'Send Reset Instructions'}</span>
                    {!isSubmitted && <ArrowRight className="w-4 h-4" />}
                  </>
                )}
              </button>
            </form>

            <div
              ref={confirmCardRef}
              className={`p-5 rounded-2xl bg-soft-stone border border-hairline transition-all duration-300 ${
                isSubmitted ? 'ring-2 ring-emerald-500/40 bg-emerald-50/40' : 'opacity-85'
              }`}
              role={isSubmitted ? 'status' : undefined}
            >
              <div className="flex items-start gap-4">
                <div className="p-2.5 rounded-full bg-white text-emerald-600 shadow-2xs border border-hairline shrink-0 mt-0.5">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-charcoal">
                      {isSubmitted ? 'Recovery request accepted' : 'Password recovery'}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                      {isSubmitted ? 'Request received' : 'Secure link'}
                    </span>
                  </div>
                  <p className="text-xs text-charcoal/70 leading-relaxed">
                    {isSubmitted
                      ? 'If an authorized staff account exists, a recovery email has been requested. Check the work inbox and spam folder. Email delivery is not independently verified here.'
                      : 'A recovery link does not change your password. You must open the link and complete password setup before signing in.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Estate Context Hub Showcase */}
        <div data-forgot-reveal className="lg:col-span-6 relative mt-6 lg:mt-0 flex">
          <div className="property-card-hover w-full rounded-3xl overflow-hidden bg-charcoal shadow-sm border border-hairline relative min-h-[460px] flex flex-col justify-between p-6 sm:p-8">
            <img
              src="/images/p1-gra-terrace-living.jpg"
              alt="Contemporary residential properties across Edo State"
              className="property-card-img absolute inset-0 w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/85 via-charcoal/20 to-transparent"></div>
            <div className="relative z-10 mt-auto">
              <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl inline-block shadow-sm border border-hairline">
                <p className="text-xs font-semibold text-charcoal">
                  Contemporary residential properties across Edo State &amp; Delta.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
