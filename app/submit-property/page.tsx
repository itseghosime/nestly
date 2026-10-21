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
  ArrowRight,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';
import { clearBrowserPendingFormSubmission, getPendingFormSubmission, isLeadSubmissionReceipt, parseExpectedAnnualRent } from '@/lib/public-form-submission';

const PENDING_SUBMISSION_STORAGE_KEY = 'nestly:landlord-submission:v1';
const MAX_PHOTO_COUNT = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export default function SubmitPropertyPage() {
  const [activeStep, setActiveStep] = useState(1);
  const [propertyTitle, setPropertyTitle] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [address, setAddress] = useState('');
  const [rent, setRent] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [powerType, setPowerType] = useState('');
  const [waterType, setWaterType] = useState('');
  const [titleType, setTitleType] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [photoUploadInProgress, setPhotoUploadInProgress] = useState(false);
  const [photosUploaded, setPhotosUploaded] = useState(false);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
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

  const uploadPhotos = async (key: string, selectedPhotos: File[]) => {
    if (selectedPhotos.length === 0) return true;
    setPhotoUploadInProgress(true);
    setSubmitError('');
    try {
      const form = new FormData();
      selectedPhotos.forEach((file) => form.append('photos', file));
      const response = await fetch('/api/leads/landlord/media', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: form,
      });
      const result: unknown = await response.json().catch(() => null);
      if (
        !response.ok
        || !result
        || typeof result !== 'object'
        || !('uploaded' in result)
        || typeof result.uploaded !== 'number'
      ) {
        const errorMessage = result && typeof result === 'object'
          && 'error' in result && typeof result.error === 'string'
          ? result.error
          : 'The server could not confirm photo storage.';
        throw new Error(errorMessage);
      }
      setPhotosUploaded(true);
      setPhotos([]);
      setSubmissionKey(null);
      if (!clearBrowserPendingFormSubmission(PENDING_SUBMISSION_STORAGE_KEY)) {
        setSubmitError('Photos are stored privately, but this browser could not clear its retry key.');
      }
      return true;
    } catch (uploadError) {
      setSubmitError(`Submission receipt is confirmed, but photos are not confirmed. ${uploadError instanceof Error ? uploadError.message : 'Retry the photo upload.'}`);
      return false;
    } finally {
      setPhotoUploadInProgress(false);
    }
  };

  const handlePhotoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    const totalBytes = selected.reduce((total, file) => total + file.size, 0);
    const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
    const invalid = selected.length > MAX_PHOTO_COUNT
      || selected.some((file) => !supportedTypes.includes(file.type) || file.size < 1 || file.size > MAX_PHOTO_BYTES)
      || totalBytes > MAX_PHOTO_BYTES;
    if (invalid) {
      setPhotoError('Choose up to five JPEG, PNG, WebP, or AVIF photos with a combined size no greater than 4MB.');
      event.target.value = '';
      setPhotos([]);
      return;
    }
    setPhotos(selected);
    setPhotoError('');
    setSubmitError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (photoError) return;
    const newErrors: Record<string, string> = {};

    if (!propertyType || !state || !city.trim() || !neighborhood.trim() || !bedrooms || !bathrooms) {
      setSubmitError('Select the property type and complete its location and room details before submitting.');
      return;
    }
    if (!propertyTitle.trim()) newErrors.propertyTitle = 'Please enter a property title';
    if (!address.trim()) newErrors.address = 'Please specify the compound address';
    const expectedAnnualRent = parseExpectedAnnualRent(rent);
    if (expectedAnnualRent === null) {
      newErrors.rent = rent.trim()
        ? 'Enter a valid annual rent amount with up to two decimal places.'
        : 'Please state the annual rent expected';
    }
    if (!ownerName.trim()) newErrors.ownerName = 'Please provide the owner or estate manager name';
    if (!phone.trim()) newErrors.phone = 'Please provide a valid phone number';

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

    if (expectedAnnualRent === null) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      const numericBeds = Number.parseInt(bedrooms, 10);
      const numericBathrooms = Number.parseInt(bathrooms, 10);
      const payload = {
        name: ownerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        propertyType,
        state,
        city: city.trim(),
        neighborhood: neighborhood.trim(),
        address: address.trim(),
        bedrooms: numericBeds,
        expectedAnnualRent,
        description: [
          `Property title: ${propertyTitle.trim()}`,
          `Bathrooms: ${numericBathrooms}`,
          powerType ? `Reported power setup: ${powerType}` : '',
          waterType ? `Reported water supply: ${waterType}` : '',
          titleType ? `Reported title document type: ${titleType}` : '',
        ].filter(Boolean).join('. '),
      };
      const pendingSubmission = await getPendingFormSubmission(
        window.sessionStorage,
        PENDING_SUBMISSION_STORAGE_KEY,
        payload,
      );

      const response = await fetch('/api/leads/landlord', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': pendingSubmission.key,
        },
        body: JSON.stringify(payload),
      });

      const result: unknown = await response.json().catch(() => null);
      if (!response.ok || !isLeadSubmissionReceipt(response.status, result)) {
        const errorMessage = result && typeof result === 'object'
          && 'error' in result && typeof result.error === 'string'
          ? result.error
          : 'The server did not confirm receipt. Please retry your property submission.';
        throw new Error(errorMessage);
      }

      setSubmitted(true);
      setSubmissionKey(pendingSubmission.key);
      if (photos.length > 0) {
        await uploadPhotos(pendingSubmission.key, photos);
      } else {
        const retryStateCleared = clearBrowserPendingFormSubmission(PENDING_SUBMISSION_STORAGE_KEY);
        setSubmissionKey(null);
        if (!retryStateCleared) {
          setSubmitError('Receipt was confirmed, but this browser could not clear its retry key. Avoid resetting this submission until session storage is available.');
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit property particulars.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    const retryStateCleared = clearBrowserPendingFormSubmission(PENDING_SUBMISSION_STORAGE_KEY);
    setSubmitted(false);
    setPropertyTitle('');
    setPropertyType('');
    setState('');
    setCity('');
    setNeighborhood('');
    setAddress('');
    setRent('');
    setBedrooms('');
    setBathrooms('');
    setPowerType('');
    setWaterType('');
    setTitleType('');
    setOwnerName('');
    setPhone('');
    setEmail('');
    setPhotos([]);
    setPhotoError('');
    setPhotoUploadInProgress(false);
    setPhotosUploaded(false);
    setSubmissionKey(null);
    setActiveStep(1);
    setErrors({});
    setSubmitError(retryStateCleared ? '' : 'The previous receipt was confirmed, but this browser could not clear its retry key. A matching submission will reuse that key.');
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
                  Property owners can submit listing details for review. Details remain owner-reported until reviewed; this form does not verify title, condition, availability, or publication.
                </p>
              </div>

              <div className="lg:col-span-4 flex lg:justify-end">
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-hairline shadow-2xs flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-secondary-container text-primary flex items-center justify-center font-bold">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-bold text-xs sm:text-sm text-charcoal">Submission for Review</p>
                    <p className="text-[11px] text-muted-ink">Submitting does not publish a listing</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Interactive Step Indicator Pills */}
            <div data-submit-enter className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-12">
              {[
                { num: 1, label: 'Step 1', title: 'Details & Location' },
                { num: 2, label: 'Step 2', title: 'Utilities & Specs' },
                { num: 3, label: 'Step 3', title: 'Ownership & Reported Details' },
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
                  The server recorded your property submission for <span className="font-bold text-charcoal">{propertyTitle}</span> ({city}). Receipt does not mean the property is accepted, vetted, or published.
                </p>
                {photoUploadInProgress && (
                  <p role="status" className="text-xs text-muted-ink">Uploading selected photos to private review storage…</p>
                )}
                {photosUploaded && (
                  <p role="status" className="text-xs text-emerald-800">
                    Photos are stored privately as review evidence; they are not public listing images.
                  </p>
                )}
                {submissionKey && photos.length > 0 && (
                  <div className="mx-auto max-w-md space-y-2">
                    <p className="text-xs text-muted-ink">
                      Retry photo storage with the same submission and unchanged files. Uploads are limited to five photos and 4MB total.
                    </p>
                    <button
                      type="button"
                      onClick={() => void uploadPhotos(submissionKey, photos)}
                      disabled={photoUploadInProgress}
                      className="px-6 py-2.5 rounded-full bg-charcoal text-white text-xs font-bold disabled:opacity-50"
                    >
                      {photoUploadInProgress ? 'Uploading photos…' : 'Retry photo upload'}
                    </button>
                  </div>
                )}
                {!photosUploaded && !photoUploadInProgress && photos.length === 0 && (
                  <p className="text-xs text-muted-ink">No photos were attached to this submission.</p>
                )}
                {submitError && <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl p-3 max-w-md mx-auto">{submitError}</p>}
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={photoUploadInProgress}
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="sub-type" className="block text-xs font-bold text-charcoal mb-1">
                        Property Type *
                      </label>
                      <select
                        id="sub-type"
                        required
                        value={propertyType}
                        onChange={(e) => setPropertyType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="">Select property type</option>
                        <option value="Apartment">Apartment</option>
                        <option value="Self-Contained">Self-Contained / Mini Flat</option>
                        <option value="Terrace Duplex">Terrace Duplex</option>
                        <option value="Detached House">Detached House</option>
                        <option value="Penthouse">Penthouse</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-state" className="block text-xs font-bold text-charcoal mb-1">
                        State *
                      </label>
                      <select
                        id="sub-state"
                        required
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="">Select state</option>
                        <option value="Edo">Edo State</option>
                        <option value="Delta">Delta State</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-city" className="block text-xs font-bold text-charcoal mb-1">
                        City *
                      </label>
                      <input
                        id="sub-city"
                        type="text"
                        required
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="sub-neighborhood" className="block text-xs font-bold text-charcoal mb-1">
                        Neighborhood *
                      </label>
                      <input
                        id="sub-neighborhood"
                        type="text"
                        required
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
                        Bedrooms *
                      </label>
                      <select
                        id="sub-beds"
                        required
                        value={bedrooms}
                        onChange={(e) => setBedrooms(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="">Select bedroom count</option>
                        <option value="0">Studio / 0 Bedrooms</option>
                        <option value="1">1 Bedroom</option>
                        <option value="2">2 Bedrooms</option>
                        <option value="3">3 Bedrooms</option>
                        <option value="4">4 Bedrooms</option>
                        <option value="5">5+ Bedrooms</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="sub-baths" className="block text-xs font-bold text-charcoal mb-1">
                        Bathrooms *
                      </label>
                      <select
                        id="sub-baths"
                        required
                        value={bathrooms}
                        onChange={(e) => setBathrooms(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="">Select bathroom count</option>
                        <option value="0">0 Bathrooms</option>
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
                        <option value="">Power setup (optional)</option>
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
                        <option value="">Water supply (optional)</option>
                        <option value="Industrial Borehole">Industrial Borehole with Filtration</option>
                        <option value="Deep Well Overhead Tank">Deep Well Overhead Tank</option>
                        <option value="Public Municipal Line">Public Municipal Line</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 3: Ownership and Property Details */}
                <div ref={sec3Ref} onFocus={() => setActiveStep(3)} className="space-y-4 pt-4 border-t border-hairline">
                  <h3 className="font-headline text-xl font-bold text-charcoal pb-2 border-b border-hairline">
                    3. Ownership &amp; Reported Details
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
                        Phone Number *
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
                        Reported Title Document Type (Optional)
                      </label>
                      <select
                        id="sub-title-doc"
                        value={titleType}
                        onChange={(e) => setTitleType(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl border border-hairline text-xs font-bold text-charcoal bg-white focus:outline-none"
                      >
                        <option value="">Select reported document type</option>
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

                  <div className="pt-2">
                    <div className="rounded-2xl border border-dashed border-hairline bg-soft-stone p-4 flex items-start gap-3">
                      <ImageIcon className="w-4 h-4 text-muted-ink shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <label htmlFor="sub-photos" className="block text-xs font-bold text-charcoal">
                          Property photos (optional)
                        </label>
                        <input
                          id="sub-photos"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          multiple
                          disabled={isSubmitting}
                          onChange={handlePhotoSelect}
                          className="mt-2 block w-full text-xs text-charcoal file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-xs file:font-semibold file:text-charcoal"
                        />
                        <p className="mt-2 text-xs leading-relaxed text-muted-ink">
                          Up to five JPEG, PNG, WebP, or AVIF images; 4MB combined. Photos stay private as review evidence and are not published. Uploading photos does not verify title documents.
                        </p>
                        {photos.length > 0 && (
                          <p className="mt-1 text-xs text-charcoal">{photos.length} photo{photos.length === 1 ? '' : 's'} selected</p>
                        )}
                        {photoError && <p role="alert" className="mt-1 text-xs text-red-700">{photoError}</p>}
                      </div>
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
                        <span>Submitting request...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Property for Review</span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-center text-muted-ink mt-3">
                    Submission confirms receipt only. Review, publication, and verification are not confirmed.
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
