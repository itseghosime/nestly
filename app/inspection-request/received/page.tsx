'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { formatInspectionDate, formatInspectionTimeRange } from '@/lib/backend/inspection-time';
import { prefersReducedMotion } from '@/lib/motion';
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Home,
  Info,
  MessageSquare,
} from 'lucide-react';

type InspectionReceipt = {
  public_reference: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed' | 'no_show' | 'expired';
  property_title: string;
  starts_at: string | null;
  ends_at: string | null;
  gate_details: string | null;
  reservation_expires_at: string | null;
  updated_at: string;
};

const RECEIPT_TOKEN_KEY = 'nestly_inspection_receipt_token';

function icsEscape(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll('\n', '\\n');
}

function icsTimestamp(value: string): string {
  return new Date(value).toISOString().replaceAll('-', '').replaceAll(':', '').replace(/\.\d{3}/, '');
}

function RequestReceivedContent() {
  const [receipt, setReceipt] = useState<InspectionReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);
  const [calendarSaved, setCalendarSaved] = useState(false);
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const badgeIconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const loadReceipt = async () => {
      let token = '';
      const fragmentToken = window.location.hash.slice(1);
      if (/^[a-f0-9]{64}$/.test(fragmentToken)) {
        token = fragmentToken;
        window.history.replaceState(window.history.state, '', window.location.pathname);
        try {
          sessionStorage.setItem(RECEIPT_TOKEN_KEY, fragmentToken);
        } catch {
          token = fragmentToken;
        }
      }
      try {
        if (!token) token = sessionStorage.getItem(RECEIPT_TOKEN_KEY) || '';
      } catch {
        if (!token) token = '';
      }
      if (!/^[a-f0-9]{64}$/.test(token)) {
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
      if (!/^[a-f0-9]{64}$/.test(token)) {
        if (active) {
          setError('This browser session does not contain an inspection receipt. Open the receipt in the same browser session used to submit the request.');
          setLoading(false);
        }
        return;
      }

      try {
        const response = await fetch('/api/inspections/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to retrieve inspection status.');
        if (active) setReceipt(result.receipt as InspectionReceipt);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to retrieve inspection status.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadReceipt();
    return () => {
      active = false;
    };
  }, []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-receipt-enter]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.42, stagger: 0.075, clearProps: 'all' },
      );
      if (badgeIconRef.current) {
        gsap.fromTo(
          badgeIconRef.current,
          { scale: 0.88, opacity: 0.8 },
          { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out', clearProps: 'all' },
        );
      }
    },
    { scope: mainRef, dependencies: [loading] },
  );

  const isConfirmed = receipt?.status === 'approved';
  const statusLabel = loading
    ? 'Loading receipt'
    : receipt?.status === 'approved'
      ? 'Confirmed by staff'
      : receipt?.status === 'pending'
        ? 'Pending staff confirmation'
        : receipt?.status === 'expired'
          ? 'Temporary hold expired'
          : receipt?.status === 'rejected'
            ? 'Request not approved'
            : receipt?.status === 'cancelled'
              ? 'Request cancelled'
              : receipt?.status === 'completed'
                ? 'Inspection completed'
                : receipt?.status === 'no_show'
                  ? 'Inspection marked no-show'
                  : 'Receipt unavailable';

  const handleCopyRef = async () => {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.public_reference);
      setCopiedRef(true);
      window.setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      setError('Unable to copy the reference in this browser.');
    }
  };

  const handleDownloadIcs = () => {
    if (!receipt || !isConfirmed || !receipt.starts_at || !receipt.ends_at) return;
    const now = new Date().toISOString();
    const content = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Nestly//Inspection//EN',
      'BEGIN:VEVENT',
      `UID:${icsEscape(receipt.public_reference)}@nestly`,
      `DTSTAMP:${icsTimestamp(now)}`,
      `DTSTART:${icsTimestamp(receipt.starts_at)}`,
      `DTEND:${icsTimestamp(receipt.ends_at)}`,
      `SUMMARY:${icsEscape(`Nestly inspection - ${receipt.property_title}`)}`,
      `DESCRIPTION:${icsEscape(`Confirmed inspection reference: ${receipt.public_reference}`)}`,
      `LOCATION:${icsEscape(receipt.property_title)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${receipt.public_reference}.ics`;
    link.click();
    URL.revokeObjectURL(url);
    setCalendarSaved(true);
    window.setTimeout(() => setCalendarSaved(false), 2500);
  };

  const StatusIcon = isConfirmed ? CheckCircle2 : Clock;
  const statusMessage = receipt?.status === 'pending'
    ? 'Your request is received, but the time is not confirmed. A staff member must approve it before it becomes an appointment.'
    : receipt?.status === 'approved'
      ? 'A staff member has confirmed this inspection. Gate details are shown only when they have been generated by the booking service.'
      : receipt?.status === 'expired'
        ? 'The temporary time hold expired before confirmation. Please choose another available time.'
        : receipt?.status === 'rejected'
          ? 'This inspection request was not approved. You can choose another available time or contact the Nestly team.'
          : receipt?.status === 'cancelled'
            ? 'This inspection request has been cancelled and its time is no longer reserved.'
            : receipt?.status === 'completed'
              ? 'This inspection is recorded as completed. That does not mean a tenancy has been completed.'
              : receipt?.status === 'no_show'
                ? 'This inspection is recorded as a no-show.'
                : 'Your inspection status could not be loaded.';

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-hairline">
          <div data-receipt-enter>
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <div
                ref={badgeIconRef}
                className={`w-9 h-9 rounded-full border flex items-center justify-center shadow-2xs ${
                  isConfirmed
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    : 'bg-[#FFF4E5] text-[#9A5B00] border-[#FFE0B2]'
                }`}
              >
                <StatusIcon className="w-5 h-5" />
              </div>
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF4E5] text-[#9A5B00] border border-[#FFE0B2] text-xs font-bold tracking-wide shadow-2xs">
                <span className="inline-flex rounded-full h-2 w-2 bg-[#B86E00]"></span>
                <span>{statusLabel}</span>
              </span>
              <span className="text-xs text-muted-ink font-semibold px-2.5 py-1 rounded-full bg-white border border-hairline">
                Inspection Receipt
              </span>
            </div>
            <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal">
              {loading ? 'Loading your request…' : receipt ? 'Inspection request status' : 'Receipt unavailable'}
            </h1>
            <p className="text-sm sm:text-base text-muted-ink mt-2 max-w-xl">
              {statusMessage}
            </p>
          </div>

          {receipt && (
            <div
              data-receipt-enter
              className="bg-white p-4 sm:p-5 rounded-2xl border border-hairline shadow-2xs flex flex-col items-start md:items-end min-w-[230px]"
            >
              <span className="text-[11px] uppercase tracking-wider text-muted-ink font-bold">
                Request reference
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-headline text-lg sm:text-xl font-extrabold text-charcoal tracking-tight">
                  {receipt.public_reference}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyRef()}
                  aria-label="Copy reference code"
                  title="Copy reference code"
                  className="p-1.5 rounded-lg hover:bg-soft-stone text-muted-ink hover:text-charcoal nestly-press cursor-pointer"
                >
                  {copiedRef ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              {isConfirmed && receipt.starts_at && receipt.ends_at && (
                <button
                  type="button"
                  onClick={handleDownloadIcs}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-persimmon hover:underline cursor-pointer"
                >
                  {calendarSaved ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Calendar className="w-3.5 h-3.5" />}
                  <span>{calendarSaved ? 'Calendar reminder downloaded' : 'Add confirmed appointment (.ics)'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {(error || (!receipt && !loading)) && (
          <div role="alert" className="my-8 p-4 sm:p-5 bg-soft-stone rounded-2xl border border-hairline flex items-start gap-3.5 text-sm text-muted-ink">
            <Info className="w-5 h-5 text-persimmon shrink-0 mt-0.5" />
            <p>{error || 'No inspection receipt is available in this browser session.'}</p>
          </div>
        )}

        {receipt && (
          <>
            <div
              data-receipt-enter
              className="my-8 p-4 sm:p-5 bg-soft-stone rounded-2xl border border-hairline flex items-start gap-3.5 text-xs sm:text-sm text-muted-ink"
            >
              <Info className="w-5 h-5 text-persimmon shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold text-charcoal">{statusMessage}</p>
                {receipt.status === 'pending' && receipt.reservation_expires_at && (
                  <p>
                    The temporary slot hold expires {formatInspectionDate(receipt.reservation_expires_at, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} WAT if it is not confirmed.
                  </p>
                )}
              </div>
            </div>

            <div
              data-receipt-enter
              className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-sm mb-8"
            >
              <h2 className="font-headline text-xl font-bold text-charcoal pb-4 mb-6 border-b border-hairline">
                Inspection particulars
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex gap-4 items-center">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-soft-stone border border-hairline shrink-0 flex items-center justify-center">
                    <Home className="w-8 h-8 text-muted-ink" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] uppercase tracking-wider text-persimmon font-bold block mb-1">
                      Selected residence
                    </span>
                    <h3 className="font-headline text-base sm:text-lg font-bold text-charcoal line-clamp-2">
                      {receipt.property_title}
                    </h3>
                  </div>
                </div>
                <div className="space-y-3 text-xs sm:text-sm border-t md:border-t-0 md:border-l border-hairline pt-4 md:pt-0 md:pl-8">
                  <div>
                    <span className="text-[11px] uppercase tracking-wider text-muted-ink font-semibold block">
                      {isConfirmed ? 'Confirmed appointment time' : 'Requested time'}
                    </span>
                    <p className="font-bold text-charcoal mt-0.5">
                      {receipt.starts_at && receipt.ends_at
                        ? `${formatInspectionDate(receipt.starts_at, {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })} · ${formatInspectionTimeRange(receipt.starts_at, receipt.ends_at)}`
                        : 'No appointment time is currently reserved'}
                    </p>
                    {!isConfirmed && receipt.status === 'pending' && (
                      <p className="text-xs text-muted-ink mt-1">Pending staff confirmation; this is not a confirmed booking.</p>
                    )}
                  </div>
                  {isConfirmed && receipt.gate_details && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <span className="text-[11px] uppercase tracking-wider text-emerald-800 font-bold block">
                        Gate pass details
                      </span>
                      <p className="font-headline text-xl font-extrabold text-emerald-900 mt-1">
                        {receipt.gate_details}
                      </p>
                    </div>
                  )}
                  {isConfirmed && !receipt.gate_details && (
                    <p className="text-xs text-muted-ink">
                      The appointment is confirmed; gate details have not been generated yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <div data-receipt-enter className="flex flex-col sm:flex-row items-center gap-3 justify-center">
          <Link
            href="/browse"
            className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-charcoal hover:bg-black text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm nestly-press"
          >
            <Home className="w-4 h-4" />
            <span>Return to Browse Homes</span>
          </Link>
          <Link
            href="/saved"
            className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-white hover:bg-soft-stone text-charcoal border border-hairline text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-2xs nestly-press"
          >
            <span>View Saved Shortlist</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsNiaOpen(true)}
            className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm nestly-press cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Ask Nia About Your Visit</span>
          </button>
        </div>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}

export default function RequestReceivedPage() {
  return <RequestReceivedContent />;
}
