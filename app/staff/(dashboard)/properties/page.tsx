'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { PROPERTIES as FIXTURE_PROPERTIES } from '@/lib/fixtures/properties';
import { getDemoFixtures } from '@/lib/demo-mode';
import type { Property } from '@/lib/types';
import {
  getStaffPropertyStatusLabel,
  matchesStaffPropertyStatus,
  type StaffPropertyStatusFilter,
} from '@/lib/staff-property-status';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  Building,
  Plus,
  Search,
  Download,
} from 'lucide-react';

type PropertyListResponse = {
  data?: Property[];
  count?: number;
  error?: string;
};

const IS_DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
const DEMO_PROPERTIES = getDemoFixtures(IS_DEMO_MODE, FIXTURE_PROPERTIES);
const PAGE_SIZE = 20;
const FILTERS: { value: StaffPropertyStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Published & Available' },
  { value: 'in-review', label: 'In Review' },
  { value: 'draft', label: 'Draft' },
  { value: 'rented', label: 'Published & Rented' },
];
const DEMO_STATUS_FOR_FILTER: Partial<Record<StaffPropertyStatusFilter, string>> = {
  available: 'Available',
  'in-review': 'In Review',
  draft: 'Draft',
  rented: 'Rented',
};

export default function PropertyManagementPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StaffPropertyStatusFilter>('all');
  const [csvExported, setCsvExported] = useState(false);
  const [properties, setProperties] = React.useState<Property[]>(() => DEMO_PROPERTIES);
  const [listError, setListError] = React.useState<string | null>(null);
  const [listLoading, setListLoading] = React.useState(!IS_DEMO_MODE);
  const [page, setPage] = React.useState(1);
  const [retryCount, setRetryCount] = React.useState(0);
  const [totalCount, setTotalCount] = React.useState<number | null>(IS_DEMO_MODE ? DEMO_PROPERTIES.length : null);
  React.useEffect(() => {
    let cancelled = false;
    if (IS_DEMO_MODE) return;
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (searchQuery) qs.set('keyword', searchQuery);
    if (statusFilter !== 'all') qs.set('staff_status', statusFilter);
    fetch(`/api/properties?${qs.toString()}`, { cache: 'no-store', signal: ctrl.signal })
      .then(async (response) => ({
        ok: response.ok,
        body: await response.json() as PropertyListResponse,
      }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) throw new Error(body.error || 'Failed to load property records.');
        if (!Array.isArray(body.data)) throw new Error('The property service returned an invalid record list.');
        setProperties(body.data);
        setTotalCount(typeof body.count === 'number' ? body.count : null);
        setListError(null);
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        setListError(error instanceof Error ? error.message : 'Failed to load listings');
        setProperties([]);
        setTotalCount(null);
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => { cancelled = true; ctrl.abort(); };
  }, [searchQuery, statusFilter, page, retryCount]);

  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const prepareListReload = () => {
    if (IS_DEMO_MODE) return;
    setListLoading(true);
    setListError(null);
    setProperties([]);
    setTotalCount(null);
  };
  const changePage = (nextPage: number) => {
    prepareListReload();
    setPage(nextPage);
  };

  const filteredProperties = properties.filter((p) => {
    if (!IS_DEMO_MODE) return true;
    const codeMatch = (p.code || p.id).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.neighborhood.toLowerCase().includes(searchQuery.toLowerCase()) ||
      codeMatch ||
      p.city.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = IS_DEMO_MODE
      ? statusFilter === 'all' || p.status === DEMO_STATUS_FOR_FILTER[statusFilter]
      : matchesStaffPropertyStatus(p, statusFilter);

    return matchesSearch && matchesStatus;
  });

  const handleExportCsv = () => {
    if (typeof window === 'undefined') return;
    const headers = ['Code', 'Title', 'Neighborhood', 'City', 'Price (NGN)', 'Bedrooms', 'Status'];
    const rows = filteredProperties.map((p) => [
      `"${(p.code || p.id).replace(/"/g, '""')}"`,
      `"${p.title.replace(/"/g, '""')}"`,
      `"${p.neighborhood.replace(/"/g, '""')}"`,
      `"${p.city.replace(/"/g, '""')}"`,
      p.priceAnnual,
      p.bedrooms,
      `"${(IS_DEMO_MODE ? `Demo: ${p.status || 'status not provided'}` : getStaffPropertyStatusLabel(p)).replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nestly-properties-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setCsvExported(true);
    setTimeout(() => setCsvExported(false), 2500);
  };

  useGSAP(
    () => {
      if (prefersReducedMotion() || !tableBodyRef.current) return;
      const rows = tableBodyRef.current.querySelectorAll('tr');
      if (!rows.length) return;
      gsap.fromTo(
        rows,
        { opacity: 0, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: 0.18,
          stagger: 0.025,
          ease: MOTION.ease.crispOut,
          overwrite: 'auto',
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [statusFilter, searchQuery], scope: tableBodyRef }
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: 'Property Management' }]}
        actions={
          <Link
            href="/staff/properties/new"
            className="nestly-press inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold transition-all shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add New Property</span>
          </Link>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {IS_DEMO_MODE && (
          <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
            Demo mode is enabled. The property rows below are fictional fixtures and are not live inventory.
          </div>
        )}

        {/* Header Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-persimmon font-bold px-2.5 py-0.5 rounded-full bg-persimmon/10">
                Inventory &amp; Operations
              </span>
              <span className="w-1 h-1 rounded-full bg-hairline"></span>
              <span className="text-xs text-charcoal/70 font-semibold">
                Property records
              </span>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Property Management
            </h1>
            <p className="text-sm text-charcoal/70 max-w-2xl leading-relaxed">
              Review property records, publication state, and reported rental availability. Inspection capacity and portfolio aggregates are not provided here.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleExportCsv}
              className="nestly-press flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-warm text-charcoal text-xs font-semibold transition-colors border border-hairline shadow-2xs shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-muted-ink" />
              <span>{csvExported ? 'Export started' : 'Export this page (CSV)'}</span>
            </button>
          </div>
        </div>

        {/* Counts are limited to the returned records; operational aggregates are not provided by this API. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: IS_DEMO_MODE ? 'Demo sample records' : 'Records on this page',
              value: listLoading ? 'Loading' : properties.length,
              note: IS_DEMO_MODE ? 'Fictional fixtures only' : 'Returned by the property service',
            },
            {
              label: 'Total matching records',
              value: listLoading ? 'Loading' : totalCount ?? 'Unavailable',
              note: 'Count reported by the property service',
            },
            {
              label: 'Published on this page',
              value: IS_DEMO_MODE ? 'Not provided' : properties.filter((property) => property.publicationState === 'published').length,
              note: 'Derived from returned publication states',
            },
            {
              label: 'Available on this page',
              value: IS_DEMO_MODE
                ? 'Not provided'
                : properties.filter((property) => property.publicationState === 'published' && property.rentalAvailability === 'available').length,
              note: 'Requires published and rental-available state',
            },
          ].map((metric) => (
            <div key={metric.label} className="p-5 rounded-3xl bg-white shadow-sm border border-hairline">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[10px] font-bold text-muted-ink uppercase tracking-wider">{metric.label}</span>
                <span className="p-2 rounded-full bg-persimmon/10 text-persimmon"><Building className="w-4 h-4" /></span>
              </div>
              <p className="font-headline text-3xl font-bold text-charcoal">{metric.value}</p>
              <p className="text-xs text-muted-ink mt-1">{metric.note}</p>
            </div>
          ))}
        </div>

        {listError && (
          <div role="alert" className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-bold flex items-center justify-between gap-3">
            <span>{listError}</span>
            <button
              type="button"
              onClick={() => {
                prepareListReload();
                setRetryCount((count) => count + 1);
              }}
              className="underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}
        {/* Property Table Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-hairline p-5 sm:p-6 space-y-5">
          <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-xl">
              <Search className="w-4 h-4 text-muted-ink absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  prepareListReload();
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by title, location, or reference code..."
                className="w-full pl-11 pr-4 py-2.5 rounded-full bg-warm text-charcoal text-xs placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { prepareListReload(); setSearchQuery(''); setPage(1); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-ink hover:text-charcoal text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
              {FILTERS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => { if (statusFilter === tab.value) return; prepareListReload(); setStatusFilter(tab.value); setPage(1); }}
                  className={`nestly-press shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full transition-all capitalize ${
                    statusFilter === tab.value
                      ? 'bg-charcoal text-white font-bold'
                      : 'bg-soft-stone hover:bg-hairline text-charcoal/70'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {listLoading ? (
            <div role="status" className="p-12 text-center text-xs text-muted-ink">Loading property records…</div>
          ) : filteredProperties.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Building className="w-10 h-10 text-muted-ink mx-auto" />
              <h3 className="font-headline text-base font-bold text-charcoal">
                {listError ? 'Property records are unavailable' : 'No Properties Found'}
              </h3>
              <p className="text-xs text-charcoal/70 max-w-sm mx-auto">
                {listError
                  ? 'The property service did not return records. Retry the request to load the current list.'
                  : 'No properties match your current search criteria. Try modifying your filter or clear the search.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 sm:-mx-6">
              <table className="w-full text-left min-w-[850px] text-xs">
                <thead>
                  <tr className="bg-soft-stone/70 text-muted-ink uppercase font-bold text-[10px] tracking-wider border-y border-hairline">
                    <th className="py-3 px-6">Reference</th>
                    <th className="py-3 px-4">Property Title</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Annual Rent</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Power Feeder</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody ref={tableBodyRef} className="divide-y divide-hairline">
                  {filteredProperties.map((prop) => (
                    <tr key={prop.id} className="hover:bg-soft-stone/40 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold text-charcoal">
                        {prop.code || prop.id}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          {prop.featuredImage || prop.galleryImages?.[0] ? (
                            <img
                              src={prop.featuredImage || prop.galleryImages?.[0] || ''}
                              alt={prop.title}
                              className="w-12 h-10 rounded-xl object-cover shrink-0 border border-hairline bg-soft-stone"
                              onError={(event) => {
                                const image = event.currentTarget;
                                if (image.dataset.fallbackAttempted) {
                                  image.style.visibility = 'hidden';
                                  return;
                                }
                                image.dataset.fallbackAttempted = 'true';
                                const fallback = prop.galleryImages?.find(
                                  (source) => source && source !== (prop.featuredImage || prop.galleryImages?.[0]),
                                );
                                if (fallback) image.src = fallback;
                                else image.style.visibility = 'hidden';
                              }}
                            />
                          ) : (
                            <div
                              aria-hidden="true"
                              className="w-12 h-10 rounded-xl shrink-0 border border-hairline bg-soft-stone"
                            />
                          )}
                          <div>
                            <span className="font-bold text-charcoal block line-clamp-1 max-w-[240px]">
                              {prop.title}
                            </span>
                            <span className="text-[10px] text-muted-ink">
                              {prop.bedrooms} Bed · {prop.bathrooms} Bath · {prop.propertyType}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-charcoal/80">
                        <span className="font-semibold block">{prop.neighborhood}</span>
                        <span className="text-[10px] text-muted-ink">{prop.city}</span>
                      </td>
                      <td className="py-4 px-4 font-bold text-persimmon">
                        {prop.priceFormatted || `₦${prop.priceAnnual.toLocaleString()}`}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            !IS_DEMO_MODE && prop.publicationState === 'published' && prop.rentalAvailability === 'available'
                              ? 'bg-emerald-100 text-emerald-800'
                              : prop.publicationState === 'review'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-soft-stone text-charcoal'
                          }`}
                        >
                          {IS_DEMO_MODE
                            ? `Demo: ${prop.status || 'status not provided'}`
                            : getStaffPropertyStatusLabel(prop)}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-charcoal/70 text-[11px]">
                        {prop.powerRating}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="inline-flex items-center gap-1.5 shrink-0">
                          <Link
                            href={`/staff/properties/${prop.id}/preview`}
                            className="nestly-press inline-flex items-center justify-center min-h-[36px] px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-colors border border-hairline shrink-0 whitespace-nowrap"
                          >
                            Audit
                          </Link>
                          <Link
                            href={`/staff/properties/${prop.id}/edit`}
                            className="nestly-press inline-flex items-center justify-center min-h-[36px] px-3.5 py-1.5 rounded-full bg-charcoal hover:bg-black text-white text-xs font-bold transition-colors shrink-0 whitespace-nowrap"
                          >
                            Edit
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            {totalCount !== null && totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-muted-ink">Page {page} of {Math.ceil(totalCount / PAGE_SIZE)}</span>
                <div className="flex gap-2 shrink-0">
                  <button disabled={page <= 1} onClick={() => changePage(Math.max(1, page - 1))} className="px-3.5 py-1.5 min-h-[36px] rounded-full bg-soft-stone hover:bg-hairline disabled:opacity-40 text-xs font-bold shrink-0 transition-colors">Prev</button>
                  <button disabled={page >= Math.ceil(totalCount / PAGE_SIZE)} onClick={() => changePage(page + 1)} className="px-3.5 py-1.5 min-h-[36px] rounded-full bg-soft-stone hover:bg-hairline disabled:opacity-40 text-xs font-bold shrink-0 transition-colors">Next</button>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
