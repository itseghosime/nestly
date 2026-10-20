'use client';

import React, { useState, useRef, Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import {
  formatInspectionDate,
  formatInspectionTimeRange,
  inspectionDateKey,
} from '@/lib/backend/inspection-time';
import { getPendingFormSubmission } from '@/lib/public-form-submission';
import { prefersReducedMotion } from '@/lib/motion';
import {
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  ChevronRight,
  MapPin,
  AlertCircle
} from 'lucide-react';

type PropertyPreview = {
  id: string;
  title: string;
  addressShort: string | null;
  featuredImage: string | null;
  verificationBadge: string;
  priceFormatted: string;
};

type InspectionSlot = {
  id: string;
  property_id: string;
  starts_at: string;
  ends_at: string;
  spaces_remaining: number;
};

const PENDING_SUBMISSION_STORAGE_KEY = 'nestly:inspection-submission:v1';

function InspectionRequestContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('property');

  const [property, setProperty] = useState<PropertyPreview | null>(null);
  const [slots, setSlots] = useState<InspectionSlot[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    const loadInspectionData = async () => {
      if (!propertyId) {
        setLoadError('Choose a property from Browse Homes before requesting an inspection.');
        setProperty(null);
        setSlots([]);
        setSelectedSlotId('');
        setSelectedDateKey('');
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setLoadError('');
      try {
        const propertyResponse = await fetch(`/api/properties/${encodeURIComponent(propertyId)}`, {
          cache: 'no-store',
        });
        const propertyResult = await propertyResponse.json();
        if (!propertyResponse.ok) {
          throw new Error(propertyResult.error || 'This property is not available for inspection requests.');
        }
        const slotResponse = await fetch(
          `/api/inspections/availability?property_id=${encodeURIComponent(propertyId)}`,
          { cache: 'no-store' },
        );
        const slotResult = await slotResponse.json();
        if (!slotResponse.ok) {
          throw new Error(slotResult.error || 'Unable to load inspection availability.');
        }
        if (!active) return;
        setProperty(propertyResult.data as PropertyPreview);
        const availableSlots = (slotResult.data || []) as InspectionSlot[];
        setSlots(availableSlots);
        const firstSlot = availableSlots[0];
        setSelectedSlotId(firstSlot?.id || '');
        setSelectedDateKey(firstSlot ? inspectionDateKey(firstSlot.starts_at) : '');
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load inspection availability.');
          setProperty(null);
          setSlots([]);
          setSelectedSlotId('');
          setSelectedDateKey('');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadInspectionData();
    return () => {
      active = false;
    };
  }, [propertyId]);

  const dateKeys = [...new Set(slots.map((slot) => inspectionDateKey(slot.starts_at)))].slice(0, 4);
  const slotsForSelectedDate = slots.filter((slot) => inspectionDateKey(slot.starts_at) === selectedDateKey);
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) || null;

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-inspect-enter]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) newErrors.fullName = 'Please enter your full name';
    if (phone.trim().length < 5) newErrors.phone = 'Please provide a valid phone number';
    if (!selectedSlot) newErrors.slot = 'Select an available inspection time';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (!prefersReducedMotion() && formRef.current) {
        const invalidFields = formRef.current.querySelectorAll('[data-error-field="true"]');
        if (invalidFields.length > 0) {
          gsap.fromTo(
            invalidFields,
            { x: -6 },
            { x: 0, duration: 0.32, ease: 'elastic.out(2, 0.25)', clearProps: 'transform' }
          );
        }
      }
      return;
    }
    if (!selectedSlot) return;

    setIsSubmitting(true);
    setSubmitError('');
    const payload = {
      slotId: selectedSlot.id,
      name: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      message: notes.trim(),
    };

    try {
      const pendingSubmission = await getPendingFormSubmission(
        window.sessionStorage,
        PENDING_SUBMISSION_STORAGE_KEY,
        payload,
      );
      const response = await fetch('/api/inspections/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': pendingSubmission.key,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit your inspection request.');
      if (
        result.requestReceived !== true
        || result.confirmed !== false
        || typeof result.receiptToken !== 'string'
      ) {
        throw new Error('The inspection service returned an invalid receipt.');
      }

      let receiptPath = '/inspection-request/received';
      try {
        sessionStorage.setItem('nestly_inspection_receipt_token', result.receiptToken);
      } catch {
        receiptPath += `#${result.receiptToken}`;
      }
      router.push(receiptPath);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit your inspection request.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-8 sm:py-12">
        {/* Breadcrumb */}
        <div data-inspect-enter className="flex items-center gap-2 text-xs font-semibold text-muted-ink mb-6">
          <Link href="/" className="hover:text-charcoal transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 text-hairline" />
          <Link href="/browse" className="hover:text-charcoal transition-colors">Properties</Link>
          <ChevronRight className="w-3.5 h-3.5 text-hairline" />
          <span className="text-charcoal font-bold">Request Inspection</span>
        </div>

        {/* Header Banner */}
        <div data-inspect-enter className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-10 pb-6 border-b border-hairline">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-charcoal mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Escorted Private Showing · Africa/Lagos Time</span>
            </div>
            <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal">
              Schedule Your On-Site Walkthrough
            </h1>
            <p className="text-sm sm:text-base text-muted-ink mt-2 max-w-xl">
              Request an accompanied viewing of this property. Your selected time remains pending until an authorized staff member confirms it.
            </p>
          </div>

          <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-hairline shadow-2xs text-xs font-semibold text-charcoal">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Staff-reviewed inspection request</span>
          </div>
        </div>

        {/* Main Grid: Left Property Preview, Right Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Property Preview Card */}
          <div data-inspect-enter className="lg:col-span-5 bg-white rounded-3xl p-5 sm:p-6 border border-hairline shadow-sm space-y-5">
            <div className="relative w-full h-[220px] rounded-2xl overflow-hidden bg-soft-stone">
              {property?.featuredImage ? (
                <img
                  src={property.featuredImage}
                  alt={property.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-muted-ink">
                  {isLoading ? 'Loading property…' : 'Property image unavailable'}
                </div>
              )}
              {property && (
                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[11px] font-extrabold tracking-wider uppercase text-charcoal">
                  {property.verificationBadge}
                </div>
              )}
            </div>

            <div>
              <span className="text-[11px] uppercase tracking-wider text-persimmon font-extrabold block">
                Target Listing
              </span>
              <h3 className="font-headline text-xl font-bold text-charcoal mt-0.5">
                {property?.title || 'No property selected'}
              </h3>
              <p className="text-xs text-muted-ink mt-1 flex items-center gap-1.5 font-medium">
                <MapPin className="w-3.5 h-3.5 text-persimmon shrink-0" />
                <span>{property?.addressShort || 'Select a property from Browse Homes'}</span>
              </p>
            </div>

            <div className="pt-4 border-t border-hairline flex items-center justify-between">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-muted-ink font-semibold block">
                  Annual Rent
                </span>
                <p className="font-headline text-2xl font-extrabold text-charcoal">
                  {property?.priceFormatted || '—'}
                  <span className="text-xs font-normal text-muted-ink">/yr</span>
                </p>
              </div>
              <Link
                href={property ? `/property/${property.id}` : '/browse'}
                className="text-xs font-bold text-primary hover:underline"
              >
                Change listing →
              </Link>
            </div>

            <div className="pt-4 border-t border-hairline space-y-2 text-xs text-muted-ink">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Inspection reviewed by authorized staff</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Gate details appear only after confirmation</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Test water pressure &amp; distribution board</span>
              </div>
            </div>
          </div>

          {/* Right Column: Appointment Form */}
          <div data-inspect-enter className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-sm">
            <div className="pb-4 mb-6 border-b border-hairline">
              <span className="text-[11px] uppercase tracking-widest text-primary font-bold">
                Step 1 of 2 · Viewing Window
              </span>
              <h2 className="font-headline text-2xl font-bold text-charcoal mt-1">
                Select Your Preferred Viewing Window
              </h2>
              <p className="text-xs text-muted-ink mt-1">
                Available times are shown in West Africa Time (WAT). A request is not a confirmed appointment.
              </p>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Date Selection */}
              <div>
                <label className="block text-xs font-bold text-charcoal mb-2.5">
                  Select an Available Date
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {dateKeys.map((dateKey) => {
                    const daySlots = slots.filter((slot) => inspectionDateKey(slot.starts_at) === dateKey);
                    const firstSlot = daySlots[0];
                    const selected = selectedDateKey === dateKey;
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedDateKey(dateKey);
                          setSelectedSlotId(firstSlot?.id || '');
                          setErrors((current) => ({ ...current, slot: '' }));
                        }}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center nestly-press cursor-pointer ${
                          selected
                            ? 'bg-primary text-white border-primary shadow-xs'
                            : 'bg-soft-stone border-hairline hover:bg-stone-card text-charcoal'
                        }`}
                      >
                        <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                          {firstSlot ? formatInspectionDate(firstSlot.starts_at, { weekday: 'short' }) : ''}
                        </span>
                        <span className="text-sm font-extrabold my-0.5">
                          {firstSlot ? formatInspectionDate(firstSlot.starts_at, { day: 'numeric', month: 'short' }) : ''}
                        </span>
                        <span className="text-[9px] opacity-70">{daySlots.length} available</span>
                      </button>
                    );
                  })}
                </div>
                {!isLoading && dateKeys.length === 0 && (
                  <p className="mt-3 text-xs text-muted-ink">
                    {loadError || 'There are no open inspection times for this property right now.'}
                  </p>
                )}
              </div>

              {/* Time Slots */}
              <div>
                <label className="block text-xs font-bold text-charcoal mb-2.5">
                  Select an Available Time (WAT)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {slotsForSelectedDate.map((slot) => {
                    const selected = selectedSlotId === slot.id;
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          setErrors((current) => ({ ...current, slot: '' }));
                        }}
                        className={`flex items-center justify-between p-3.5 rounded-2xl border text-left nestly-press cursor-pointer ${
                          selected
                            ? 'bg-secondary-container border-emerald-700/30 text-charcoal shadow-2xs font-bold'
                            : 'bg-soft-stone border-hairline hover:bg-stone-card text-charcoal'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold">
                            {formatInspectionTimeRange(slot.starts_at, slot.ends_at)}
                          </div>
                          <div className="text-[10px] text-muted-ink">
                            {slot.spaces_remaining} {slot.spaces_remaining === 1 ? 'place' : 'places'} remaining
                          </div>
                        </div>
                        <Clock className={`w-4 h-4 ${selected ? 'text-primary' : 'text-muted-ink'}`} />
                      </button>
                    );
                  })}
                </div>
                {errors.slot && (
                  <p role="alert" className="text-[11px] text-red-600 mt-2">{errors.slot}</p>
                )}
              </div>

              {/* Contact Information */}
              <div className="pt-6 border-t border-hairline space-y-4">
                <span className="text-[11px] uppercase tracking-widest text-primary font-bold block">
                  Step 2 of 2 · Contact Details
                </span>

                <div data-error-field={Boolean(errors.fullName)}>
                  <label htmlFor="inspect-name" className="block text-xs font-bold text-charcoal mb-1">
                    Full Legal Name *
                  </label>
                  <input
                    id="inspect-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: '' }));
                    }}
                    placeholder="e.g. Osahon Osagie"
                    className={`w-full px-4 py-2.5 rounded-xl border text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all ${
                      errors.fullName ? 'border-red-500 bg-red-50/20' : 'border-hairline'
                    }`}
                  />
                  {errors.fullName && (
                    <p role="alert" className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3" />
                      <span>{errors.fullName}</span>
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div data-error-field={Boolean(errors.phone)}>
                    <label htmlFor="inspect-phone" className="block text-xs font-bold text-charcoal mb-1">
                      Phone Number *
                    </label>
                    <input
                      id="inspect-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
                      }}
                      placeholder="+234 803 000 0000"
                      className={`w-full px-4 py-2.5 rounded-xl border text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all ${
                        errors.phone ? 'border-red-500 bg-red-50/20' : 'border-hairline'
                      }`}
                    />
                    {errors.phone && (
                      <p role="alert" className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        <span>{errors.phone}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="inspect-email" className="block text-xs font-bold text-charcoal mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      id="inspect-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@domain.com"
                      className="w-full px-4 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="inspect-notes" className="block text-xs font-bold text-charcoal mb-1">
                    Specific Questions or Parking Requirements (Optional)
                  </label>
                  <textarea
                    id="inspect-notes"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Arriving with a colleague; please confirm solar inverter battery status..."
                    className="w-full px-4 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-4">
                {(loadError || submitError) && (
                  <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {submitError || loadError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting || isLoading || !property || !selectedSlot}
                  className="w-full py-4 px-6 rounded-full bg-persimmon hover:bg-persimmon-hover disabled:opacity-75 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-md nestly-press cursor-pointer"
                >
                  <span>{isSubmitting ? 'Submitting request…' : 'Request this inspection time'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-[11px] text-center text-muted-ink mt-3">
                  Zero advance booking fees. You only pay standard rent &amp; tenancy fees upon formal agreement signing.
                </p>
              </div>
            </form>
          </div>
        </div>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}

export default function InspectionRequestPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-warm flex items-center justify-center font-bold">Loading inspection booking...</div>}>
      <InspectionRequestContent />
    </Suspense>
  );
}
