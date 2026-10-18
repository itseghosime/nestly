'use client';

import React, { useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { STAFF_ROLES } from '@/lib/backend/authorization';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import { z } from 'zod';
import { StaffHeader } from '@/components/staff/StaffHeader';
import {
  ShieldCheck,
  User,
  Key,
  Smartphone,
  Laptop,
  CheckCircle,
  AlertCircle,
  Sun,
  Lock,
  ArrowRight,
  RefreshCw,
  LogOut,
  MapPin,
  Info,
} from 'lucide-react';

const identityResponseSchema = z.object({
  user: z.object({ email: z.string().nullable() }),
  profile: z.object({
    display_name: z.string(),
    role: z.enum(STAFF_ROLES),
    assigned_zone: z.string().nullable(),
  }).nullable(),
});

const profileUpdateResponseSchema = z.object({
  data: z.object({
    displayName: z.string(),
    role: z.enum(STAFF_ROLES),
    assignedZone: z.string().nullable(),
  }),
});

export default function StaffProfilePage() {
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [staffRole, setStaffRole] = useState<(typeof STAFF_ROLES)[number] | null>(null);
  const [assignedZone, setAssignedZone] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credStatus, setCredStatus] = useState<string | null>(null);
  const [credStatusSuccess, setCredStatusSuccess] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [sessionsPending, setSessionsPending] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [sessionActionSucceeded, setSessionActionSucceeded] = useState(false);

  const saveSuccessRef = useRef<HTMLSpanElement>(null);
  const credStatusRef = useRef<HTMLDivElement>(null);
  const initials = fullName.trim().split(/\s+/).filter(Boolean)
    .slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '—';

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        const body: unknown = await response.json().catch(() => null);
        const parsed = identityResponseSchema.safeParse(body);
        if (!response.ok || !parsed.success || !parsed.data.profile) {
          const message = body && typeof body === 'object' && 'error' in body
            && typeof body.error === 'string'
            ? body.error
            : 'Unable to load your staff profile';
          throw new Error(message);
        }
        if (!active) return;
        setFullName(parsed.data.profile.display_name);
        setWorkEmail(parsed.data.user.email ?? '');
        setStaffRole(parsed.data.profile.role);
        setAssignedZone(parsed.data.profile.assigned_zone);
      } catch (failure) {
        if (active) {
          setProfileError(failure instanceof Error ? failure.message : 'Unable to load your staff profile');
        }
      } finally {
        if (active) setProfileLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useGSAP(() => {
    if (!saveSuccess || !saveSuccessRef.current || prefersReducedMotion()) return;
    gsap.fromTo(saveSuccessRef.current, { y: -4, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [saveSuccess] });
  useGSAP(() => {
    if (!credStatus || !credStatusRef.current || prefersReducedMotion()) return;
    gsap.fromTo(credStatusRef.current, { y: -4, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [credStatus] });

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setProfileError(null);
    try {
      const response = await fetch('/api/staff/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: fullName }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = profileUpdateResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const message = body && typeof body === 'object' && 'error' in body
          && typeof body.error === 'string'
          ? body.error
          : 'Unable to update staff profile';
        throw new Error(message);
      }
      setFullName(parsed.data.data.displayName);
      setStaffRole(parsed.data.data.role);
      setAssignedZone(parsed.data.data.assignedZone);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } catch (failure) {
      setProfileError(failure instanceof Error ? failure.message : 'Unable to update staff profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setCredStatus('Password must be at least 8 characters.');
      setCredStatusSuccess(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setCredStatus('Passwords do not match.');
      setCredStatusSuccess(false);
      return;
    }
    if (newPassword === currentPassword) {
      setCredStatus('Choose a new password different from your current password.');
      setCredStatusSuccess(false);
      return;
    }

    setPasswordSaving(true);
    setCredStatus(null);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === 'object' && 'error' in body
          && typeof body.error === 'string'
          ? body.error
          : 'Unable to update password';
        throw new Error(message);
      }
      setCredStatus('Password updated successfully.');
      setCredStatusSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(() => setCredStatus(null), 4000);
    } catch (failure) {
      setCredStatus(failure instanceof Error ? failure.message : 'Unable to update password');
      setCredStatusSuccess(false);
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setSessionsPending(true);
    setSessionMessage(null);
    setSessionActionSucceeded(false);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) {
        console.warn('Other staff sessions sign-out failed', error.code || 'unknown');
        setSessionMessage('Unable to sign out other sessions. Try again later.');
      } else {
        setSessionMessage('Other sessions have been signed out. This browser remains active.');
        setSessionActionSucceeded(true);
      }
    } catch {
      console.warn('Other staff sessions sign-out failed', 'network_error');
      setSessionMessage('Unable to sign out other sessions. Try again later.');
    } finally {
      setSessionsPending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader breadcrumbs={[{ label: 'Profile & Security' }]} />
      <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto w-full pb-16">
      {/* Editorial Header Panel */}
      <div className="relative bg-[#F3F4EF] rounded-3xl p-6 md:p-8 shadow-xs border border-[#ECEAE4] overflow-hidden flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="relative z-10 flex flex-col max-w-2xl">
          <div className="flex items-center gap-2 mb-2 text-[#5A5C59] text-xs font-semibold uppercase tracking-wider">
            <span className="inline-block w-2 h-2 rounded-full bg-[#ED572E] animate-pulse" />
            <span>Staff profile · Access Tier: {staffRole ?? 'Loading'}</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#202320] tracking-tight">
            Profile &amp; Security
          </h1>
          <p className="text-sm md:text-base text-[#5A5C59] mt-1 max-w-xl">
            Manage your staff profile details, credentials, and active workstation sessions across Edo &amp; Delta field operations.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 shrink-0 bg-white p-2.5 rounded-full border border-[#ECEAE4] shadow-xs">
          <div className="w-10 h-10 rounded-full bg-[#EAE8E2] flex items-center justify-center text-sm font-bold text-[#202320]">
            {initials}
          </div>
          <div className="flex flex-col pr-4 pl-1">
            <span className="text-xs font-bold text-[#202320] leading-tight">{fullName || 'Loading profile…'}</span>
            <span className="text-[11px] font-semibold text-[#173F35]">{assignedZone || 'No zone assigned'}</span>
          </div>
        </div>

        <div className="absolute -right-8 -top-8 w-64 h-64 bg-[#ED572E]/5 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Main Asymmetric Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 Cols): Profile Data, Credential Updates, MFA */}
        <div className="lg:col-span-7 space-y-6">
          {/* Personal Information Card */}
          <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#ECEAE4] shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#ECEAE4]/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#DDE7DB] text-[#173F35] flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#202320]">Personal Information</h2>
                  <p className="text-xs text-[#5A5C59]">Operator profile and regional contact</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F3F4EF] text-[#202320]">
                Core Dossier
              </span>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#202320]">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    maxLength={120}
                    disabled={profileLoading || isSaving}
                    className="w-full bg-[#F3F4EF] px-4 py-2.5 rounded-full text-sm text-[#202320] focus:outline-hidden focus:ring-2 focus:ring-[#ED572E]/40 transition-all border border-[#ECEAE4]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#202320]">Work Email</label>
                  <input
                    type="email"
                    value={workEmail}
                    readOnly
                    aria-describedby="profile-email-help"
                    className="w-full bg-[#ECEAE4] px-4 py-2.5 rounded-full text-sm text-[#5A5C59] cursor-not-allowed border border-[#ECEAE4]"
                  />
                  <p id="profile-email-help" className="text-[11px] text-[#5A5C59]">
                    Email changes require a separate verified Auth flow.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#202320]">Staff Role</label>
                    <span className="text-[10px] uppercase font-bold text-[#ED572E] tracking-wider">Read-Only</span>
                  </div>
                  <div className="w-full bg-[#ECEAE4] px-4 py-2.5 rounded-full text-sm text-[#5A5C59] flex items-center justify-between cursor-not-allowed">
                    <span>{staffRole ?? 'Loading profile…'}</span>
                    <Lock className="w-3.5 h-3.5 text-[#5A5C59]" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#202320]">Assigned Regional Hub</label>
                    <span className="text-[10px] uppercase font-bold text-[#173F35] tracking-wider">Assigned</span>
                  </div>
                  <div className="w-full bg-[#ECEAE4] px-4 py-2.5 rounded-full text-sm text-[#202320] flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#173F35]" />
                    <span className="truncate">{assignedZone || 'No zone assigned'}</span>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-xs font-semibold text-[#202320]">Contact Phone</label>
                  <input
                    type="text"
                    value="Not configured in staff profile"
                    disabled
                    className="w-full bg-[#ECEAE4] px-4 py-2.5 rounded-full text-sm text-[#5A5C59] cursor-not-allowed border border-[#ECEAE4]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3">
                {saveSuccess ? (
                  <span ref={saveSuccessRef} className="text-xs font-semibold text-[#173F35] flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Profile updated successfully
                  </span>
                ) : (
                  <span className="text-xs text-[#5A5C59]">
                    Only your display name is editable here; role and zone are managed separately.
                  </span>
                )}

                <button
                  type="submit"
                  disabled={profileLoading || isSaving || !staffRole}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#ED572E] hover:bg-[#d1431b] text-white text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Save Profile</span>
                    </>
                  )}
                </button>
              </div>
              {profileError && <p role="alert" className="text-xs text-red-700">{profileError}</p>}
            </form>
          </section>

          {/* Password & Credentials Card */}
          <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#ECEAE4] shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#ECEAE4]/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FFDBD1] text-[#AE2A01] flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#202320]">Password &amp; Credentials</h2>
                  <p className="text-xs text-[#5A5C59]">Workstation access security</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FFDBD1] text-[#3C0800]">
                Supabase Auth
              </span>
            </div>

            <div className="mt-4 p-3.5 rounded-2xl bg-[#F3F4EF] text-[#5A5C59] text-xs flex items-center gap-2.5 border border-[#ECEAE4]">
              <Info className="w-4 h-4 text-[#ED572E] shrink-0" />
              <span>
                Your current password is re-verified before the signed-in account is updated.
              </span>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#202320]">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  className="w-full bg-[#F3F4EF] px-4 py-2.5 rounded-full text-sm text-[#202320] focus:outline-hidden focus:ring-2 focus:ring-[#ED572E]/40 transition-all border border-[#ECEAE4]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#202320]">New Password</label>
                  <input
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    className="w-full bg-[#F3F4EF] px-4 py-2.5 rounded-full text-sm text-[#202320] focus:outline-hidden focus:ring-2 focus:ring-[#ED572E]/40 transition-all border border-[#ECEAE4]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#202320]">Confirm New Password</label>
                  <input
                    type="password"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                    className="w-full bg-[#F3F4EF] px-4 py-2.5 rounded-full text-sm text-[#202320] focus:outline-hidden focus:ring-2 focus:ring-[#ED572E]/40 transition-all border border-[#ECEAE4]"
                  />
                </div>
              </div>

              {credStatus && (
                <div ref={credStatusRef}
                  className={`p-3 rounded-2xl text-xs font-medium ${
                    credStatusSuccess
                      ? 'bg-[#DDE7DB] text-[#173F35]'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {credStatus}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="px-6 py-2.5 rounded-full bg-[#202320] hover:bg-[#343734] text-white text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-50"
                >
                  {passwordSaving ? 'Updating…' : 'Update Credentials'}
                </button>
              </div>
            </form>
          </section>

          {/* Two-Factor Authentication Status Card */}
          <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#ECEAE4] shadow-xs">
            <div className="flex items-start justify-between pb-4 border-b border-[#ECEAE4]/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#DDE7DB] text-[#173F35] flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#202320]">Two-Factor Authentication</h2>
                  <p className="text-xs text-[#5A5C59]">Multi-factor verification architecture</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F3F4EF] text-[#5A5C59]">
                Roadmap Item
              </span>
            </div>

            <div className="mt-4 p-3.5 rounded-2xl bg-[#F3F4EF] text-[#5A5C59] text-xs flex items-center gap-2 border border-[#ECEAE4]">
              <Info className="w-4 h-4 text-[#5A5C59] shrink-0" />
              <span>Multi-factor authentication is not currently configured for this workspace.</span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="p-4 rounded-2xl bg-[#F3F4EF]/70 border border-[#ECEAE4] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#ECEAE4] flex items-center justify-center text-[#202320]">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#202320]">Hardware Authenticator App (TOTP)</h3>
                    <p className="text-xs text-[#5A5C59]">Google Authenticator / 1Password compatible</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#5A5C59] px-3 py-1 rounded-full bg-[#ECEAE4]">
                  Not Enabled
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#F3F4EF]/70 border border-[#ECEAE4] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#ECEAE4] flex items-center justify-center text-[#202320]">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#202320]">Emergency Backup Codes</h3>
                    <p className="text-xs text-[#5A5C59]">No active fallback codes generated</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="text-xs font-semibold text-[#5A5C59] px-3 py-1.5 rounded-full bg-[#ECEAE4] cursor-not-allowed"
                >
                  Unavailable
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN (5 Cols): Sessions & Field Directives */}
        <div className="lg:col-span-5 space-y-6">
          {/* Session controls */}
          <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#ECEAE4] shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-[#ECEAE4]/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#FFDBD1] text-[#AE2A01] flex items-center justify-center">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#202320]">Session Controls</h2>
                  <p className="text-xs text-[#5A5C59]">Supabase does not provide a device inventory here</p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs leading-relaxed text-[#5A5C59]">
                This app cannot list individual devices or revoke one selected session. You can sign out other sessions while keeping this browser active.
              </p>
              <button
                type="button"
                onClick={handleRevokeOtherSessions}
                disabled={sessionsPending}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#ECEAE4] text-xs font-bold text-[#202320] hover:bg-[#F3F4EF] transition-colors disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                {sessionsPending ? 'Signing out…' : 'Sign out other sessions'}
              </button>
              {sessionMessage && (
                <p
                  role={sessionActionSucceeded ? 'status' : 'alert'}
                  className={`text-xs ${sessionActionSucceeded ? 'text-[#173F35]' : 'text-red-700'}`}
                >
                  {sessionMessage}
                </p>
              )}
            </div>
          </section>

          {/* Security & Field Directives Card */}
          <section className="bg-white rounded-3xl p-6 md:p-8 border border-[#ECEAE4] shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-[#ECEAE4]/60">
              <div className="w-9 h-9 rounded-full bg-[#DDE7DB] text-[#173F35] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#202320]">Security &amp; Field Directives</h2>
                <p className="text-xs text-[#5A5C59]">Edo &amp; Delta operational guidelines</p>
              </div>
            </div>

            {/* Editorial Photography Accent */}
            <div className="relative w-full h-44 rounded-2xl overflow-hidden border border-[#ECEAE4]">
              <Image
                src="/images/generated/img_864608b0ef784f93a2ea34fab3c747f1.png"
                alt="Modern minimalist operations desk in warm afternoon light"
                fill
                sizes="(max-width: 1024px) 100vw, 400px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-bold text-[#202320] flex items-center gap-1.5 shadow-xs">
                <Sun className="w-3.5 h-3.5 text-amber-600" />
                <span>Daylight Field Protocol Certified</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-[#F3F4EF] flex gap-3 border border-[#ECEAE4]">
                <AlertCircle className="w-5 h-5 text-[#ED572E] shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-[#202320] block">Safeguard Staff Station Tokens</span>
                  <p className="text-[#5A5C59] leading-relaxed">
                    Never store workstation session credentials on public kiosks or non-Nestly mobile devices while conducting inspections in Edo Central.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#F3F4EF] flex gap-3 border border-[#ECEAE4]">
                <Sun className="w-5 h-5 text-[#173F35] shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-[#202320] block">Daylight Inspection Protocol</span>
                  <p className="text-[#5A5C59] leading-relaxed">
                    Submit customer property verification records strictly before 17:30 WAT to allow automated escrow clearance and field log cryptographic sealing.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center text-xs text-[#5A5C59]">
              <span>Operational Policy</span>
              <Link
                href="/staff/audit-log"
                className="text-[#ED572E] font-bold hover:underline flex items-center gap-1"
              >
                <span>View Audit Trail</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
  );
}
