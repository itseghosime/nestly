'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import Link from 'next/link';
import { StaffHeader } from '@/components/staff/StaffHeader';
import {
  Calendar,
  Clock,
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Users,
} from 'lucide-react';

interface SlotItem {
  id: string;
  startsAt: string;
  day: string;
  dateStr: string;
  month: string;
  timeRange: string;
  status: 'Booked' | 'Available' | 'Unavailable';
  propertyTitle: string;
  agent: string;
  capacity: string;
  capacityLimit: number;
  reservedCount: number;
}

type PropertyChoice = { id: string; title: string; neighborhood: string | null };
type AgentChoice = { id: string; display_name: string; assigned_zone: string | null };
type WorkspaceSettings = {
  transit_buffer_mins: number;
  daylight_lock: boolean;
  daylight_start: string;
  daylight_end: string;
};

const SLOT_TIME_OPTIONS = [
  { value: '10:00|11:30', label: '10:00 – 11:30 WAT', start: '10:00', end: '11:30' },
  { value: '11:30|13:00', label: '11:30 – 13:00 WAT', start: '11:30', end: '13:00' },
  { value: '14:00|15:30', label: '14:00 – 15:30 WAT', start: '14:00', end: '15:30' },
  { value: '15:30|17:00', label: '15:30 – 17:00 WAT', start: '15:30', end: '17:00' },
];

function tomorrowInLagos() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const tomorrow = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + 1));
  return tomorrow.toISOString().slice(0, 10);
}

function formatSlot(slot: {
  id: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  capacity: number;
  reserved_count: number;
  field_agent_id: string | null;
  property_id: string;
}, properties: PropertyChoice[], agents: AgentChoice[]): SlotItem {
  const startsAt = new Date(slot.starts_at);
  const endsAt = new Date(slot.ends_at);
  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const parts = dateFormatter.formatToParts(startsAt);
  const datePart = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
  });
  const timeRange = `${timeFormatter.format(startsAt)}–${timeFormatter.format(endsAt)} WAT`;
  const property = properties.find((item) => item.id === slot.property_id);
  const agent = agents.find((item) => item.id === slot.field_agent_id);
  return {
    id: slot.id,
    startsAt: slot.starts_at,
    day: datePart('weekday').toUpperCase(),
    dateStr: datePart('day'),
    month: datePart('month').toUpperCase(),
    timeRange,
    status: !slot.is_active ? 'Unavailable' : slot.reserved_count > 0 ? 'Booked' : 'Available',
    propertyTitle: property
      ? `${property.title}${property.neighborhood ? ` (${property.neighborhood})` : ''}`
      : slot.property_id,
    agent: agent?.display_name || 'Unassigned',
    capacity: `${slot.capacity} max (${slot.reserved_count} reserved)`,
    capacityLimit: slot.capacity,
    reservedCount: slot.reserved_count,
  };
}

export default function AvailabilitySlotsPage() {
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [properties, setProperties] = useState<PropertyChoice[]>([]);
  const [agents, setAgents] = useState<AgentChoice[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceSettings>({
    transit_buffer_mins: 30,
    daylight_lock: false,
    daylight_start: '07:00:00',
    daylight_end: '18:00:00',
  });
  const [selectedProperty, setSelectedProperty] = useState('');
  const [slotDate, setSlotDate] = useState(tomorrowInLagos);
  const [slotTime, setSlotTime] = useState('10:00|11:30');
  const [assignedAgent, setAssignedAgent] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [transitBuffer, setTransitBuffer] = useState('30');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successToast, setSuccessToast] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [slotResponse, propertyResponse, agentResponse, workspaceResponse] = await Promise.all([
        fetch('/api/inspections/slots'),
        fetch('/api/inspections/properties'),
        fetch('/api/staff/agents'),
        fetch('/api/staff/workspace'),
      ]);
      const [slotResult, propertyResult, agentResult, workspaceResult] = await Promise.all([
        slotResponse.json(),
        propertyResponse.json(),
        agentResponse.json(),
        workspaceResponse.json(),
      ]);
      if (!slotResponse.ok) throw new Error(slotResult.error || 'Unable to load inspection slots');
      if (!propertyResponse.ok) throw new Error(propertyResult.error || 'Unable to load properties');
      if (!agentResponse.ok) throw new Error(agentResult.error || 'Unable to load field agents');
      if (!workspaceResponse.ok) throw new Error(workspaceResult.error || 'Unable to load workspace scheduling settings');
      const propertyChoices = propertyResult.data as PropertyChoice[];
      const agentChoices = agentResult.data as AgentChoice[];
      const schedulingSettings = workspaceResult.data as WorkspaceSettings;
      setProperties(propertyChoices);
      setAgents(agentChoices);
      setWorkspace(schedulingSettings);
      setTransitBuffer(String(schedulingSettings.transit_buffer_mins));
      setSlots((slotResult.data || []).map((slot: {
        id: string;
        property_id: string;
        agent_id?: string | null;
        field_agent_id?: string | null;
        starts_at: string;
        ends_at: string;
        capacity: number;
        reserved_count: number;
        is_active: boolean;
      }) => formatSlot({
        ...slot,
        field_agent_id: slot.field_agent_id ?? slot.agent_id ?? null,
      }, propertyChoices, agentChoices)));
      setSelectedProperty((current) => current || propertyChoices[0]?.id || '');
      setAssignedAgent((current) => current || agentChoices[0]?.id || '');
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load inspection scheduling data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  useGSAP(() => {
    if (prefersReducedMotion() || !listRef.current) return;
    const rows = listRef.current.querySelectorAll('[data-slot-row]');
    const last = rows[rows.length - 1];
    if (last) gsap.fromTo(last, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [slots.length] });
  useGSAP(() => {
    if (!successToast || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [successToast] });

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const [startTime, endTime] = slotTime.split('|');
    if (!selectedProperty || !startTime || !endTime) {
      setError('Select a property and valid time window.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/inspections/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedProperty,
          fieldAgentId: assignedAgent || null,
          startsAt: new Date(`${slotDate}T${startTime}:00+01:00`).toISOString(),
          endsAt: new Date(`${slotDate}T${endTime}:00+01:00`).toISOString(),
          capacity: Number(capacity),
          transitBufferMins: Number(transitBuffer),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create inspection slot');
      await loadData();
      setSuccessToast(true);
      window.setTimeout(() => setSuccessToast(false), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to create inspection slot');
    } finally {
      setSaving(false);
    }
  };

  const activeSlots = slots.filter((slot) => slot.status !== 'Unavailable');
  const totalCapacity = activeSlots.reduce((total, slot) => total + slot.capacityLimit, 0);
  const reservedCapacity = activeSlots.reduce((total, slot) => total + slot.reservedCount, 0);
  const capacityUtilization = totalCapacity
    ? Math.round((reservedCapacity / totalCapacity) * 100)
    : 0;
  const visibleSlotTimes = SLOT_TIME_OPTIONS.filter((option) => (
    !workspace.daylight_lock
    || (
      option.start >= workspace.daylight_start.slice(0, 5)
      && option.end <= workspace.daylight_end.slice(0, 5)
    )
  ));

  const handleDeleteSlot = async (id: string) => {
    setError('');
    try {
      const response = await fetch(`/api/inspections/slots/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'unavailable' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to deactivate inspection slot');
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to deactivate inspection slot');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[
          { label: 'Inspections', href: '/staff/inspections' },
          { label: 'Availability Slots' },
        ]}
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
          <div className="space-y-1">
            <Link
              href="/staff/inspections"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-ink hover:text-charcoal mb-1 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Calendar</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold px-2.5 py-0.5 rounded-full bg-soft-stone border border-hairline">
                Live Daylight Allocation Engine
              </span>
              <span className="text-xs text-muted-ink font-semibold">
                Africa/Lagos (WAT · UTC+1)
              </span>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Property Inspection Windows
            </h1>
            <p className="text-sm text-charcoal/70 max-w-2xl">
              Configure daylight physical viewing dates, times, and keyholder capacity.
            </p>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Metric Overview Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-3xl bg-white shadow-sm border border-hairline flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-muted-ink uppercase tracking-wider">
                Configured Windows
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-headline text-3xl font-bold text-charcoal">{activeSlots.length}</span>
                <span className="text-xs text-muted-ink font-bold">active</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-soft-stone text-primary flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white shadow-sm border border-hairline flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-muted-ink uppercase tracking-wider">
                Capacity Utilized
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-headline text-3xl font-bold text-charcoal">{capacityUtilization}%</span>
                <span className="text-xs text-muted-ink">{reservedCapacity}/{totalCapacity} reserved</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-persimmon/10 text-persimmon flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white shadow-sm border border-hairline flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-muted-ink uppercase tracking-wider">
                Daylight Window
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-headline text-2xl font-bold text-charcoal">
                  {workspace.daylight_start.slice(0, 5)}–{workspace.daylight_end.slice(0, 5)}
                </span>
                <span className="text-xs text-muted-ink font-bold">
                  {workspace.daylight_lock ? 'Enforced' : 'Configured'}
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 2-Column Workspace: Active Slots (7 cols) + Slot Editor (5 cols) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          {/* Active Slots List */}
          <div className="xl:col-span-7 space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="font-headline text-base font-bold text-charcoal">
                Configured Inspection Timetable
              </h2>
              <span className="text-xs text-muted-ink font-semibold">
                {activeSlots.length} Active Slots
              </span>
            </div>

            <div ref={listRef} className="space-y-3">
              {loading ? (
                <p className="rounded-2xl bg-white p-5 text-sm text-muted-ink">Loading inspection slots…</p>
              ) : slots.length === 0 ? (
                <p className="rounded-2xl bg-white p-5 text-sm text-muted-ink">No inspection slots have been configured.</p>
              ) : slots.map((s) => (
                <div
                  key={s.id}
                  data-slot-row
                  className="p-5 rounded-3xl bg-white shadow-sm border border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex flex-col items-center justify-center bg-soft-stone px-3 py-2 rounded-2xl w-14 shrink-0 text-center border border-hairline">
                      <span className="text-[10px] font-bold text-muted-ink">{s.day}</span>
                      <span className="font-headline text-lg font-bold text-charcoal leading-tight">
                        {s.dateStr}
                      </span>
                      <span className="text-[10px] font-bold text-muted-ink">{s.month}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-charcoal">{s.timeRange}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            s.status === 'Booked'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-charcoal/80 font-medium">{s.propertyTitle}</p>
                      <p className="text-[11px] text-muted-ink">
                        Officer: <strong>{s.agent}</strong> · {s.capacity}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteSlot(s.id)}
                    disabled={s.status === 'Unavailable'}
                    aria-label={`Deactivate slot for ${s.propertyTitle}`}
                    className="self-end sm:self-center p-2 rounded-full hover:bg-soft-stone text-muted-ink hover:text-persimmon transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Create New Slot Form */}
          <div className="xl:col-span-5 bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-5 sticky top-24">
            <div className="pb-3 border-b border-hairline">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Window Provisioning
              </span>
              <h3 className="font-headline text-base font-bold text-charcoal mt-0.5">
                Add Availability Slot
              </h3>
            </div>

            <form onSubmit={handleCreateSlot} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-charcoal mb-1">Target Residence</label>
                <select
                  value={selectedProperty}
                  onChange={(e) => setSelectedProperty(e.target.value)}
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                >
                  <option value="">Select a property</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}{p.neighborhood ? ` (${p.neighborhood})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">Date</label>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-charcoal mb-1">Daylight Window (WAT)</label>
                  <select
                    value={slotTime}
                    onChange={(e) => setSlotTime(e.target.value)}
                    className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                  >
                    <option value="">Select a time</option>
                    {visibleSlotTimes.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-charcoal mb-1">Max Visitors</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">Field Escort Agent (optional)</label>
                <select
                  value={assignedAgent}
                  onChange={(e) => setAssignedAgent(e.target.value)}
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                >
                  <option value="">Unassigned</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.display_name}{agent.assigned_zone ? ` (${agent.assigned_zone})` : ' (Unassigned zone)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-charcoal mb-1">Transit Buffer (minutes)</label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={transitBuffer}
                  onChange={(e) => setTransitBuffer(e.target.value)}
                  className="w-full bg-warm rounded-full px-4 py-2.5 border border-hairline text-charcoal"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || saving || !properties.length}
                  className="w-full py-3 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white font-bold transition-all shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving slot…' : 'Add Inspection Slot'}
                </button>
              </div>
            </form>

            {successToast && (
              <div ref={toastRef} className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Slot added to active timetable!</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
