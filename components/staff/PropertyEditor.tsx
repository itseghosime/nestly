'use client';

import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { Property } from '@/lib/types';
import { computeTotal, type FeeRow } from '@/lib/price';
import {
  ArrowLeft,
  CheckCircle2,
  Zap,
  Droplets,
  ShieldCheck,
  AlertTriangle,
  Upload,
  Save,
} from 'lucide-react';

interface PropertyEditorProps {
  initialProperty?: Property;
  isNew?: boolean;
}

type EditorMedia = { id: string; url: string; sort_order: number };
type EditorFee = FeeRow & { id: string };

export function PropertyEditor({ initialProperty, isNew = false }: PropertyEditorProps) {
  const router = useRouter();

  const [title, setTitle] = useState(
    initialProperty?.title || 'The Ivory Gate 3-Bedroom Serviced Terrace'
  );
  const [code, setCode] = useState(initialProperty?.code || initialProperty?.id || 'NST-EDO-006');
  const [propertyType, setPropertyType] = useState<string>(
    initialProperty?.propertyType || 'Apartment'
  );
  const [status, setStatus] = useState(initialProperty?.status || 'Draft');
  const [address, setAddress] = useState(
    initialProperty?.addressShort || initialProperty?.address || 'Boundary Road, Off Ihama'
  );
  const [neighborhood, setNeighborhood] = useState(
    initialProperty?.neighborhood || 'GRA Benin City'
  );
  const [state, setState] = useState<'Edo' | 'Delta'>(initialProperty?.state || 'Edo');
  const [bedrooms, setBedrooms] = useState(initialProperty?.bedrooms || 3);
  const [bathrooms, setBathrooms] = useState(initialProperty?.bathrooms || 3);
  const [pricePerYear, setPricePerYear] = useState(
    initialProperty?.priceAnnual || initialProperty?.pricePerYear || 3500000
  );
  const [powerFeeder, setPowerFeeder] = useState(
    initialProperty?.powerRating || initialProperty?.powerProfile || '20-22 hrs/day (Priority 33kVA Feeder)'
  );
  const [waterSource, setWaterSource] = useState(
    initialProperty?.waterSupply || initialProperty?.waterProfile || 'Dedicated Industrial Borehole + Reverse Osmosis'
  );
  const [landmarks, setLandmarks] = useState(
    initialProperty?.nearbyLandmarks?.join(', ') || initialProperty?.landmarks?.join(', ') || 'Adjacent to Bishop Kelly College, 3 mins from Benin Club'
  );

  const [isSavedToast, setIsSavedToast] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!showDiscardDialog || !dialogRef.current || prefersReducedMotion()) return;
    gsap.fromTo(dialogRef.current, { scale: 0.97, y: 8, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [showDiscardDialog] });
  useGSAP(() => {
    if (!isSavedToast || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [isSavedToast] });

  useEffect(() => {
    if (!showDiscardDialog) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowDiscardDialog(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDiscardDialog]);

  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const propertyId = initialProperty?.id || code;
  const [mediaItems, setMediaItems] = useState<EditorMedia[]>([]);
  const [fees, setFees] = useState<EditorFee[]>([]);
  const [feeKey, setFeeKey] = useState('');
  const [feeKind, setFeeKind] = useState<'fixed' | 'percent'>('fixed');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeBase, setFeeBase] = useState<'rent' | 'subtotal'>('rent');
  const [feeRequired, setFeeRequired] = useState(true);
  const [feeSaving, setFeeSaving] = useState(false);

  const refreshMedia = async () => {
    const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/media`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Unable to load listing media');
    setMediaItems(Array.isArray(body.data) ? body.data : []);
  };

  useEffect(() => {
    if (isNew) return;
    let active = true;
    const loadEditorData = async () => {
      try {
        const [mediaResponse, feeResponse] = await Promise.all([
          fetch(`/api/properties/${encodeURIComponent(propertyId)}/media`, { cache: 'no-store' }),
          fetch(`/api/properties/${encodeURIComponent(propertyId)}/fees`, { cache: 'no-store' }),
        ]);
        const [mediaBody, feeBody] = await Promise.all([
          mediaResponse.json().catch(() => ({})),
          feeResponse.json().catch(() => ({})),
        ]);
        if (!mediaResponse.ok) throw new Error(mediaBody.error || 'Unable to load listing media');
        if (!feeResponse.ok) throw new Error(feeBody.error || 'Unable to load property fees');
        if (!active) return;
        setMediaItems(Array.isArray(mediaBody.data) ? mediaBody.data : []);
        setFees(Array.isArray(feeBody.data) ? feeBody.data : []);
      } catch (error) {
        if (active) setSaveError(error instanceof Error ? error.message : 'Unable to load listing data');
      }
    };
    void loadEditorData();
    return () => { active = false; };
  }, [isNew, propertyId]);

  const saveFee = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(feeAmount);
    if (!feeKey.trim() || !Number.isFinite(amount) || amount < 0) {
      setSaveError('Enter a fee key and a non-negative amount');
      return;
    }
    setFeeSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/fees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fee_key: feeKey.trim(),
          kind: feeKind,
          amount,
          base: feeBase,
          required: feeRequired,
          sort_order: fees.length,
          confirmed_at: null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Fee save failed');
      setFees((current) => [...current, body.data]);
      setFeeKey('');
      setFeeAmount('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Fee save failed');
    } finally {
      setFeeSaving(false);
    }
  };

  const confirmFee = async (fee: EditorFee) => {
    setSaveError(null);
    const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/fees`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: fee.id, confirmed_at: new Date().toISOString() }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSaveError(body.error || 'Fee confirmation failed');
      return;
    }
    setFees((current) => current.map((item) => item.id === fee.id ? body.data : item));
  };
  const handleSave = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setSaving(true);
    setSaveError(null);
    const payload: Record<string, unknown> = {
      title,
      reference: code,
      slug: code.toLowerCase().replace(/\s+/g, '-'),
      rent_annual: pricePerYear,
      state,
      city: neighborhood.includes('Benin') ? 'Benin City' : neighborhood,
      neighborhood,
      address_short: address,
      bedrooms,
      bathrooms,
      power_rating: powerFeeder,
      water_supply: waterSource,
      ...(isNew || status === 'Draft' ? { publication_state: 'draft' } : {}),
      ...(status === 'In Review' ? { publication_state: 'review' } : {}),
      ...(isNew || status === 'Available' ? { rental_availability: 'available' } : {}),
    };
    try {
      const url = isNew ? '/api/properties' : `/api/properties/${encodeURIComponent(propertyId)}`;
      const method = isNew ? 'POST' : 'PATCH';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Save failed');
      setIsSavedToast(true);
      setTimeout(() => {
        setIsSavedToast(false);
        router.push('/staff/properties');
      }, 900);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[
          { label: 'Properties', href: '/staff/properties' },
          { label: isNew ? 'Create Listing' : `Edit: ${code}` },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDiscardDialog(true)}
              className="px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold transition-colors border border-hairline shadow-2xs"
            >
              Discard Changes
            </button>
            {saveError && <span className="text-xs font-bold text-red-600 max-w-[28ch] truncate" title={saveError}>{saveError}</span>}
            <button
              onClick={() => { void handleSave(); }}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-persimmon hover:bg-persimmon-hover disabled:opacity-60 text-white text-xs font-bold transition-all shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving…' : isNew ? 'Save Draft' : 'Save Changes'}</span>
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6 pb-28">
        {/* Navigation & Title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
          <div className="space-y-1">
            <Link
              href="/staff/properties"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-ink hover:text-charcoal mb-2 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Properties List</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold px-2.5 py-0.5 rounded-full bg-soft-stone border border-hairline">
                Intake Form · Edo & Delta
              </span>
              <span className="text-xs text-muted-ink font-mono font-semibold">Ref: {code}</span>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              {isNew ? 'Create Listing Specification' : `Edit Listing: ${title}`}
            </h1>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-ink">
            <span>Auto-saved locally</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Left Form Body (8 cols) */}
          <form id="property-editor-form" onSubmit={handleSave} className="lg:col-span-8 space-y-8">
            {/* Section 1: General Information */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-hairline">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-persimmon/10 text-persimmon flex items-center justify-center font-bold text-xs">
                    01
                  </span>
                  <div>
                    <h2 className="font-headline text-base font-bold text-charcoal">General Information</h2>
                    <p className="text-xs text-charcoal/70">Core taxonomy, listing titles, and administrative indexing</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink bg-soft-stone px-2.5 py-1 rounded-full border border-hairline">
                  Mandatory
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-charcoal flex justify-between">
                    <span>Property Title</span>
                    <span className="text-[11px] text-muted-ink font-normal">Customer facing</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Reference Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full bg-soft-stone rounded-full px-5 py-3 text-xs font-mono font-bold text-charcoal border border-hairline"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Typology</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  >
                    <option>Serviced Terrace</option>
                    <option>Executive Flat</option>
                    <option>Townhouse</option>
                    <option>Detached Villa</option>
                    <option>Self-Contained Studio</option>
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Listing Status Lifecycle</label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 rounded-full bg-soft-stone border border-hairline text-xs font-semibold">
                    {(['Draft', 'In Review', 'Available'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`py-2 px-3 rounded-full text-center transition-all ${
                          status === s
                            ? 'bg-white text-charcoal font-bold shadow-2xs'
                            : 'text-charcoal/70 hover:text-charcoal'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Location & Area */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-hairline">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-persimmon/10 text-persimmon flex items-center justify-center font-bold text-xs">
                    02
                  </span>
                  <div>
                    <h2 className="font-headline text-base font-bold text-charcoal">Location & Area</h2>
                    <p className="text-xs text-charcoal/70">Physical geo-spatial data and surrounding reference points</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink bg-soft-stone px-2.5 py-1 rounded-full border border-hairline">
                  Geocoded
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Street Address</label>
                  <input
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Neighborhood</label>
                  <input
                    type="text"
                    required
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">State / Region</label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value as 'Edo' | 'Delta')}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  >
                    <option value="Edo">Edo State</option>
                    <option value="Delta">Delta State</option>
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Landmarks / Access Details</label>
                  <input
                    type="text"
                    value={landmarks}
                    onChange={(e) => setLandmarks(e.target.value)}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Specifications & Utilities */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-hairline">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-persimmon/10 text-persimmon flex items-center justify-center font-bold text-xs">
                    03
                  </span>
                  <div>
                    <h2 className="font-headline text-base font-bold text-charcoal">Specifications & Utilities</h2>
                    <p className="text-xs text-charcoal/70">Bedroom counts, power schedule, and water verification</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Bedrooms</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={bedrooms}
                    onChange={(e) => setBedrooms(Number(e.target.value))}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Bathrooms</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={bathrooms}
                    onChange={(e) => setBathrooms(Number(e.target.value))}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    <span>Power Feeder Verification Schedule</span>
                  </label>
                  <input
                    type="text"
                    value={powerFeeder}
                    onChange={(e) => setPowerFeeder(e.target.value)}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-primary" />
                    <span>Borehole & Water Treatment Source</span>
                  </label>
                  <input
                    type="text"
                    value={waterSource}
                    onChange={(e) => setWaterSource(e.target.value)}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs text-charcoal border border-hairline focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Transparent Fee Breakdown */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-hairline">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-persimmon/10 text-persimmon flex items-center justify-center font-bold text-xs">
                    04
                  </span>
                  <div>
                    <h2 className="font-headline text-base font-bold text-charcoal">Transparent Pricing Ledger</h2>
                    <p className="text-xs text-charcoal/70">100% itemized fees without hidden agent exploitation</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Annual Rent (NGN)</label>
                  <input
                    type="number"
                    step={50000}
                    value={pricePerYear}
                    onChange={(e) => setPricePerYear(Number(e.target.value))}
                    className="w-full bg-warm rounded-full px-5 py-3 text-xs font-bold text-persimmon border border-hairline focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-charcoal">Legal & Agreement (5%)</label>
                  <input
                    type="text"
                    readOnly
                    value={`₦${(pricePerYear * 0.05).toLocaleString()}`}
                    className="w-full bg-soft-stone rounded-full px-5 py-3 text-xs font-mono text-muted-ink border border-hairline"
                  />
                </div>
              </div>
            </div>
          </form>

          {/* Right Sidebar: Photo Upload & Vetting Dossier (4 cols) */}
          <div className="lg:col-span-4 space-y-6 sticky top-24">
            {/* Photography Panel */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Verified Photographic Assets
              </span>
              <div className="rounded-2xl overflow-hidden aspect-[16/10] bg-soft-stone relative border border-hairline">
                <img
                  src={initialProperty?.featuredImage || initialProperty?.images?.[0] || '/images/hero-home.png'}
                  alt="Property preview"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="p-4 rounded-2xl bg-soft-stone border border-hairline text-center space-y-2">
                <Upload className="w-5 h-5 text-muted-ink mx-auto" />
                <p className="text-xs text-charcoal/80 font-semibold">
                  Field Agent GPS Camera Upload
                </p>
                <p className="text-[11px] text-muted-ink leading-relaxed">
                  Only geotagged photos taken during daylight inspection hours (10:00 - 17:00 WAT) are approved for public listing.
                </p>
              </div>
            </div>

            {/* Statutory Title Verification */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Statutory Title Cadastre
              </span>
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>EDOGIS Cadastre Verification</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Certificate of Occupancy (C-of-O) and title registry records are cross-referenced with state land files prior to listing approval.
                </p>
              </div>
            </div>
            {/* Media: upload / reorder / delete (private bucket, signed URLs) */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">Listing Media (private until published)</span>
                <span className="text-[10px] text-muted-ink">Draft images require signed URL</span>
              </div>
              <div className="space-y-2">
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={isNew} onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  for (const file of files) {
                    if (file.size > 5 * 1024 * 1024) { setSaveError('Image exceeds 5MB'); continue; }
                    const fd = new FormData();
                    fd.append('file', file);
                    try {
                      const up = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/media/upload`, { method: 'POST', body: fd });
                      const body = await up.json().catch(() => ({}));
                      if (!up.ok) throw new Error(body.error || 'Upload failed');
                    } catch (error) {
                      setSaveError(error instanceof Error ? error.message : 'Upload failed');
                    }
                  }
                  try {
                    await refreshMedia();
                  } catch (error) {
                    setSaveError(error instanceof Error ? error.message : 'Unable to refresh listing media');
                  }
                  e.target.value = '';
                }} className="block w-full text-xs" />
                {isNew && <p className="text-[11px] text-muted-ink">Save the property draft before uploading media.</p>}
                <div className="flex flex-wrap gap-2">
                  {mediaItems.map((media) => (
                    <div key={media.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-hairline">
                      <img src={media.url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={async () => {
                        const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/media`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: media.id, deleted_at: new Date().toISOString() }),
                        });
                        const body = await response.json().catch(() => ({}));
                        if (!response.ok) {
                          setSaveError(body.error || 'Delete failed');
                          return;
                        }
                        setMediaItems((current) => current.filter((item) => item.id !== media.id));
                      }} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-[11px]">×</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={async () => {
                    try {
                      const reordered = [...mediaItems].reverse();
                      for (const [index, item] of reordered.entries()) {
                        const response = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/media`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: item.id, sort_order: index }),
                        });
                        if (!response.ok) throw new Error('Unable to reorder listing media');
                      }
                      setMediaItems(reordered.map((item, index) => ({ ...item, sort_order: index })));
                    } catch (error) {
                      setSaveError(error instanceof Error ? error.message : 'Unable to reorder listing media');
                    }
                  }} disabled={mediaItems.length < 2} className="text-xs font-bold text-charcoal underline disabled:opacity-50">Reverse gallery order</button>
                </div>
              </div>
            </div>

            {/* Fees: per-listing ledger, explicit base, required+confirmed_at */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">Fees (per-listing, explicit base)</span>
                <span className="text-[10px] text-muted-ink">Total null when required unconfirmed</span>
              </div>
              <div className="space-y-2 text-xs">
                {fees.map((fee) => (
                  <div key={fee.id} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-soft-stone border border-hairline">
                    <span className="font-mono font-bold">{fee.fee_key}</span>
                    <span>{fee.kind} {fee.amount}{fee.kind === 'percent' ? '%' : ''} · base {fee.base}</span>
                    {fee.confirmed_at
                      ? <span className="font-bold text-emerald-700">Confirmed</span>
                      : <button type="button" onClick={() => void confirmFee(fee)} className="px-2 py-1 rounded-full bg-charcoal text-white text-[11px]">Confirm fee</button>}
                  </div>
                ))}
                <form onSubmit={saveFee} className="grid grid-cols-2 gap-2 border-t border-hairline pt-3">
                  <input value={feeKey} onChange={(event) => setFeeKey(event.target.value)} placeholder="Fee key" aria-label="Fee key" className="rounded-lg border border-hairline px-2 py-1.5" required disabled={isNew || feeSaving} />
                  <input value={feeAmount} onChange={(event) => setFeeAmount(event.target.value)} placeholder="Amount" aria-label="Fee amount" type="number" min="0" step="0.01" className="rounded-lg border border-hairline px-2 py-1.5" required disabled={isNew || feeSaving} />
                  <select value={feeKind} onChange={(event) => setFeeKind(event.target.value as 'fixed' | 'percent')} aria-label="Fee type" className="rounded-lg border border-hairline px-2 py-1.5" disabled={isNew || feeSaving}>
                    <option value="fixed">Fixed amount</option>
                    <option value="percent">Percentage</option>
                  </select>
                  <select value={feeBase} onChange={(event) => setFeeBase(event.target.value as 'rent' | 'subtotal')} aria-label="Fee basis" className="rounded-lg border border-hairline px-2 py-1.5" disabled={isNew || feeSaving}>
                    <option value="rent">Based on rent</option>
                    <option value="subtotal">Based on subtotal</option>
                  </select>
                  <label className="col-span-2 flex items-center gap-2">
                    <input type="checkbox" checked={feeRequired} onChange={(event) => setFeeRequired(event.target.checked)} disabled={isNew || feeSaving} />
                    Required charge
                  </label>
                  <button type="submit" disabled={isNew || feeSaving} className="col-span-2 rounded-full bg-charcoal px-3 py-2 text-white disabled:opacity-50">
                    {feeSaving ? 'Saving fee…' : 'Add unconfirmed fee'}
                  </button>
                </form>
                <p className="text-[11px] text-muted-ink">
                  {isNew
                    ? 'Save the property draft before adding fees.'
                    : `Move-in total: ${computeTotal(pricePerYear, fees) == null ? `${fees.length ? fees.filter((fee) => fee.required && !fee.confirmed_at).length : 1} fee detail(s) pending verification` : computeTotal(pricePerYear, fees)?.toLocaleString('en-NG')}`}
                </p>
              </div>
            </div>


            {/* Action Bar */}
            <div className="pt-2">
              <button
                type="submit"
                form="property-editor-form"
                className="w-full py-3.5 px-6 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold tracking-wide transition-all shadow-xs"
              >
                {isNew ? 'Save Property Draft' : 'Update Listing Records'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Discard confirmation modal */}
      {showDiscardDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved Changes Alert"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={() => setShowDiscardDialog(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />
          <div ref={dialogRef} className="relative z-10 bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-hairline space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-headline text-lg font-bold text-charcoal">Unsaved Changes Alert</h3>
            </div>
            <p className="text-xs text-charcoal/70 leading-relaxed">
              You have modified listing parameters for <strong>{code}</strong>. Discarding will revert to the last auto-saved version in your local workstation cache.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardDialog(false)}
                className="min-h-[36px] px-4 py-2 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold shrink-0 transition-colors"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => router.push('/staff/properties')}
                className="min-h-[36px] px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold shrink-0 transition-colors"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success notification */}
      {isSavedToast && (
        <div ref={toastRef} className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-bold animate-in slide-in-from-bottom duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Listing specifications saved successfully!</span>
        </div>
      )}
    </div>
  );
}
