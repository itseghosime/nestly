'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Building,
  ShieldCheck,
  Info,
} from 'lucide-react';

const SIMULATION_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function StaffSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const formCardRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-auth-reveal]',
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

  const [authError, setAuthError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setAuthError('Enter your work email and password.');
      setShowErrorAlert(true);
      if (formCardRef.current && !prefersReducedMotion()) {
        gsap.fromTo(formCardRef.current, { x: -6 }, { x: 0, duration: 0.32, ease: 'elastic.out(1.2, 0.3)' });
      }
      return;
    }
    setIsLoading(true);
    setAuthError(null);
    setShowErrorAlert(false);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(body.error || 'Invalid credentials or invitation pending confirmation');
        setShowErrorAlert(true);
        if (formCardRef.current && !prefersReducedMotion()) {
          gsap.fromTo(formCardRef.current, { x: -6 }, { x: 0, duration: 0.32, ease: 'elastic.out(1.2, 0.3)' });
        }
        return;
      }
      router.push('/staff/dashboard');
    } catch {
      setAuthError('Network error. Try again.');
      setShowErrorAlert(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-10 lg:py-16">
      <div className="flex flex-col lg:flex-row gap-10 items-stretch">
        {/* Left Column: Form & Operations Card */}
        <div className="w-full lg:w-5/12 flex flex-col justify-between gap-6">
          <div
            ref={formCardRef}
            data-auth-reveal
            className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-hairline flex flex-col gap-6"
          >
            {/* Header Badge & Meta */}
            <div className="flex flex-col gap-2 items-start">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-persimmon/10 text-persimmon text-[11px] font-bold tracking-wider uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-persimmon"></span>
                Invite-Only Access · {SIMULATION_MODE ? 'Simulation Mode' : 'Staff Portal'}
              </div>
              <span className="text-xs font-bold text-muted-ink tracking-widest uppercase mt-1">
                Nestly Operations Desk
              </span>
              <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
                Sign in to staff portal
              </h1>
              <p className="text-sm text-charcoal/70 leading-relaxed">
                Restricted access for keyholder coordinators, property inspectors, and listing reviewers in Edo &amp; Delta.
              </p>
            </div>

            {/* System Notice Box */}
            <div className="p-3.5 rounded-2xl bg-soft-stone text-charcoal flex items-start gap-3 border border-hairline/80">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-charcoal/80 leading-relaxed">
                <strong className="font-bold text-charcoal">
                  {SIMULATION_MODE ? 'Simulation Mode:' : 'Staff access:'}
                </strong>{' '}
                {SIMULATION_MODE
                  ? 'Fixture data may be shown in the interface; protected staff actions still require a real Supabase staff session.'
                  : 'No public registration is available. Accounts are provisioned through authorized invitations.'}
              </p>
            </div>

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              {/* Email Input Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-charcoal" htmlFor="work-email">
                  Work Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-4 w-4 h-4 text-muted-ink pointer-events-none" />
                  <input
                    id="work-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="e.g. staff.coordinator@nestly.internal"
                    className="w-full bg-warm pl-11 pr-4 py-3 rounded-full text-sm text-charcoal placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              {/* Password Input Field */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-charcoal" htmlFor="work-password">
                    Password
                  </label>
                  <Link
                    href="/staff/forgot-password"
                    className="text-xs font-semibold text-persimmon hover:underline transition-colors"
                  >
                    Forgot your password?
                  </Link>
                </div>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 w-4 h-4 text-muted-ink pointer-events-none" />
                  <input
                    id="work-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Enter authorized password"
                    className="w-full bg-warm pl-11 pr-12 py-3 rounded-full text-sm text-charcoal placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                    className="absolute right-3.5 p-1 text-muted-ink hover:text-charcoal transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Keep Signed In Checkbox */}
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  id="remember"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded text-persimmon accent-persimmon cursor-pointer"
                />
                <label htmlFor="remember" className="text-xs text-charcoal/70 cursor-pointer select-none">
                  Keep workspace session active on this workstation
                </label>
              </div>

              {/* Primary Submit Action */}
              <button
                type="submit"
                disabled={isLoading}
                className="nestly-press mt-2 w-full bg-persimmon hover:bg-persimmon-hover text-white py-3.5 px-6 rounded-full text-sm font-bold tracking-wide flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Signing in…</span>
                  </>
                ) : (
                  <>
                    <span>Sign in to Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {authError && (
              <div role="alert" className="flex items-center gap-2.5 p-3 rounded-xl bg-red-50 text-red-800 border border-red-200">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold leading-tight">{authError}</span>
              </div>
            )}

            {SIMULATION_MODE && <div className="pt-4 border-t border-hairline flex flex-col gap-2.5 bg-soft-stone/70 -mx-6 sm:-mx-8 -mb-6 sm:-mb-8 p-4 sm:p-6 rounded-b-3xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-ink uppercase tracking-wider">
                  Validation &amp; Error States (Simulation preview)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showErrorAlert;
                    setShowErrorAlert(next);
                    if (next && formCardRef.current && !prefersReducedMotion()) {
                      gsap.fromTo(
                        formCardRef.current,
                        { x: -5 },
                        { x: 0, duration: 0.28, ease: 'elastic.out(1.2, 0.3)' }
                      );
                    }
                  }}
                  className="text-xs font-bold text-persimmon hover:underline"
                >
                  {showErrorAlert ? 'Hide alert' : 'Toggle alert'}
                </button>
              </div>

              {showErrorAlert && !authError && (
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-50 text-red-800 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="text-xs font-semibold leading-tight">
                    {authError || 'Invalid credentials or invitation pending confirmation'}
                  </span>
                </div>
              )}
            </div>}
          </div>

          {/* Quick Operational Metrics Card */}
          <div data-auth-reveal className="bg-soft-stone p-4 rounded-2xl border border-hairline flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-primary shadow-2xs border border-hairline">
                <Building className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-charcoal">Active Inspections Today</span>
                <span className="text-[11px] text-muted-ink">14 properties scheduled across Benin City &amp; Sapele</span>
              </div>
            </div>
            <span className="font-headline text-base font-bold text-charcoal">14/14</span>
          </div>
        </div>

        {/* Right Column: Visual Frame with Photography */}
        <div data-auth-reveal className="w-full lg:w-7/12 flex flex-col min-h-[460px] lg:min-h-full">
          <div className="property-card-hover relative w-full h-full min-h-[460px] rounded-3xl overflow-hidden shadow-sm border border-hairline flex flex-col justify-between p-6 sm:p-8 group bg-charcoal">
            {/* Background Photography */}
            <img
              src="/images/p9-benin-villa-front.jpg"
              alt="Modern residential architecture in Benin City"
              className="property-card-img absolute inset-0 w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/30 to-transparent pointer-events-none"></div>

            {/* Top metadata pill */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-charcoal/60 backdrop-blur-md text-white text-xs font-medium border border-white/10">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Physical Vetting Desk
              </span>
            </div>

            {/* Bottom Caption */}
            <div className="relative z-10 mt-auto">
              <div className="p-4 rounded-2xl bg-charcoal/70 backdrop-blur-md text-white border border-white/10">
                <p className="text-xs font-medium text-white/90 leading-relaxed">
                  Curated residential architecture across Benin City &amp; Sapele. Every listing is physically vetted for power feeder health, water borehole status, and statutory ownership.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
