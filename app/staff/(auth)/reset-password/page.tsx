'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
} from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tokenRequested, setTokenRequested] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-reset-reveal]',
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

  // Requirements checks
  const hasLength = password.length >= 8;
  const hasMixed = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumSym = /[0-9!@#$%^&*(),.?":{}|<>]/.test(password);
  const isMatch = password.length > 0 && password === confirmPassword;

  // Strength score
  const score = [hasLength, hasMixed, hasNumSym].filter(Boolean).length;
  const strengthLabels = ['Awaiting entry', 'Weak', 'Good', 'Strong passphrase'];
  const strengthBadge = password.length === 0 ? 'Awaiting entry' : strengthLabels[score];

  const [formError, setFormError] = React.useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasLength || !isMatch) return;
    setIsLoading(true);
    setFormError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          token_hash: params.get('token_hash'),
          type: params.get('type') || 'recovery',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Reset failed');
      setIsSuccess(true);
      setTimeout(() => router.push('/staff/signin'), 1200);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-10 lg:py-16">
      <div className="flex flex-col lg:flex-row gap-10 items-start">
        {/* Left Column: Form & States */}
        <div data-reset-reveal className="w-full lg:w-7/12 flex flex-col gap-6">
          {/* Security Badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-persimmon/10 text-persimmon text-[11px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-persimmon"></span>
              STAFF PASSWORD RECOVERY
            </span>
          </div>

          {/* Main Headings */}
          <div className="flex flex-col gap-1">
            <h1 className="font-headline text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
              Choose a new password
            </h1>
            <p className="text-sm text-charcoal/70 max-w-xl">
              Create a secure password for your Nestly staff account.
            </p>
          </div>

          {/* Password Reset Form Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline flex flex-col gap-5">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* New Password Input */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-charcoal" htmlFor="new-password">
                    New Password
                  </label>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full transition-colors ${
                      score === 3
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-soft-stone text-muted-ink'
                    }`}
                  >
                    {strengthBadge}
                  </span>
                </div>
                <div className="relative flex items-center">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter at least 8 characters"
                    required
                    className="w-full px-4 py-3.5 pr-12 rounded-full bg-warm text-charcoal text-sm placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 p-1 text-muted-ink hover:text-charcoal transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Password Requirements Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                  <div
                    className={`flex items-center gap-1.5 transition-colors ${
                      hasLength ? 'text-emerald-700 font-semibold' : 'text-muted-ink'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 transition-transform ${
                        hasLength ? 'text-emerald-600 scale-105' : 'text-hairline'
                      }`}
                    />
                    <span>8+ characters</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 transition-colors ${
                      hasMixed ? 'text-emerald-700 font-semibold' : 'text-muted-ink'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 transition-transform ${
                        hasMixed ? 'text-emerald-600 scale-105' : 'text-hairline'
                      }`}
                    />
                    <span>Mixed case</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 transition-colors ${
                      hasNumSym ? 'text-emerald-700 font-semibold' : 'text-muted-ink'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 transition-transform ${
                        hasNumSym ? 'text-emerald-600 scale-105' : 'text-hairline'
                      }`}
                    />
                    <span>Number or symbol</span>
                  </div>
                </div>
              </div>

              {/* Confirm Password Input */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-charcoal" htmlFor="confirm-password">
                    Confirm New Password
                  </label>
                  {confirmPassword && (
                    <div className="flex items-center gap-1">
                      {isMatch ? (
                        <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Passwords match
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-persimmon">
                          Passwords do not match
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    required
                    className="w-full px-4 py-3.5 pr-12 rounded-full bg-warm text-charcoal text-sm placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3.5 p-1 text-muted-ink hover:text-charcoal transition-colors"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              {formError && <p className="text-xs font-bold text-red-600">{formError}</p>}
              <button
                type="submit"
                disabled={isLoading || !hasLength || !isMatch}
                className="nestly-press w-full mt-2 py-4 px-6 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Saving new credentials...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Update Password &amp; Access Workspace</span>
                  </>
                )}
              </button>
            </form>

            {/* Feedback banner */}
            {isSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold">Password Updated Successfully</span>
                  <span className="text-[11px] text-emerald-700">
                    Redirecting to staff sign-in...
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Secondary Expired-Token State Preview Card */}
          <div className="bg-soft-stone rounded-3xl p-6 shadow-sm border border-hairline flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-full bg-persimmon/10 text-persimmon flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </span>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                    State Preview · Edge Case
                  </span>
                  <h2 className="text-sm font-bold text-charcoal">
                    Expired or Invalid Token Preview
                  </h2>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-white text-muted-ink text-[11px] font-semibold border border-hairline">
                Token TTL: 0m
              </span>
            </div>
            <p className="text-xs text-charcoal/70 leading-relaxed">
              Reset links expire according to the configured Supabase Auth policy and can be used only once. This state handles expired or reused links.
            </p>
            <div className="pt-1 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTokenRequested(true)}
                className="nestly-press px-4 py-2 rounded-full bg-charcoal hover:bg-black text-white text-xs font-bold flex items-center gap-2 transition-all shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Simulate Requesting New Link</span>
              </button>
              {tokenRequested && (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Simulated token state refreshed
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Editorial Atmosphere & Photo Panel */}
        <div data-reset-reveal className="w-full lg:w-5/12 flex flex-col gap-4 sticky top-24">
          <div className="property-card-hover relative rounded-3xl overflow-hidden shadow-sm border border-hairline bg-charcoal aspect-[4/5] flex flex-col justify-end p-6">
            <img
              src="/images/p4-sapele-living.jpg"
              alt="Curated light-filled luxury open living pavilion"
              className="property-card-img absolute inset-0 w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/30 to-transparent"></div>
            <div className="relative z-10 flex flex-col gap-2 text-white">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-medium w-fit border border-white/20">
                Staff Security Standard
              </span>
              <p className="text-xs font-medium text-white/90 leading-relaxed">
                Nestly workstations use role-scoped access policies to safeguard tenant inspection records and landlord title cadastre files.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
