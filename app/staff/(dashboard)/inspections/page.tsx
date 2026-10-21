'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  MapPin,
} from 'lucide-react';

type Booking = {
  id: string;
  public_reference: string;
  status: string;
  name: string;
  property_title: string;
  property_address: string;
  slot: {
    starts_at: string;
    ends_at: string;
    field_agent_name: string;
  } | null;
};

type WorkspaceSettings = {
  daylight_start: string;
  daylight_end: string;
};

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function keyForUtcDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calendarDateWindow(
  viewMode: 'Month' | 'Week' | 'List',
  selectedDate: string,
  visibleMonth: Date,
) {
  if (viewMode === 'Week') {
    const weekStart = dateFromKey(selectedDate);
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    return {
      from: dateKey(weekStart),
      to: dateKey(weekEnd),
    };
  }
  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  return {
    from: keyForUtcDate(year, month, 1),
    to: keyForUtcDate(year, month, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()),
  };
}

function slotTime(slot: Booking['slot']) {
  if (!slot) return 'Time not assigned';
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${formatter.format(new Date(slot.starts_at))}–${formatter.format(new Date(slot.ends_at))} WAT`;
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export default function InspectionCalendarPage() {
  const [viewMode, setViewMode] = useState<'Month' | 'Week' | 'List'>('Month');
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = dateFromKey(dateKey(new Date()));
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  });
  const [statusFilter, setStatusFilter] = useState<'All' | 'Confirmed' | 'Pending'>('All');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const inspectorRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);
  const dateWindow = calendarDateWindow(viewMode, selectedDate, visibleMonth);

  const loadData = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      const [firstBookingResponse, workspaceResponse] = await Promise.all([
        fetch(`/api/inspections/bookings?${new URLSearchParams({
          from: dateWindow.from,
          to: dateWindow.to,
          page: '1',
        })}`),
        fetch('/api/staff/workspace'),
      ]);
      const [firstBookingResult, workspaceResult] = await Promise.all([
        firstBookingResponse.json(),
        workspaceResponse.json(),
      ]);
      if (!firstBookingResponse.ok) {
        throw new Error(firstBookingResult.error || 'Unable to load inspection requests');
      }
      if (!workspaceResponse.ok) throw new Error(workspaceResult.error || 'Unable to load scheduling settings');
      if (
        !Array.isArray(firstBookingResult.data)
        || firstBookingResult.page !== 1
        || !Number.isInteger(firstBookingResult.pageSize)
        || !Number.isInteger(firstBookingResult.total)
      ) {
        throw new Error('Inspection calendar returned an invalid page');
      }
      const allBookings: Booking[] = [...firstBookingResult.data];
      const total = firstBookingResult.total as number;
      const pageSize = firstBookingResult.pageSize as number;
      const pageCount = Math.ceil(total / pageSize);
      if (pageCount > 1000) {
        throw new Error('This calendar window contains too many requests to load at once; switch to Week view');
      }
      for (let page = 2; page <= pageCount; page += 1) {
        const params = new URLSearchParams({
          from: dateWindow.from,
          to: dateWindow.to,
          page: String(page),
        });
        const response = await fetch(`/api/inspections/bookings?${params}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load all inspection requests');
        if (
          !Array.isArray(result.data)
          || result.page !== page
          || result.total !== total
          || result.pageSize !== pageSize
        ) {
          throw new Error('Inspection calendar pagination changed while loading');
        }
        allBookings.push(...result.data);
      }
      if (sequence === requestSequence.current) {
        setBookings(allBookings);
        setWorkspace(workspaceResult.data);
        setError('');
      }
    } catch (loadError) {
      if (sequence === requestSequence.current) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load the inspection calendar');
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [dateWindow.from, dateWindow.to]);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void loadData();
    });
  }, [loadData]);

  const activeBookings = bookings.filter((booking) => (
    statusFilter === 'All'
    || (statusFilter === 'Confirmed' && booking.status === 'approved')
    || (statusFilter === 'Pending' && booking.status === 'pending')
  ));
  const selectedBookings = activeBookings.filter((booking) => (
    booking.slot && dateKey(new Date(booking.slot.starts_at)) === selectedDate
  ));
  const month = visibleMonth;
  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const monthLabel = new Intl.DateTimeFormat('en-NG', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(month);
  const numberOfDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leadingDays = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const monthDateKeys = Array.from({ length: numberOfDays }, (_, index) => (
    keyForUtcDate(year, monthIndex, index + 1)
  ));
  const monthCells: Array<string | null> = [
    ...Array.from({ length: leadingDays }, () => null),
    ...monthDateKeys,
  ];
  const weekStart = dateFromKey(selectedDate || keyForUtcDate(year, monthIndex, 1));
  const weekOffset = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - weekOffset);
  const weekDateKeys = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + index);
    return keyForUtcDate(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  });
  const listDateKeys = monthDateKeys.filter((key) => (
    activeBookings.some((booking) => booking.slot && dateKey(new Date(booking.slot.starts_at)) === key)
  ));
  const calendarCells = viewMode === 'Week'
    ? weekDateKeys
    : viewMode === 'List'
      ? listDateKeys
      : monthCells;
  const confirmedCount = bookings.filter((booking) => booking.status === 'approved').length;
  const pendingCount = bookings.filter((booking) => booking.status === 'pending').length;
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
  });

  useGSAP(
    () => {
      if (prefersReducedMotion() || !inspectorRef.current) return;
      gsap.fromTo(
        inspectorRef.current,
        { opacity: 0.72, y: 6 },
        {
          opacity: 1,
          y: 0,
          duration: 0.18,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [selectedDate, viewMode, statusFilter] }
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: 'Inspection Calendar' }]}
        actions={
          <Link
            href="/staff/inspections/availability"
            className="nestly-press inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold transition-all shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Configure Availability Windows</span>
          </Link>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="px-5 py-2.5 rounded-full bg-soft-stone border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-charcoal/80">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-bold uppercase tracking-wider text-charcoal">
              Daylight Inspection Dispatch
            </span>
            <span className="text-muted-ink">
              · Configured {workspace
                ? `${workspace.daylight_start.slice(0, 5)}–${workspace.daylight_end.slice(0, 5)} WAT`
                : 'hours loading'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-muted-ink">
            <Clock className="w-3.5 h-3.5 text-primary" />
            <span>Africa/Lagos (WAT, UTC+1)</span>
          </div>
        </div>

        {/* Operational Header & Controls Strip */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Inspection Calendar
            </h1>
            <p className="text-sm text-charcoal/70">
              Coordinated daylight physical walkthroughs with keyholders and vetted field officers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Segmented Control */}
            <div className="p-1 rounded-full bg-soft-stone border border-hairline flex items-center gap-1 text-xs font-semibold">
              {(['Month', 'Week', 'List'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`nestly-press px-3.5 py-1.5 rounded-full transition-all ${
                    viewMode === mode
                      ? 'bg-white text-charcoal font-bold shadow-2xs'
                      : 'text-charcoal/70 hover:text-charcoal'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {/* Month Stepper */}
            <div className="flex items-center gap-1 bg-white rounded-full p-1 border border-hairline shadow-2xs">
              <button
                type="button"
                onClick={() => {
                  const previous = new Date(Date.UTC(year, monthIndex - 1, 1));
                  setVisibleMonth(previous);
                  setSelectedDate(keyForUtcDate(previous.getUTCFullYear(), previous.getUTCMonth(), 1));
                }}
                aria-label="Previous month"
                className="w-7 h-7 rounded-full flex items-center justify-center text-charcoal hover:bg-soft-stone"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-headline text-xs font-bold text-charcoal px-3 min-w-[110px] text-center">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
                  setVisibleMonth(next);
                  setSelectedDate(keyForUtcDate(next.getUTCFullYear(), next.getUTCMonth(), 1));
                }}
                aria-label="Next month"
                className="w-7 h-7 rounded-full flex items-center justify-center text-charcoal hover:bg-soft-stone"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const today = dateKey(new Date());
                  const todayDate = dateFromKey(today);
                  setSelectedDate(today);
                  setVisibleMonth(new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1)));
                }}
                className="nestly-press px-3 py-1 rounded-full bg-soft-stone text-charcoal text-[11px] font-bold hover:bg-hairline"
              >
                Today
              </button>
            </div>
          </div>
        </div>

        {/* Filter Pills Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 text-xs font-semibold">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('All')}
              className={`nestly-press px-3.5 py-1.5 rounded-full transition-all ${
                statusFilter === 'All'
                  ? 'bg-charcoal text-white font-bold'
                  : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
              }`}
            >
              All Requests ({bookings.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Confirmed')}
              className={`nestly-press px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
                statusFilter === 'Confirmed'
                  ? 'bg-emerald-700 text-white font-bold'
                  : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Confirmed ({confirmedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('Pending')}
              className={`nestly-press px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
                statusFilter === 'Pending'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
              Pending Review ({pendingCount})
            </button>
          </div>

          <div className="flex items-center gap-4 text-muted-ink text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-persimmon"></span>
              <span>Pending review</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Approved inspection</span>
            </span>
          </div>
        </div>

        {/* Primary Workspace: Split Bento Grid (Calendar 8-Col + Inspector 4-Col) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Calendar Month Grid */}
          <div className="xl:col-span-8 bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
            <div className={viewMode === 'List' ? 'w-full' : 'overflow-x-auto -mx-2 px-2'}>
              <div className={viewMode === 'List' ? 'w-full' : 'min-w-[520px] sm:min-w-0 space-y-4'}>
                {/* Weekdays */}
                {viewMode !== 'List' && (
                  <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-ink pb-2 border-b border-hairline">
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                  </div>
                )}

                {/* Days Grid */}
                <div className={viewMode === 'List' ? 'grid grid-cols-1 gap-2.5' : 'grid grid-cols-7 gap-2.5'}>
                  {!loading && viewMode === 'List' && calendarCells.length === 0 && (
                    <p className="text-sm text-muted-ink">No inspection requests in this month.</p>
                  )}
                  {calendarCells.map((key, index) => {
                    if (!key) return <div key={`blank-${index}`} aria-hidden="true" />;
                    const dayBookings = activeBookings.filter(
                      (booking): booking is Booking & { slot: NonNullable<Booking['slot']> } => (
                        booking.slot !== null && dateKey(new Date(booking.slot.starts_at)) === key
                      ),
                    );
                    const date = dateFromKey(key);
                    const isSelected = selectedDate === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedDate(key)}
                        className={`nestly-press min-h-[85px] p-2.5 rounded-2xl flex flex-col justify-between text-left transition-all border ${
                          isSelected
                            ? 'bg-white ring-2 ring-primary border-primary shadow-xs'
                            : 'bg-soft-stone/40 hover:bg-soft-stone border-hairline'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span
                            className={`font-headline text-xs font-bold ${
                              isSelected ? 'text-primary' : 'text-charcoal'
                            }`}
                          >
                            {String(date.getUTCDate()).padStart(2, '0')} {viewMode === 'List'
                              ? date.toLocaleDateString('en-NG', { weekday: 'long', month: 'short', timeZone: 'UTC' })
                              : ''}
                          </span>
                          {dayBookings.length > 0 && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          )}
                        </div>

                        {dayBookings.slice(0, viewMode === 'List' ? 10 : 2).map((booking) => (
                          <div
                            key={booking.id}
                            className={`mt-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold truncate ${
                              booking.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-amber-50 text-amber-800'
                            }`}
                          >
                            {timeFormatter.format(new Date(booking.slot!.starts_at))} · {booking.property_title}
                          </div>
                        ))}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Selected Day Inspector & Upcoming Scheduled Slots */}
          <div className="xl:col-span-4 space-y-5 sticky top-24">
            <div ref={inspectorRef} className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                    Schedule for Selected Day
                  </span>
                  <h3 className="font-headline text-base font-bold text-charcoal">
                    {selectedDate
                      ? new Intl.DateTimeFormat('en-NG', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'Africa/Lagos',
                        }).format(dateFromKey(selectedDate))
                      : 'Select a day'}
                  </h3>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  Daylight Slot
                </span>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <p className="text-xs text-muted-ink">Loading requests…</p>
                ) : selectedBookings.length === 0 ? (
                  <p className="text-xs text-muted-ink">No inspection requests for this day.</p>
                ) : selectedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded-2xl bg-soft-stone border border-hairline space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-charcoal">{slotTime(b.slot)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white text-muted-ink text-[10px] font-bold border border-hairline">
                        {statusLabel(b.status)}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-charcoal">{b.property_title}</h4>
                      <p className="text-[11px] text-muted-ink flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-persimmon" />
                        <span>{b.property_address}</span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-hairline text-[11px]">
                      <span className="text-charcoal/70">Agent: <strong>{b.slot?.field_agent_name || 'Unassigned'}</strong></span>
                      <Link
                        href={`/staff/inspections/${b.id}`}
                        className="font-bold text-primary hover:underline"
                      >
                        {b.public_reference}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <Link
                  href="/staff/inspections/availability"
                  className="nestly-press w-full py-2.5 px-4 rounded-full bg-charcoal hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Configure More Slots</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
