'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { prefersReducedMotion } from '@/lib/motion';
import {
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Upload,
  ArrowRight,
  X,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';

const SAMPLE_UPLOAD_PREVIEWS = [
  { id: 'sample-1', label: 'Compound Exterior (Daylight)', src: '/images/generated/img_790f21b75f6c4829b0e7c145c8ca6112.png' },
  { id: 'sample-2', label: 'Living Area & Natural Light', src: '/images/generated/img_182f9d8fffd242df93d3c53e9b4abbc0.png' },
  { id: 'sample-3', label: 'Balcony & Meter Box', src: '/images/generated/img_b16cbd4db4884a038e93243e9b975b81.png' },
];

export default function SubmitPropertyPage() {
  const [activeStep, setActiveStep] = useState(1);
  const [propertyTitle, setPropertyTitle] = useState('');
  const [propertyType, setPropertyType] = useState('Apartment');
  const [state, setState] = useState('Edo');
  const [city, setCity] = useState('Benin City');
  const [neighborhood, setNeighborhood] = useState('GRA Benin City');
  const [address, setAddress] = useState('');
  const [rent, setRent] = useState('');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('2');
  const [powerType, setPowerType] = useState('Dedicated Transformer');
  const [waterType, setWaterType] = useState('Industrial Borehole');
  const [titleType, setTitleType] = useState('Certificate of Occupancy (C-of-O)');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState<Array<{ id: string; label: string; src: string }>>([
    SAMPLE_UPLOAD_PREVIEWS[0],
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const sec1Ref = useRef<HTMLDivElement>(null);
  const sec2Ref = useRef<HTMLDivElement>(null);
  const sec3Ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-submit-enter]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef }
  );

  useEffect(() => {
    if (submitted && successRef.current && !prefersReducedMotion()) {
      gsap.fromTo(
        successRef.current,
        { opacity: 0, scale: 0.96, y: 14 },
        { opacity: 1, scale: 1, y: 0, duration: 0.38, ease: 'power3.out', clearProps: 'all' }
      );
    }
  }, [submitted]);

  const handleStepSelect = (stepNum: number) => {
    setActiveStep(stepNum);
    const targetRef = stepNum === 1 ? sec1Ref : stepNum === 2 ? sec2Ref : sec3Ref;
    if (targetRef.current) {
      targetRef.current.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
      });
    }
  };

  const handleAddSamplePhoto = () => {
    const nextSample = SAMPLE_UPLOAD_PREVIEWS.find(
      (s) => !uploadedPhotos.some((u) => u.id === s.id)
    ) || {
      id: `sample-${Date.now()}`,
      label: `Daylight Interior #${uploadedPhotos.length + 1}`,
      src: '/images/generated/img_0c79e160286544189f5f68168d230479.png',
    };
    setUploadedPhotos((prev) => [...prev, nextSample]);
  };

  const handleRemovePhoto = (id: string) => {
    setUploadedPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const newErrors: Record<string, string> = {};

    if (!propertyTitle.trim()) newErrors.propertyTitle = 'Please enter a property title';
    if (!address.trim()) newErrors.address = 'Please specify the compound address';
    if (!rent.trim()) newErrors.rent = 'Please state the annual rent expected';
    if (!ownerName.trim()) newErrors.ownerName = 'Please provide the owner or estate manager name';
    if (!phone.trim()) newErrors.phone = 'Please provide a valid phone or WhatsApp number';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (!prefersReducedMotion() && formRef.current) {
        const invalidNodes = formRef.current.querySelectorAll('[data-invalid-field="true"]');
        if (invalidNodes.length > 0) {
          gsap.fromTo(
            invalidNodes,
            { x: -6 },
            { x: 0, duration: 0.32, ease: 'elastic.out(2, 0.25)', clearProps: 'transform' }
          );
        }
      }
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const numericRent = Number(rent.replace(/[^0-9]/g, '')) || 0;
      const numericBeds = Math.min(30, Math.max(0, parseInt(bedrooms, 10) || 1));

      const response = await fetch('/api/leads/landlord', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          name: ownerName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          propertyType,
          state,
          city,
          neighborhood: neighborhood.trim() || city,
          address: address.trim(),
          bedrooms: numericBeds,
          expectedAnnualRent: numericRent,
          description: `[${propertyTitle.trim()}] Type: ${propertyType}, Power: ${powerType}, Water: ${waterType}, Title: ${titleType}.`,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Unable to submit property particulars. Please try again.');
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit property particulars.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setPropertyTitle('');
    setAddress('');
    setRent('');
    setOwnerName('');
    setPhone('');
    setEmail('');
    setErrors({});
    setSubmitError('');
  };

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 w-full">
        {/* Hero Section */}
        <section className="bg-soft-stone/70 border-b border-hairline py-12 sm:py-20 px-4 sm:px-8">
          <div className="max-w-[1240px] mx-auto">
            <div data-submit-enter className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
              <div className="lg:col-span-8 space-y-3">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary text-white text-xs font-bold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Property Owner Onboarding</span>
                </div>

                <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.06]">
                  List your home with transparent terms.
                </h1>

                <p className="text-sm sm:text-base text-muted-ink max-w-2xl leading-relaxed font-normal">
                  We partner with landlords in Benin City and Delta State who value clear pricing and vetted tenants. Every property undergoes physical field verification before publishing.
                </p>
              </div>

              <div className="lg:col-span-4 flex lg:justify-end">
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-hairline shadow-2xs flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-secondary-container text-primary flex items-center justify-center font-bold">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-xs sm:text-sm text-charcoal">100% In-Person Audited</p>
                    <p className="text-[11px] text-muted-ink">Zero phantom listings permitted</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Interactive Step Indicator Pills */}
            <div data-submit-enter className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-12">
              {[
                { num: 1, label: 'Step 1', title: 'Details & Location' },
                { num: 2, label: 'Step 2', title: 'Utilities & Specs' },
                { num: 3, label: 'Step 3', title: 'Physical Verification' },
              ].map((st) => {
                const isActive = activeStep === st.num;
                return (
                  <button
                    key={st.num}
                    type="button"
                    onClick={() => handleStepSelect(st.num)}
                    className={`flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl border text-left transition-all nestly-press cursor-pointer ${
                      isActive
                        ? 'bg-white border-persimmon shadow-sm ring-1 ring-persimmon/20'
                        : 'bg-white/80 border-hairline hover:bg-white shadow-2xs'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                        isActive ? 'bg-persimmon text-white' : 'bg-primary text-white'
                      }`}
                    >
                      {st.num}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">{st.label}</p>
                      <p className="text-xs sm:text-sm font-bold text-charcoal truncate">{st.title}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Form Body Section */}
        <section data-submit-enter className="max-w-[1000px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <div className="bg-white rounded-3xl p-6 sm:p-12 border border-hairline shadow-sm">
            {submitted ? (
              /* Success Submission State */
              <div ref={successRef} className="text-center py-10 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="font-headline text-2xl sm:text-3xl font-extrabold text-charcoal">
                  Property Submission Received
                </h2>
                <p className="text-xs sm:text-sm text-muted-ink max-w-md mx-auto leading-relaxed">
                  Thank you, <span className="font-bold text-charcoal">{ownerName}</span>. Your listing for <span className="font-bold text-charcoal">{propertyTitle}</span> ({city}) has been received. Our operations desk and field vetting team will review the particulars and contact you to schedule the daylight physical audit.
                </p>
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-6 py-2.5 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal text-xs font-bold nestly-press cursor-pointer"
                  >
                    Submit another property
                  </button>
                  <Link
                    href="/browse"
                    className="px-6 py-2.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold nestly-press"
                  >
                    View existing listings
                  </Link>
                </div>
              </div>
            ) : (
              /* Form */
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-8" noValidate>
                {/* Section 1: Property Particulars */}
                <div ref={sec1Ref} onFocus={() => setActiveStep(1)} className="space-y-4">
                  <h3 className="font-headline text-xl font-bold text-charcoal pb-2 border-b border-hairline">
                    1. Property Particulars &amp; Location
                  </h3>

                  <div data-invalid-field={Boolean(errors.propertyTitle)}>
                    <label htmlFor="sub-title" className="block text-xs font-bold text-charcoal mb-1">
                      Listing Title *
                    </label>
                    <input
                      id="sub-title"
                      type="text"
                      value={propertyTitle}
                      onChange={(e) => {
                        setPropertyTitle(e.target.value);
                        if (errors.propertyTitle) setErrors((prev) => ({ ...prev, propertyTitle: '' }));
                      }}
                      placeholder="e.g. Modern 3-Bedroom Serviced Apartment in GRA"
                      className={`w-full px-4 py-2.5 rounded-xl border text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all ${
                        errors.propertyTitle ? 'border-red-500 bg-red-50/20' : 'border-hairline'
                      }`}
                    />
                    {errors.propertyTitle && (
                      <p role="alert" className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        <span>{errors.propertyTitle}</span>
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="sub-type" className="block text-xs font-bold text-charcoal mb-1">
                        Property Type
                      </label>
                      <select
                        id="sub-type"
                        value={propertyType}
                        onChange={(e) => setPropertyType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="Apartment">Apartment</option>
                        <option value="Self-Contained">Self-Contained / Mini Flat</option>
                        <option value="Terrace Duplex">Terrace Duplex</option>
                        <option value="Detached House">Detached House</option>
                        <option value="Penthouse">Penthouse</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-state" className="block text-xs font-bold text-charcoal mb-1">
                        State
                      </label>
                      <select
                        id="sub-state"
                        value={state}
                        onChange={(e) => {
                          const s = e.target.value;
                          setState(s);
                          setCity(s === 'Edo' ? 'Benin City' : 'Sapele');
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="Edo">Edo State</option>
                        <option value="Delta">Delta State</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-neighborhood" className="block text-xs font-bold text-charcoal mb-1">
                        Neighborhood
                      </label>
                      <input
                        id="sub-neighborhood"
                        type="text"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div data-invalid-field={Boolean(errors.address)}>
                    <label htmlFor="sub-address" className="block text-xs font-bold text-charcoal mb-1">
                      Full Physical Address *
                    </label>
                    <input
                      id="sub-address"
                      type="text"
                      value={address}
                      onChange={(e) => {
                        setAddress(e.target.value);
                        if (errors.address) setErrors((prev) => ({ ...prev, address: '' }));
                      }}
                      placeholder="e.g. 14 Boundary Road, off Ihama Road, GRA, Benin City"
                      className={`w-full px-4 py-2.5 rounded-xl border text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all ${
                        errors.address ? 'border-red-500 bg-red-50/20' : 'border-hairline'
                      }`}
                    />
                    {errors.address && (
                      <p role="alert" className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        <span>{errors.address}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Section 2: Financial Terms & Utilities */}
                <div ref={sec2Ref} onFocus={() => setActiveStep(2)} className="space-y-4 pt-4 border-t border-hairline">
                  <h3 className="font-headline text-xl font-bold text-charcoal pb-2 border-b border-hairline">
                    2. Pricing &amp; Infrastructure
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div data-invalid-field={Boolean(errors.rent)}>
                      <label htmlFor="sub-rent" className="block text-xs font-bold text-charcoal mb-1">
                        Annual Rent (₦) *
                      </label>
                      <input
                        id="sub-rent"
                        type="text"
                        value={rent}
                        onChange={(e) => {
                          setRent(e.target.value);
                          if (errors.rent) setErrors((prev) => ({ ...prev, rent: '' }));
                        }}
                        placeholder="e.g. 2,500,000"
                        className={`w-full px-4 py-2.5 rounded-xl border text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all ${
                          errors.rent ? 'border-red-500 bg-red-50/20' : 'border-hairline'
                        }`}
                      />
                      {errors.rent && (
                        <p role="alert" className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3 h-3" />
                          <span>{errors.rent}</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="sub-beds" className="block text-xs font-bold text-charcoal mb-1">
                        Bedrooms
                      </label>
                      <select
                        id="sub-beds"
                        value={bedrooms}
                        onChange={(e) => setBedrooms(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="1">1 Bedroom</option>
                        <option value="2">2 Bedrooms</option>
                        <option value="3">3 Bedrooms</option>
                        <option value="4">4 Bedrooms</option>
                        <option value="5">5+ Bedrooms</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-baths" className="block text-xs font-bold text-charcoal mb-1">
                        Bathrooms
                      </label>
                      <select
                        id="sub-baths"
                        value={bathrooms}
                        onChange={(e) => setBathrooms(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="1">1 Bathroom</option>
                        <option value="2">2 Bathrooms</option>
                        <option value="3">3 Bathrooms</option>
                        <option value="4">4 Bathrooms</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="sub-power" className="block text-xs font-bold text-charcoal mb-1">
                        Power Setup
                      </label>
                      <select
                        id="sub-power"
                        value={powerType}
                        onChange={(e) => setPowerType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none"
                      >
                        <option value="Dedicated Transformer">Dedicated Community Transformer</option>
                        <option value="Solar Inverter Pre-Cabled">Solar Inverter Pre-Cabled</option>
                        <option value="Standalone Prepaid Meter">Standalone Prepaid BEDC Meter</option>
                        <option value="Central Generator Backup">Central Generator Backup</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-water" className="block text-xs font-bold text-charcoal mb-1">
                        Water Supply
                      </label>
                      <select
                        id="sub-water"
                        value={waterType}
                        onChange={(e) => setWaterType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none"
                      >
                        <option value="Industrial Borehole">Industrial Borehole with Filtration</option>
                        <option value="Deep Well Overhead Tank">Deep Well Overhead Tank</option>
                        <option value="Public Municipal Line">Public Municipal Line</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Ownership, Title & Sample Photos */}
                <div ref={sec3Ref} onFocus={() => setActiveStep(3)} className="space-y-4 pt-4 border-t border-hairline">
                  <h3 className="font-headline text-xl font-bold text-charcoal pb-2 border-b border-hairline">
                    3. Ownership, Title &amp; Daylight Photos
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div data-invalid-field={Boolean(errors.ownerName)}>
                      <label htmlFor="sub-owner" className="block text-xs font-bold text-charcoal mb-1">
                        Owner or Agent Full Name *
                      </label>
                      <input
                        id="sub-owner"
                        type="text"
                        value={ownerName}
                        onChange={(e) => {
                          setOwnerName(e.target.value);
                          if (errors.ownerName) setErrors((prev) => ({ ...prev, ownerName: '' }));
                        }}
                        placeholder="e.g. Barrister K. Omorodion"
                        className={`w-full px-4 py-2.5 rounded-xl border text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all ${
                          errors.ownerName ? 'border-red-500 bg-red-50/20' : 'border-hairline'
                        }`}
                      />
                      {errors.ownerName && (
                        <p role="alert" className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                          <AlertCircle className="w-3 h-3" />
                          <span>{errors.ownerName}</span>
                        </p>
                      )}
                    </div>

                    <div data-invalid-field={Boolean(errors.phone)}>
                      <label htmlFor="sub-phone" className="block text-xs font-bold text-charcoal mb-1">
                        WhatsApp / Phone Number *
                      </label>
                      <input
                        id="sub-phone"
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
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="sub-title-doc" className="block text-xs font-bold text-charcoal mb-1">
                        Physical Title Documentation
                      </label>
                      <select
                        id="sub-title-doc"
                        value={titleType}
                        onChange={(e) => setTitleType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="Certificate of Occupancy (C-of-O)">Certificate of Occupancy (C-of-O)</option>
                        <option value="Deed of Conveyance / Assignment">Deed of Conveyance / Assignment</option>
                        <option value="Registered Survey Plan">Registered Survey Plan</option>
                        <option value="Governor's Consent">Governor&apos;s Consent</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-email" className="block text-xs font-bold text-charcoal mb-1">
                        Owner Email (Optional)
                      </label>
                      <input
                        id="sub-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="owner@example.invalid"
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Interactive Photo Upload Preview */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5 text-persimmon" />
                        <span>Daylight Reference Photos ({uploadedPhotos.length})</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleAddSamplePhoto}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal text-xs font-bold border border-hairline nestly-press cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-persimmon" />
                        <span>Attach Sample Photo</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {uploadedPhotos.map((ph) => (
                        <div
                          key={ph.id}
                          className="relative rounded-2xl overflow-hidden border border-hairline bg-soft-stone h-28 group"
                        >
                          <img src={ph.src} alt={ph.label} className="w-full h-full object-cover" />
                          <div className="absolute inset-x-0 bottom-0 bg-charcoal/75 text-white text-[10px] font-medium px-2.5 py-1 truncate">
                            {ph.label}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePhoto(ph.id)}
                            aria-label={`Remove ${ph.label}`}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-charcoal/80 hover:bg-red-600 text-white flex items-center justify-center cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div role="alert" className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 px-6 rounded-full bg-persimmon hover:bg-persimmon-hover disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md nestly-press cursor-pointer transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Submitting for Field Verification...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Property for Field Verification</span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-center text-muted-ink mt-3">
                    Every listing is physically visited by an authorized Nestly officer before appearance on the platform.
                  </p>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
