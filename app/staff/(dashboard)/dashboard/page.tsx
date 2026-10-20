'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { z } from 'zod';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  MessageSquare,
  Calendar,
  Building,
  ArrowRight,
  Clock,
  MapPin,
  ChevronRight,
  Download,
  Users,
  ShieldCheck,
} from 'lucide-react';

const dashboardResponseSchema = z.object({
  data: z.object({
    attentionQueueCount: z.number().int().nonnegative(),
    conversationCount: z.number().int().nonnegative(),
    publishedListingCount: z.number().int().nonnegative(),
    confirmedInspectionCount: z.number().int().nonnegative(),
    upcomingSlotCount: z.number().int().nonnegative(),
    queue: z.array(z.object({
      id: z.string(),
      customerName: z.string(),
      propertyTitle: z.string(),
      updatedAt: z.string(),
    })),
    slots: z.array(z.object({
      id: z.string(),
      propertyId: z.string(),
      agentId: z.string().nullable(),
      startsAt: z.string(),
      endsAt: z.string(),
      capacity: z.number().int(),
      reservedCount: z.number().int(),
    })),
    capabilities: z.object({
      canManageListings: z.boolean(),
      canManageInspections: z.boolean(),
      canExportAudit: z.boolean(),
    }),
  }),
});

type DashboardData = z.infer<typeof dashboardResponseSchema>['data'];

async function fetchDashboardData(): Promise<DashboardData> {
  const response = await fetch('/api/staff/dashboard', { cache: 'no-store' });
  const body: unknown = await response.json().catch(() => null);
  const parsed = dashboardResponseSchema.safeParse(body);
  if (!response.ok || !parsed.success) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'Unable to load live dashboard data';
    throw new Error(message);
  }
  return parsed.data.data;
}

function dashboardValue(value: number | undefined, loading: boolean, error: string) {
  if (loading) return '…';
  if (error || value === undefined) return 'Unavailable';
  return value.toLocaleString();
}

function timeInWAT(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function StaffDashboardPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState('');
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetchDashboardData()
      .then((data) => {
        if (active) {
          setDashboardData(data);
          setDashboardError('');
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setDashboardError(loadError instanceof Error ? loadError.message : 'Unable to load live dashboard data');
        }
      })
      .finally(() => {
        if (active) setDashboardLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-dash-kpi]',
        { y: 10, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.fast,
          stagger: 0.04,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
      gsap.fromTo(
        '[data-dash-panel]',
        { y: 12, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.normal,
          stagger: 0.06,
          delay: 0.08,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: pageRef }
  );

  return (
    <div ref={pageRef} className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: 'Operations Overview' }]}
        actions={
          <div className="flex items-center gap-2">
            {dashboardData?.capabilities.canManageInspections && (
              <Link
                href="/staff/inspections"
                className="nestly-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold transition-all shadow-2xs"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Manage Inspections</span>
              </Link>
            )}
          </div>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-8">
        {/* Operational Header Block */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Staff Operations Overview
            </h1>
            <p className="text-sm text-charcoal/70 mt-1 leading-relaxed">
              Live, permission-scoped conversation, listing, and inspection data from the connected workspace.
            </p>
          </div>

          {/* Quick Actions Capsule Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-soft-stone p-1.5 rounded-full border border-hairline w-fit">
            {dashboardData?.capabilities.canManageListings && <Link
              href="/staff/properties/new"
              className="nestly-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-charcoal text-xs font-bold hover:bg-warm transition-colors border border-hairline shadow-2xs"
            >
              <Building className="w-3.5 h-3.5 text-primary" />
              <span>+ New Listing</span>
            </Link>}
            <Link
              href="/staff/inbox"
              className="nestly-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-charcoal text-xs font-bold hover:bg-warm transition-colors border border-hairline shadow-2xs"
            >
              <MessageSquare className="w-3.5 h-3.5 text-persimmon" />
              <span>Open Active Triage</span>
            </Link>
            {dashboardData?.capabilities.canExportAudit && <a
              href="/api/staff/audit-logs?format=csv"
              className="nestly-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-charcoal text-xs font-bold hover:bg-warm transition-colors border border-hairline shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-muted-ink" />
              <span>Export Audit CSV</span>
            </a>}
          </div>
        </div>

        {/* Metric Overview Bento Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Metric 1: Human Queue */}
          <div data-dash-kpi className="bg-white rounded-3xl p-5 shadow-sm border border-hairline hover:border-hairline/80 transition-all flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Human Takeover Queue
              </span>
              <span className="p-1.5 rounded-full bg-persimmon/10 text-persimmon">
                <MessageSquare className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-headline text-3xl font-bold text-charcoal">
                {dashboardValue(dashboardData?.attentionQueueCount, dashboardLoading, dashboardError)}
              </span>
              <span className="text-xs font-semibold text-charcoal/70">Inquiries</span>
            </div>
            <p className="text-xs text-muted-ink mt-0.5">Conversations currently in human mode</p>
            <div className="mt-4 pt-2.5 flex items-center justify-between border-t border-hairline/60">
              <span className="text-[11px] text-charcoal/80 font-semibold">
                Persisted staff queue
              </span>
              <span className="text-[10px] text-muted-ink font-semibold">RLS scoped</span>
            </div>
          </div>

          {/* Metric 2: Pending Inspections */}
          <div data-dash-kpi className="bg-white rounded-3xl p-5 shadow-sm border border-hairline hover:border-hairline/80 transition-all flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Upcoming Schedule
              </span>
              <span className="p-1.5 rounded-full bg-soft-stone text-primary">
                <Calendar className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-headline text-3xl font-bold text-charcoal">
                {dashboardValue(dashboardData?.upcomingSlotCount, dashboardLoading, dashboardError)}
              </span>
              <span className="text-xs font-semibold text-charcoal/70">Slots</span>
            </div>
            <p className="text-xs text-muted-ink mt-0.5">Active future slots (WAT)</p>
            <div className="mt-4 pt-2.5 flex items-center justify-between border-t border-hairline/60">
              <span className="text-[11px] text-charcoal/80 font-semibold">
                Confirmed: {dashboardValue(dashboardData?.confirmedInspectionCount, dashboardLoading, dashboardError)}
              </span>
              <span className="text-[10px] text-muted-ink font-semibold">Database count</span>
            </div>
          </div>

          {/* Metric 3: Active Listings */}
          <div data-dash-kpi className="bg-white rounded-3xl p-5 shadow-sm border border-hairline hover:border-hairline/80 transition-all flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Published Listings
              </span>
              <span className="p-1.5 rounded-full bg-emerald-50 text-emerald-700">
                <Building className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-headline text-3xl font-bold text-charcoal">
                {dashboardValue(dashboardData?.publishedListingCount, dashboardLoading, dashboardError)}
              </span>
              <span className="text-xs font-semibold text-charcoal/70">Published</span>
            </div>
            <p className="text-xs text-muted-ink mt-0.5">Publication state only; verification is separate</p>
            <div className="mt-4 pt-2.5 flex items-center justify-between border-t border-hairline/60">
              <span className="text-[11px] text-charcoal font-bold">Permission-scoped</span>
              <span className="text-[10px] text-muted-ink font-semibold">Not a vetting count</span>
            </div>
          </div>

          {/* Metric 4: Persisted conversations */}
          <div data-dash-kpi className="bg-white rounded-3xl p-5 shadow-sm border border-hairline hover:border-hairline/80 transition-all flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Persisted Conversations
              </span>
              <span className="p-1.5 rounded-full bg-soft-stone text-primary">
                <MessageSquare className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-headline text-3xl font-bold text-charcoal">
                {dashboardValue(dashboardData?.conversationCount, dashboardLoading, dashboardError)}
              </span>
              <span className="text-xs font-semibold text-charcoal/70">Records</span>
            </div>
            <p className="text-xs text-muted-ink mt-0.5">Stored conversations visible to your role</p>
            <div className="mt-4 pt-2.5 flex items-center justify-between border-t border-hairline/60">
              <span className="text-[11px] text-charcoal/80 font-bold">Telegram / Nia</span>
              <span className="text-[10px] text-muted-ink font-semibold">See integration checks</span>
            </div>
          </div>
        </div>

        {/* Main Workspace Two-Column Split */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Primary Column: Immediate Action Queue (8 cols) */}
          <div className="xl:col-span-8 space-y-6">
            <div data-dash-panel className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-hairline">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-hairline">
                <div>
                  <h2 className="font-headline text-lg sm:text-xl font-bold text-charcoal tracking-tight">
                    Immediate Action Queue
                  </h2>
                  <p className="text-xs text-charcoal/70 mt-0.5">
                    Conversations currently owned by staff
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-persimmon/10 text-persimmon text-[10px] font-bold uppercase tracking-wider">
                    {dashboardValue(dashboardData?.attentionQueueCount, dashboardLoading, dashboardError)} active
                  </span>
                </div>
              </div>

              <div className="divide-y divide-hairline mt-2">
                {dashboardLoading && (
                  <p className="py-6 text-sm text-muted-ink">Loading the authorized conversation queue…</p>
                )}
                {dashboardError && (
                  <p role="alert" className="py-6 text-sm text-rose-700">{dashboardError}</p>
                )}
                {!dashboardLoading && !dashboardError && dashboardData?.queue.length === 0 && (
                  <p className="py-6 text-sm text-muted-ink">No conversations are currently in human mode.</p>
                )}
                {!dashboardError && dashboardData?.queue.map((conversation) => (
                  <div key={conversation.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-soft-stone text-primary font-bold text-xs flex items-center justify-center shrink-0 border border-hairline">
                        {conversation.customerName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="font-bold text-sm text-charcoal block">{conversation.customerName}</span>
                        <p className="text-xs text-charcoal/70 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-persimmon shrink-0" />
                          <span className="truncate">{conversation.propertyTitle}</span>
                        </p>
                        <p className="text-[11px] text-muted-ink">
                          Updated {new Date(conversation.updatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }) + ' WAT'}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/staff/inbox/${conversation.id}`}
                      className="nestly-press px-3.5 py-1.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold transition-all shadow-2xs self-start sm:self-center"
                    >
                      Open Conversation
                    </Link>
                  </div>
                ))}
              </div>

            </div>

            <div data-dash-panel className="bg-white rounded-3xl p-6 shadow-sm border border-hairline">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <h3 className="font-headline text-base font-bold text-charcoal">
                    Upcoming Inspection Slots (WAT)
                  </h3>
                </div>
                {dashboardData?.capabilities.canManageInspections && (
                  <Link
                    href="/staff/inspections/availability"
                    className="text-xs font-bold text-persimmon hover:underline flex items-center gap-1"
                  >
                    <span>Manage Slots</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
              {dashboardLoading && <p className="text-sm text-muted-ink">Loading schedule…</p>}
              {dashboardError && <p role="alert" className="text-sm text-rose-700">{dashboardError}</p>}
              {!dashboardLoading && !dashboardError && dashboardData?.slots.length === 0 && (
                <p className="text-sm text-muted-ink">No upcoming active slots are visible in your authorized scope.</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {dashboardData?.slots.map((slot) => (
                  <div key={slot.id} className="p-3.5 rounded-2xl bg-soft-stone border border-hairline flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-bold text-muted-ink mb-1">
                        <span>{timeInWAT(slot.startsAt)}–{timeInWAT(slot.endsAt)} WAT</span>
                        <span className="text-primary">{slot.agentId ? 'Agent assigned' : 'Unassigned'}</span>
                      </div>
                      <p className="text-xs font-bold text-charcoal truncate">Property {slot.propertyId.slice(0, 8)}</p>
                      <p className="text-[11px] text-muted-ink">{slot.reservedCount} / {slot.capacity} reserved</p>
                    </div>
                    <Link
                      href="/staff/inspections/availability"
                      className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 pt-1 border-t border-hairline"
                    >
                      <span>Manage availability</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Secondary Column: Hub Status & Quick Links (4 cols) */}
          <div className="xl:col-span-4 space-y-6">
            {/* Regional Hub Status Card */}
            <div data-dash-panel className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-headline text-sm font-bold text-charcoal">Integration Configuration</h3>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  dashboardLoading
                    ? 'bg-soft-stone text-muted-ink'
                    : dashboardError
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {dashboardLoading ? 'Checking' : dashboardError ? 'Unavailable' : 'Database measured'}
                </span>
              </div>

              <div className="space-y-3 text-xs">
                {/* Hub 1 */}
                <div className="p-3 rounded-2xl bg-soft-stone border border-hairline flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-bold text-charcoal">Website conversations</p>
                    <p className="text-muted-ink text-[11px]">Connected database query</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                      <span className={`w-2 h-2 rounded-full ${dashboardError ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                      {dashboardLoading ? 'Checking' : dashboardError ? 'Unavailable' : 'Measured'}
                    </span>
                    <p className="text-[10px] text-muted-ink">No delivery status inferred</p>
                  </div>
                </div>

                {/* Hub 2 */}
                <div className="p-3 rounded-2xl bg-soft-stone border border-hairline flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-bold text-charcoal">Telegram / n8n Nia</p>
                    <p className="text-muted-ink text-[11px]">External message delivery</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> See checks
                    </span>
                    <p className="text-[10px] text-muted-ink">Check configuration and webhook</p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Link
                  href="/staff/integrations"
                  className="nestly-press w-full py-2.5 px-4 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-colors border border-hairline flex items-center justify-center gap-1.5"
                >
                  <span>Review Integration Setup</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Quick Links Navigator */}
            <div data-dash-panel className="bg-soft-stone rounded-3xl p-6 border border-hairline space-y-3">
              <h3 className="text-xs font-bold text-charcoal uppercase tracking-wider">
                Quick Shortcuts
              </h3>
              <div className="flex flex-col gap-1.5 text-xs">
                <Link
                  href="/staff/customers"
                  className="p-2.5 rounded-xl bg-white hover:bg-warm text-charcoal font-semibold flex items-center justify-between border border-hairline transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-muted-ink" />
                    <span>Customer Directory</span>
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-hairline" />
                </Link>
                {dashboardData?.capabilities.canManageInspections && (
                  <Link
                    href="/staff/inspections/availability"
                    className="p-2.5 rounded-xl bg-white hover:bg-warm text-charcoal font-semibold flex items-center justify-between border border-hairline transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-muted-ink" />
                      <span>Manage Daylight Availability Slots</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-hairline" />
                  </Link>
                )}
                {dashboardData?.capabilities.canExportAudit && (
                  <Link
                    href="/staff/audit-log"
                    className="p-2.5 rounded-xl bg-white hover:bg-warm text-charcoal font-semibold flex items-center justify-between border border-hairline transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-muted-ink" />
                      <span>Security &amp; Audit Trails</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-hairline" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
