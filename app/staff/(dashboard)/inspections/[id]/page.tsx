'use client';

import React, { use, useCallback, useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import Link from 'next/link';
import { StaffHeader } from '@/components/staff/StaffHeader';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';

type Booking = {
  id: string;
  property_id: string;
  public_reference: string;
  status: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  gate_code: string | null;
  property_title: string;
  property_reference: string;
  property_address: string;
  slot: {
    id: string;
    starts_at: string;
    ends_at: string;
    field_agent_name: string;
  } | null;
};

type PropertyDetails = {
  priceFormatted: string;
  priceAnnual: number;
  featuredImage: string | null;
  galleryImages: string[];
  unconfirmedFeeCount: number;
  fees: Array<{ amount: number; confirmed_at: string | null; required: boolean }>;
};

type AvailableSlot = {
  id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  reserved_count: number;
};

type TransitionStatus = 'approved' | 'rejected' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show';

function formatSlotDate(slot: { starts_at: string } | null) {
  if (!slot) return 'No slot assigned';
  return new Intl.DateTimeFormat('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  }).format(new Date(slot.starts_at));
}

function formatSlotTime(slot: { starts_at: string; ends_at: string } | null) {
  if (!slot) return 'Time not assigned';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(new Date(slot.starts_at))}–${formatter.format(new Date(slot.ends_at))} WAT`;
}

export default function InspectionRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [property, setProperty] = useState<PropertyDetails | null>(null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [outcome, setOutcome] = useState<'attended' | 'landlord_unavailable' | 'customer_no_show' | 'property_unavailable' | 'other'>('attended');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedbackToast, setFeedbackToast] = useState('');
  const toastRef = useRef<HTMLDivElement>(null);
  const gateRef = useRef<HTMLDivElement>(null);
  const status = booking?.status || '';

  const loadBooking = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const bookingResponse = await fetch(`/api/inspections/bookings/${resolvedParams.id}`);
      const bookingResult = await bookingResponse.json();
      if (!bookingResponse.ok) throw new Error(bookingResult.error || 'Unable to load the inspection request');
      const loadedBooking = bookingResult.booking as Booking;
      setBooking(loadedBooking);

      const [propertyResponse, slotsResponse] = await Promise.all([
        fetch(`/api/properties/${loadedBooking.property_id}`),
        fetch(`/api/inspections/slots?property_id=${encodeURIComponent(loadedBooking.property_id)}`),
      ]);
      const [propertyResult, slotsResult] = await Promise.all([
        propertyResponse.json(),
        slotsResponse.json(),
      ]);
      if (!propertyResponse.ok) throw new Error(propertyResult.error || 'Unable to load property details');
      if (!slotsResponse.ok) throw new Error(slotsResult.error || 'Unable to load replacement inspection slots');
      setProperty(propertyResult.data as PropertyDetails);
      const slots = (slotsResult.data || []) as AvailableSlot[];
      const eligibleSlots = slots.filter((slot) => (
        slot.id !== loadedBooking.slot?.id
        && slot.capacity > slot.reserved_count
        && Date.parse(slot.starts_at) > Date.now()
      ));
      setAvailableSlots(eligibleSlots);
      setSelectedSlotId((current) => (
        eligibleSlots.some((slot) => slot.id === current) ? current : eligibleSlots[0]?.id || ''
      ));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the inspection request');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadBooking();
    });
    return () => {
      active = false;
    };
  }, [loadBooking]);

  useGSAP(() => {
    if (!feedbackToast || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -8, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.22, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [feedbackToast] });
  useGSAP(() => {
    if (status !== 'approved' || !gateRef.current || prefersReducedMotion()) return;
    gsap.fromTo(gateRef.current, { scale: 0.96, opacity: 0.85 }, { scale: 1, opacity: 1, duration: 0.28, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [status] });

  const transitionBooking = async (nextStatus: TransitionStatus) => {
    if (!booking) return;
    if (nextStatus === 'rescheduled' && !selectedSlotId) {
      setError('Choose an available replacement slot before rescheduling.');
      return;
    }
    setSaving(true);
    setError('');
    setFeedbackToast('');
    try {
      const response = await fetch(`/api/inspections/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          status: nextStatus,
          ...(nextStatus === 'rescheduled' ? { newSlotId: selectedSlotId } : {}),
          ...(['completed', 'no_show'].includes(nextStatus) ? { outcome } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update the inspection request');
      await loadBooking(false);
      const notice = nextStatus === 'approved'
        ? 'Inspection approved by staff. Gate details are shown only when generated by the booking service.'
        : nextStatus === 'rescheduled'
          ? 'Inspection moved to the selected available slot.'
          : `Inspection request marked ${nextStatus.replaceAll('_', ' ')}.`;
      setFeedbackToast(notice);
      window.setTimeout(() => setFeedbackToast(''), 4000);
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : 'Unable to update the inspection request');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-warm">
        <StaffHeader breadcrumbs={[{ label: 'Inspections', href: '/staff/inspections' }, { label: 'Loading request' }]} />
        <main className="mx-auto w-full max-w-7xl p-4 text-sm text-muted-ink sm:p-8">Loading inspection request…</main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-warm">
        <StaffHeader breadcrumbs={[{ label: 'Inspections', href: '/staff/inspections' }, { label: 'Request unavailable' }]} />
        <main className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-8">
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error || 'Inspection request not found or not accessible.'}
          </div>
          <Link href="/staff/inspections" className="text-sm font-bold text-primary hover:underline">Back to calendar</Link>
        </main>
      </div>
    );
  }

  const knownRequiredFees = property?.fees.filter((fee) => fee.required && fee.confirmed_at) || [];
  const knownRequiredFeeTotal = knownRequiredFees.reduce((total, fee) => total + Number(fee.amount), 0);
  const hasDecisionAuthority = ['pending', 'approved', 'rescheduled'].includes(status);

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[
          { label: 'Inspections', href: '/staff/inspections' },
          { label: `Review: ${booking.public_reference}` },
        ]}
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Navigation & Status Header */}
        <div className="space-y-4">
          <Link
            href="/staff/inspections"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-ink hover:text-charcoal transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Calendar</span>
          </Link>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-hairline flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                  Inquiry Track: {booking.public_reference}
                </span>
                <span
                  className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {status.replaceAll('_', ' ')}
                </span>
              </div>
              <h1 className="font-headline text-2xl font-bold text-charcoal tracking-tight">
                Inspection Review: {booking.name || 'Customer'}
              </h1>
              <p className="text-xs text-charcoal/70">
                Coordinated physical walkthrough for {booking.property_title}.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-muted-ink uppercase font-bold block">Assigned Officer</span>
                <span className="text-xs font-bold text-charcoal">{booking.slot?.field_agent_name || 'Unassigned'}</span>
              </div>
              <div className="w-10 h-10 rounded-full bg-soft-stone text-primary font-bold flex items-center justify-center text-xs border border-hairline">
                {(booking.slot?.field_agent_name || 'NA').slice(0, 2)}
              </div>
            </div>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackToast && (
          <div ref={toastRef} className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5 font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackToast}</span>
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Customer & Property Details */}
          <div className="lg:col-span-7 space-y-6">
            {/* Customer Submission Card */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <h2 className="font-headline text-base font-bold text-charcoal">Customer Inbound Details</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  Contact submitted
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-2xl bg-soft-stone border border-hairline">
                  <span className="text-[10px] font-bold text-muted-ink uppercase">Prospect</span>
                  <p className="font-headline font-bold text-charcoal text-sm mt-0.5">{booking.name || 'Name not provided'}</p>
                  <p className="text-muted-ink">{booking.email || 'Email not provided'}</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-soft-stone border border-hairline">
                  <span className="text-[10px] font-bold text-muted-ink uppercase">Phone</span>
                  <p className="font-headline font-bold text-charcoal text-sm mt-0.5 font-mono">{booking.phone || 'Phone not provided'}</p>
                  <span className="text-primary font-medium text-[11px] flex items-center gap-1 mt-0.5">
                    <MessageSquare className="w-3 h-3" /> Customer contact
                  </span>
                </div>
              </div>

              {/* Time Window */}
              <div className="p-4 rounded-2xl bg-persimmon/10 border border-persimmon/20 space-y-1 text-xs">
                <span className="text-[10px] font-bold text-persimmon uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Requested Viewing Slot (WAT)
                </span>
                <p className="font-headline text-sm font-bold text-charcoal">
                  {formatSlotDate(booking.slot)} · {formatSlotTime(booking.slot)}
                </p>
              </div>

              {/* Special Customer Notes */}
              <div className="p-4 rounded-2xl bg-soft-stone border border-hairline space-y-1.5 text-xs">
                <span className="font-bold text-charcoal">Prospect Inquiry Notes:</span>
                <p className="text-charcoal/80 italic leading-relaxed">
                  {booking.message ? `“${booking.message}”` : 'No customer notes were provided.'}
                </p>
              </div>
            </div>

            {/* Property Card */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-hairline">
              <div className="relative aspect-[16/9] w-full">
                <img
                  src={property?.featuredImage || property?.galleryImages?.[0] || '/images/hero-home.png'}
                  alt={booking.property_title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-transparent to-transparent flex items-end p-6 text-white">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-persimmon bg-white/90 px-2 py-0.5 rounded-full inline-block mb-1">
                      {booking.property_reference || booking.property_id}
                    </span>
                    <h3 className="font-headline text-lg font-bold leading-tight">{booking.property_title}</h3>
                    <p className="text-xs text-white/90 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      <span>{booking.property_address}</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-6 grid grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-soft-stone border border-hairline">
                  <span className="text-muted-ink text-[10px] block">Annual Rent</span>
                  <span className="font-bold text-persimmon text-sm">{property?.priceFormatted || 'Rent unavailable'}</span>
                </div>
                <div className="p-3 rounded-2xl bg-soft-stone border border-hairline">
                    <span className="text-muted-ink text-[10px] block">Confirmed Required Fees</span>
                    <span className="font-bold text-charcoal text-sm">
                      {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(knownRequiredFeeTotal)}
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl bg-soft-stone border border-hairline">
                    <span className="text-muted-ink text-[10px] block">Fee Verification</span>
                    <span className="font-bold text-charcoal text-sm">
                      {property?.unconfirmedFeeCount ? `${property.unconfirmedFeeCount} unconfirmed` : 'Confirmed'}
                    </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Decision Deck & Gate Pass */}
          <div className="lg:col-span-5 space-y-6 sticky top-24">
            {/* Coordinator Decision Deck */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <h2 className="font-headline text-base font-bold text-charcoal">
                Coordinator Decision Deck
              </h2>
              <p className="text-xs text-charcoal/70 leading-relaxed">
                Record a human decision for this request. This interface does not send customer messages or claim that an external notification was delivered.
              </p>

              {status === 'pending' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void transitionBooking('approved')}
                    disabled={saving}
                    className="w-full py-3 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{saving ? 'Saving…' : 'Approve'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void transitionBooking('rejected')}
                    disabled={saving}
                    className="w-full py-3 px-4 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}

              {hasDecisionAuthority && (
                <div className="space-y-2">
                  <label htmlFor="replacement-slot" className="block text-[11px] font-bold text-charcoal">
                    Available replacement slot
                  </label>
                  <select
                    id="replacement-slot"
                    value={selectedSlotId}
                    onChange={(event) => setSelectedSlotId(event.target.value)}
                    disabled={saving || availableSlots.length === 0}
                    className="w-full rounded-full border border-hairline bg-warm px-4 py-2.5 text-xs text-charcoal disabled:opacity-50"
                  >
                    <option value="">
                      {availableSlots.length ? 'Choose a replacement slot' : 'No available replacement slots'}
                    </option>
                    {availableSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {formatSlotDate(slot)} · {formatSlotTime(slot)} ({slot.capacity - slot.reserved_count} spaces)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void transitionBooking('rescheduled')}
                    disabled={saving || !selectedSlotId}
                    className="w-full py-2.5 px-4 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold flex items-center justify-center gap-2 border border-hairline transition-colors disabled:opacity-50"
                  >
                    <Clock className="w-4 h-4" />
                    <span>{saving ? 'Saving…' : 'Move to Selected Slot'}</span>
                  </button>
                </div>
              )}

              {status === 'approved' && (
                <div className="space-y-2 border-t border-hairline pt-3">
                  <label htmlFor="inspection-outcome" className="block text-[11px] font-bold text-charcoal">
                    Completion outcome
                  </label>
                  <select
                    id="inspection-outcome"
                    value={outcome}
                    onChange={(event) => setOutcome(event.target.value as typeof outcome)}
                    disabled={saving}
                    className="w-full rounded-full border border-hairline bg-warm px-4 py-2.5 text-xs text-charcoal"
                  >
                    <option value="attended">Attended</option>
                    <option value="landlord_unavailable">Landlord unavailable</option>
                    <option value="customer_no_show">Customer no-show</option>
                    <option value="property_unavailable">Property unavailable</option>
                    <option value="other">Other</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void transitionBooking('completed')}
                      disabled={saving}
                      className="rounded-full bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                    >
                      Mark completed
                    </button>
                    <button
                      type="button"
                      onClick={() => void transitionBooking('no_show')}
                      disabled={saving}
                      className="rounded-full border border-hairline bg-white px-4 py-2.5 text-xs font-bold text-charcoal disabled:opacity-50"
                    >
                      Mark no-show
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void transitionBooking('cancelled')}
                    disabled={saving}
                    className="w-full rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-800 disabled:opacity-50"
                  >
                    Cancel inspection
                  </button>
                </div>
              )}
            </div>

            {/* Gate Access Credentials */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                  Gatehouse Security Credentials
                </span>
                {status === 'approved' && booking.gate_code && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    Approved
                  </span>
                )}
              </div>

              {status === 'approved' && booking.gate_code ? (
                <>
                  <div ref={gateRef} className="p-4 rounded-2xl bg-soft-stone border border-hairline text-center space-y-1">
                    <span className="text-[10px] text-muted-ink font-bold uppercase tracking-wider">
                      Gate Details
                    </span>
                    <p className="font-headline text-lg font-bold font-mono text-charcoal break-all">
                      {booking.gate_code}
                    </p>
                    <p className="text-[11px] text-muted-ink">
                      {formatSlotDate(booking.slot)} · {formatSlotTime(booking.slot)}
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-charcoal/80">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Visible to authorized staff. No customer or gatehouse delivery is implied.</span>
                  </div>
                </>
              ) : (
                <p className="rounded-2xl bg-soft-stone p-4 text-xs text-muted-ink">
                  Gate details are not available. They appear only after an authorized approval creates them.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
