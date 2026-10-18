'use client';

import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { prefersReducedMotion } from '@/lib/motion';
import { NIA_TELEGRAM_URL } from '@/lib/contact-channels';
import { getPendingFormSubmission, isLeadSubmissionReceipt, type PendingFormSubmission } from '@/lib/public-form-submission';
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Send,
  Building,
  RotateCcw,
  Loader2,
} from 'lucide-react';

export default function ContactPage() {
  const [category, setCategory] = useState<'General Inquiry' | 'Property Inspection' | 'Landlord Listing' | 'Partnership'>('General Inquiry');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const pendingSubmissionRef = useRef<PendingFormSubmission | null>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-contact-enter]',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.065, ease: 'power2.out', clearProps: 'all' }
      );
    },
    { scope: mainRef }
  );

  useEffect(() => {
    if (submitted && successRef.current && !prefersReducedMotion()) {
      gsap.fromTo(
        successRef.current,
        { opacity: 0, scale: 0.96, y: 12 },
        { opacity: 1, scale: 1, y: 0, duration: 0.34, ease: 'power3.out', clearProps: 'all' }
      );
    }
  }, [submitted]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const newErrors: Record<string, string> = {};

    if (!fullName.trim()) newErrors.fullName = 'Please enter your full name';
    if (!phone.trim()) newErrors.phone = 'Please provide a valid phone number';
    if (!message.trim()) newErrors.message = 'Please provide your message';

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
      const payload = {
        name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        message: `[${category}] ${message.trim()}`,
      };
      const pendingSubmission = getPendingFormSubmission(pendingSubmissionRef.current, payload);
      pendingSubmissionRef.current = pendingSubmission;
      const response = await fetch('/api/leads/contact', {
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
          : 'The server did not confirm receipt. Please retry your inquiry.';
        throw new Error(errorMessage);
      }

      pendingSubmissionRef.current = null;
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit inquiry at this time.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    pendingSubmissionRef.current = null;
    setSubmitted(false);
    setFullName('');
    setPhone('');
    setEmail('');
    setMessage('');
    setErrors({});
    setSubmitError('');
  };

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="flex-1 max-w-[1240px] mx-auto w-full px-4 sm:px-8 py-10 sm:py-16">
        {/* Header */}
        <div data-contact-enter className="max-w-3xl mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-muted-ink mb-3">
            <span className="w-2 h-2 rounded-full bg-persimmon"></span>
            <span>Support &amp; Inquiries</span>
          </div>

          <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.06] mb-3">
            We are here to help you settle in.
          </h1>

          <p className="text-sm sm:text-base text-muted-ink leading-relaxed max-w-2xl font-normal">
            Have questions about an existing listing, neighborhood access in Benin City, or submitting a compound for review? Use the inquiry form below; it confirms receipt only.
          </p>
        </div>

        {/* Main Grid: Left Direct Channels, Right Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Column (5 Cols) */}
          <div data-contact-enter className="lg:col-span-5 space-y-6">
            {/* Category Pills */}
            <div className="flex flex-wrap gap-2">
              {(['General Inquiry', 'Property Inspection', 'Landlord Listing', 'Partnership'] as const).map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(cat)}
                    className={`px-4 py-2 rounded-full text-xs font-bold nestly-press cursor-pointer ${
                      active
                        ? 'bg-primary text-white shadow-xs'
                        : 'bg-soft-stone text-charcoal hover:bg-stone-card border border-hairline'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>

            {/* Nia Assistant Card */}
            <div className="bg-soft-stone rounded-3xl p-6 sm:p-7 border border-hairline space-y-4">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-hairline text-emerald-600 flex items-center justify-center font-bold">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-charcoal">Nia Assistant</h3>
                    <p className="text-[11px] text-muted-ink">Questions about public listings</p>
                  </div>
              </div>

              <p className="text-xs text-muted-ink leading-relaxed">
                Ask Nia using the site chat. Answers are limited to information available from published listings.
              </p>

              <button
                type="button"
                onClick={() => setIsNiaOpen(true)}
                className="w-full py-3 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm nestly-press cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open website chat</span>
              </button>
              <a
                href={NIA_TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 px-4 rounded-full bg-white hover:bg-warm text-charcoal text-xs font-bold text-center border border-hairline transition-colors"
              >
                Message Nia on Telegram ↗
              </a>
            </div>

            {/* Contact Information Availability */}
            <div className="bg-white rounded-3xl p-6 border border-hairline shadow-2xs space-y-4 text-xs">
              <h3 className="font-headline text-base font-bold text-charcoal flex items-center gap-2">
                <Building className="w-4 h-4 text-primary" />
                <span>Office Contact Information</span>
              </h3>
              <p className="p-3.5 rounded-2xl bg-soft-stone border border-hairline text-muted-ink">
                A verified office address and support schedule are not available on this page.
              </p>
            </div>
          </div>

          {/* Right Column: Interactive Form (7 Cols) */}
          <div data-contact-enter className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-10 border border-hairline shadow-sm">
            {submitted ? (
              /* Success State */
              <div ref={successRef} className="text-center py-10 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="font-headline text-2xl font-bold text-charcoal">
                  Inquiry Received
                </h3>
                <p className="text-xs sm:text-sm text-muted-ink max-w-md mx-auto leading-relaxed">
                  Your inquiry about <span className="font-bold text-charcoal">{category}</span> has been recorded. This confirms receipt only; it does not confirm an assigned officer or response time.
                </p>
                <div className="pt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal text-xs font-bold nestly-press cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Send another inquiry</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Form */
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-6" noValidate>
                <div>
                  <span className="text-[11px] uppercase tracking-widest text-primary font-bold block mb-1">
                    Direct Contact Form
                  </span>
                  <h2 className="font-headline text-2xl font-bold text-charcoal">
                    Send a Message to Operations
                  </h2>
                  <p className="text-xs text-muted-ink mt-1">
                    Categorized as: <span className="font-bold text-charcoal">{category}</span>
                  </p>
                </div>

                <div data-invalid-field={Boolean(errors.fullName)}>
                  <label htmlFor="contact-name" className="block text-xs font-bold text-charcoal mb-1">
                    Your Full Name *
                  </label>
                  <input
                    id="contact-name"
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
                  <div data-invalid-field={Boolean(errors.phone)}>
                    <label htmlFor="contact-phone" className="block text-xs font-bold text-charcoal mb-1">
                      Phone Number *
                    </label>
                    <input
                      id="contact-phone"
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
                    <label htmlFor="contact-email" className="block text-xs font-bold text-charcoal mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.invalid"
                      className="w-full px-4 py-2.5 rounded-xl border border-hairline text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all"
                    />
                  </div>
                </div>

                <div data-invalid-field={Boolean(errors.message)}>
                  <label htmlFor="contact-message" className="block text-xs font-bold text-charcoal mb-1">
                    Your Message or Listing Reference *
                  </label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      if (errors.message) setErrors((prev) => ({ ...prev, message: '' }));
                    }}
                    placeholder="Describe your inquiry, property location, or specific requirements..."
                    className={`w-full px-4 py-2.5 rounded-xl border text-xs text-charcoal bg-white focus:outline-none focus:ring-2 focus:ring-charcoal/20 transition-all ${
                      errors.message ? 'border-red-500 bg-red-50/20' : 'border-hairline'
                    }`}
                  />
                  {errors.message && (
                    <p role="alert" className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-medium">
                      <AlertCircle className="w-3 h-3" />
                      <span>{errors.message}</span>
                    </p>
                  )}
                </div>

                {submitError && (
                  <div role="alert" className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{submitError}</span>
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 px-6 rounded-full bg-persimmon hover:bg-persimmon-hover disabled:opacity-60 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-md nestly-press cursor-pointer transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                        <span>Submitting Inquiry...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 shrink-0" />
                        <span>Submit Inquiry</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-center text-muted-ink mt-3">
                    Submission confirms database receipt only; staff assignment and response timing are not confirmed.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
