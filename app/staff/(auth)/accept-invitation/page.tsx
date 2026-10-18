'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  User,
  Key,
  CheckCircle2,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Lock,
  ChevronRight,
} from 'lucide-react';

export default function AcceptInvitationPage() {
  const router = useRouter();
  const [legalName, setLegalName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isActivated, setIsActivated] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-invite-reveal]',
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

  const [formError, setFormError] = React.useState<string | null>(null);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setFormError('Passwords do not match'); return; }
    if (password.length < 8) { setFormError('Password must be at least 8 characters'); return; }
    setIsLoading(true);
    setFormError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get('token_hash');
      const type = params.get('type') || 'invite';
      const res = await fetch('/api/auth/accept-invitation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token_hash, type, password, display_name: legalName }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Invitation failed');
      setIsActivated(true);
      setTimeout(() => router.push('/staff/signin'), 1200);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invitation failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="max-w-6xl mx-auto w-full px-4 sm:px-8 py-8 lg:py-12">
      {/* Top breadcrumb */}
      <div data-invite-reveal className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-ink mb-6">
        <span>Staff Directory</span>
        <ChevronRight className="w-3.5 h-3.5 text-hairline" />
        <span>Onboarding Pipeline</span>
        <ChevronRight className="w-3.5 h-3.5 text-hairline" />
        <span className="text-persimmon font-bold">Secure Token Verification</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form & Invitations */}
        <div data-invite-reveal className="lg:col-span-7 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-persimmon/10 text-persimmon text-[11px] font-bold tracking-wider uppercase mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              STAFF ONBOARDING · INVITATION
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Welcome to the Nestly Team
            </h1>
            <p className="text-sm text-charcoal/70 leading-relaxed mt-1">
              You have been invited to join the Nestly Operations workspace. Complete credential setup below to activate internal telemetry access.
            </p>

            {/* Invitation authority notice */}
            <div className="mt-6 p-5 rounded-2xl bg-soft-stone border border-hairline flex flex-col gap-3">
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <span className="text-xs font-semibold text-muted-ink">Invitation authority</span>
                <span className="text-xs font-bold text-charcoal bg-white px-3 py-1 rounded-full border border-hairline">
                  Verified by secure token
                </span>
              </div>
              <div className="flex items-start justify-between py-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">Staff role and access scope</p>
                  <p className="text-sm font-bold text-charcoal mt-0.5">Assigned by an authorized administrator</p>
                  <span className="text-[11px] text-emerald-700 font-medium">These permissions are not editable during account activation.</span>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Pending verification
                </span>
              </div>

              {/* Role restriction alert */}
              <div className="mt-2 p-3 rounded-xl bg-persimmon/10 border border-persimmon/20 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-persimmon shrink-0 mt-0.5" />
                <p className="text-xs text-charcoal/80 leading-relaxed">
                  <strong className="text-persimmon font-bold">Explicit notice:</strong> Role is pre-assigned by workspace administrator. You cannot self-select administrative privileges.
                </p>
              </div>
            </div>

            {/* Account Activation Form */}
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-charcoal mb-1.5">Full Legal Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-ink" />
                  <input
                    type="text"
                    required
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full bg-warm text-charcoal rounded-full py-3 pl-11 pr-4 text-sm border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-charcoal mb-1.5">Set Password</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-ink" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-warm text-charcoal rounded-full py-3 pl-11 pr-11 text-sm border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-ink hover:text-charcoal p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-charcoal mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-ink" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full bg-warm text-charcoal rounded-full py-3 pl-11 pr-11 text-sm border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-ink hover:text-charcoal p-1"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <p className="px-1 text-[11px] text-muted-ink">
                Use a unique password of at least 8 characters.
              </p>

              {/* Pill CTA */}
              {formError && <p className="text-xs font-bold text-red-600">{formError}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="nestly-press w-full mt-2 py-3.5 px-6 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-sm font-bold tracking-wide transition-all flex items-center justify-center gap-2 shadow-xs disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>Activating account...</span>
                  </>
                ) : (
                  <>
                    <span>Accept Invitation &amp; Activate Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Success feedback */}
              {isActivated && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    Invitation accepted for <strong>{legalName}</strong>. Your password is set; redirecting to sign in...
                  </span>
                </div>
              )}

              <p className="text-center text-[11px] text-muted-ink pt-1">
                Demo preview: No actual staff account is created and no database changes occur.
              </p>
            </form>
          </div>
        </div>

        {/* Right Column: Secondary Preview: Expired / Already Claimed State */}
        <div data-invite-reveal className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-ink">
                State Preview · Edge Case
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                Fallback UI
              </span>
            </div>
            <h2 className="text-base font-bold text-charcoal">
              Preview: Expired or Claimed Invitation
            </h2>
            <div className="mt-4 p-4 rounded-2xl bg-soft-stone border border-hairline flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-charcoal leading-tight">Token Invalid or Reclaimed</p>
                <p className="text-xs text-charcoal/70 mt-1 leading-relaxed">
                  This invitation token has expired or has already been claimed. Contact your workspace administrator for a re-invite.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href="/contact"
                    className="nestly-press px-3.5 py-1.5 rounded-full bg-charcoal text-white text-xs font-bold hover:bg-black transition-colors"
                  >
                    Contact Ops Desk
                  </Link>
                  <Link
                    href="/faq"
                    className="px-3.5 py-1.5 rounded-full bg-transparent text-muted-ink text-xs font-bold hover:text-charcoal transition-colors"
                  >
                    View Docs →
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Quick onboarding guide card */}
          <div className="bg-soft-stone rounded-3xl p-6 border border-hairline">
            <h3 className="text-xs font-bold text-charcoal uppercase tracking-wider mb-2">
              Next Steps for Field Agents
            </h3>
            <ul className="text-xs text-charcoal/80 space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>Download the daylight GPS camera app for property inspections.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>Review Benin City GRA and Sapele priority feeder maps in the portal.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>Check daily calendar slots allocated to your assigned zone.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
