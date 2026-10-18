'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { StaffHeader } from '@/components/staff/StaffHeader';
import {
  FileText,
  Search,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  Home,
  Calendar,
  Lock,
  Code,
  X,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Shield,
  ArrowRight,
} from 'lucide-react';

interface ExtendedAuditItem {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  category: string;
  ipAddress?: string;
  status: 'Success' | 'Flagged' | 'Pending' | 'Recorded';
  actorType?: string;
  terminalRef?: string;
  authMethod?: string;
  deltaBefore?: string;
  deltaAfter?: string;
  rawPayload?: Record<string, unknown>;
}

function formatAuditTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(date);
}

const EXTENDED_LOGS: ExtendedAuditItem[] = [
  {
    id: 'EV-2026-1027-00918',
    timestamp: 'Today 14:15:22 WAT',
    actor: 'Osamwonyi E. (Coordinator)',
    action: 'Claimed Inquiry Triage',
    target: 'Conv #8491 (Osasere I.)',
    category: 'Concierge',
    ipAddress: '197.210.65.12 (Desk-02)',
    status: 'Success',
    terminalRef: 'Desk-02',
    authMethod: 'Hardware FIDO2 WebAuthn',
    deltaBefore: 'assigned_agent: null',
    deltaAfter: 'assigned_agent: "usr_osa_02"',
    rawPayload: {
      version: 'v2.1',
      event: 'INQUIRY_TRIAGE_CLAIMED',
      conversation_id: 'conv_8491',
      actor_id: 'usr_osa_02',
      session_channel: 'Internal Desk Console',
      timestamp: '2026-10-27T14:15:22+01:00'
    }
  },
  {
    id: 'EV-2026-1027-00912',
    timestamp: 'Today 13:50:08 WAT',
    actor: 'Tunde Adebayo (Admin)',
    action: 'Updated Property Draft',
    target: 'NST-EDO-003 (The Oredo Haven)',
    category: 'Property',
    ipAddress: '102.89.44.19 (Desk-01)',
    status: 'Success',
    terminalRef: 'Desk-01',
    authMethod: 'MFA Push App',
    deltaBefore: 'annual_rent_ngn: 2400000',
    deltaAfter: 'annual_rent_ngn: 2500000',
    rawPayload: {
      version: 'v2.1',
      event: 'PROPERTY_PRICE_AMENDMENT',
      property_id: 'prop-gra-01',
      actor_id: 'usr_tun_01',
      edogis_sync: true,
      timestamp: '2026-10-27T13:50:08+01:00'
    }
  },
  {
    id: 'EV-2026-1027-00905',
    timestamp: 'Today 11:30:00 WAT',
    actor: 'System Coordinator (Daemon)',
    action: 'Generated Viewing Slot',
    target: 'SLT-88210 (Boundary Rd)',
    category: 'Inspection',
    ipAddress: 'Internal System Loopback',
    status: 'Success',
    terminalRef: 'Scheduler-Daemon-WAF1',
    authMethod: 'System Service Token',
    deltaBefore: 'slot_status: "unallocated"',
    deltaAfter: 'slot_status: "open_daylight"',
    rawPayload: {
      version: 'v2.1',
      event: 'SCHEDULE_SLOT_DISPATCH',
      slot_id: 'SLT-88210',
      daylight_verified: true,
      timestamp: '2026-10-27T11:30:00+01:00'
    }
  },
  {
    id: 'EV-2026-1027-00898',
    timestamp: 'Today 09:20:41 WAT',
    actor: 'Osamwonyi E. (Coordinator)',
    action: 'Rescheduled Inspection',
    target: 'NST-DEMO-REQ-004',
    category: 'Inspection',
    ipAddress: '197.210.65.12 (Desk-02)',
    status: 'Success',
    terminalRef: 'Desk-02',
    authMethod: 'Hardware FIDO2 WebAuthn',
    deltaBefore: 'time_slot: "11:00 - 12:30 WAT"',
    deltaAfter: 'time_slot: "15:00 - 16:30 WAT"',
    rawPayload: {
      version: 'v2.1',
      event: 'INSPECTION_WINDOW_UPDATE',
      request_id: 'req_004',
      reason: 'Customer requested afternoon slot',
      timestamp: '2026-10-27T09:20:41+01:00'
    }
  },
  {
    id: 'EV-2026-1027-00870',
    timestamp: 'Yesterday 16:40:19 WAT',
    actor: 'Tunde Adebayo (Admin)',
    action: 'Issued Staff Invite',
    target: 'staff@example.com',
    category: 'Security',
    ipAddress: '102.89.44.19 (Desk-01)',
    status: 'Success',
    terminalRef: 'Desk-01',
    authMethod: 'MFA Push App',
    deltaBefore: 'user_state: null',
    deltaAfter: 'user_state: "invited_coordinator"',
    rawPayload: {
      version: 'v2.1',
      event: 'STAFF_INVITATION_ISSUED',
      target_email: 'staff@example.com',
      assigned_role: 'Operations Coordinator',
      expiry_hours: 48,
      timestamp: '2026-10-26T16:40:19+01:00'
    }
  },
  {
    id: 'EV-2026-1027-00862',
    timestamp: 'Yesterday 14:10:55 WAT',
    actor: 'Sarah Momodu (Escort)',
    action: 'Completed Walkthrough Note',
    target: 'NST-EV-409 (Clinic Rd)',
    category: 'Property',
    ipAddress: '197.210.65.11 (Mobile iOS)',
    status: 'Success',
    terminalRef: 'Field-Mobile-App-v1.4',
    authMethod: 'Biometric FaceID',
    deltaBefore: 'inspection_status: "in_progress"',
    deltaAfter: 'inspection_status: "completed_verified"',
    rawPayload: {
      version: 'v2.1',
      event: 'WALKTHROUGH_SIGN_OFF',
      inspection_id: 'NST-EV-409',
      key_custody_returned: true,
      timestamp: '2026-10-26T14:10:55+01:00'
    }
  }
];

export default function AuditLogPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('24h');
  const [selectedEvent, setSelectedEvent] = useState<ExtendedAuditItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<ExtendedAuditItem[]>(
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? EXTENDED_LOGS : [],
  );
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const [csvToast, setCsvToast] = useState(false);
  const [csvMessage, setCsvMessage] = useState('');

  const loadLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        period: dateFilter,
      });
      if (categoryFilter !== 'All') params.set('category', categoryFilter);
      const response = await fetch(`/api/staff/audit-logs?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load audit history');
      setLogs(result.data as ExtendedAuditItem[]);
      setTotal(result.total || 0);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load audit history');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, dateFilter, page]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadLogs();
    });
    return () => {
      active = false;
    };
  }, [loadLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      categoryFilter === 'All' ||
      log.category.toLowerCase() === categoryFilter.toLowerCase();

    return matchesSearch && matchesCategory;
  });

  useGSAP(() => {
    if (prefersReducedMotion() || !tableBodyRef.current) return;
    const rows = tableBodyRef.current.querySelectorAll('tr');
    if (!rows.length) return;
    gsap.fromTo(rows, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.16, stagger: 0.018, ease: MOTION.ease.crispOut, overwrite: 'auto', clearProps: 'transform,opacity' });
  }, { dependencies: [searchTerm, categoryFilter, logs.length], scope: tableBodyRef });
  useGSAP(() => {
    if (!selectedEvent || !drawerRef.current || prefersReducedMotion()) return;
    gsap.fromTo(drawerRef.current, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.22, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [selectedEvent] });
  useEffect(() => {
    if (!selectedEvent) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEvent(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent]);

  useGSAP(() => {
    if (!csvToast || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [csvToast] });

  const handleCopyPayload = (payload: unknown) => {
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError('Unable to copy the redacted event details.'));
  };

  const handleExportCSV = async () => {
    try {
      const params = new URLSearchParams({ format: 'csv', period: dateFilter });
      if (categoryFilter !== 'All') params.set('category', categoryFilter);
      const response = await fetch(`/api/staff/audit-logs?${params}`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Unable to export audit history');
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'nestly-audit-redacted.csv';
      link.click();
      URL.revokeObjectURL(objectUrl);
      setError('');
      setCsvMessage(response.headers.get('X-Export-Truncated') === 'true'
        ? 'Redacted CSV downloaded; export is limited to the first 1,000 records.'
        : 'Redacted audit CSV downloaded.');
      setCsvToast(true);
      setTimeout(() => setCsvToast(false), 3000);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to export audit history');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader breadcrumbs={[{ label: 'Audit Log' }]} />
      <div className="p-4 sm:p-8 space-y-8 pb-16 max-w-7xl mx-auto w-full">
      {/* Toast Notification */}
      {csvToast && (
        <div
          ref={toastRef}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 bg-[#202320] text-[#FCFBF8] rounded-2xl shadow-2xl border border-[#ED572E]/20"
        >
          <CheckCircle2 className="w-5 h-5 text-[#ED572E] shrink-0" />
            <span className="text-sm font-medium">{csvMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#202320]/60 mb-1">
            <FileText className="w-3.5 h-3.5 text-[#ED572E]" />
            Archival Audit Log · S16
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#202320] tracking-tight">
            System Audit Log
          </h1>
          <p className="text-sm text-[#202320]/70 mt-1">
            Immutable operations telemetry, staff access logs, and inspection state modifications.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExportCSV()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#202320]/15 bg-white text-xs font-bold text-[#202320] hover:bg-[#202320]/5 shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download Redacted CSV
          </button>
        </div>
      </div>

      {/* Metric Bento Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-[#FCFBF8] border border-[#202320]/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/60">Events in period</span>
            <Clock className="w-4 h-4 text-[#ED572E]" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#202320]">{total}</div>
          <div className="text-xs text-[#202320]/60 mt-1">Authorized, metadata-redacted records</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#FCFBF8] border border-[#202320]/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/60">Property events (page)</span>
            <Home className="w-4 h-4 text-[#173F35]" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#202320]">{logs.filter((log) => log.category === 'property').length}</div>
          <div className="text-xs text-[#202320]/60 mt-1">Current page only</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#FCFBF8] border border-[#202320]/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/60">Inspection events (page)</span>
            <Calendar className="w-4 h-4 text-[#ED572E]" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#202320]">{logs.filter((log) => log.category === 'inspection').length}</div>
          <div className="text-xs text-[#202320]/60 mt-1">Current page only</div>
        </div>

        <div className="p-5 rounded-2xl bg-[#FCFBF8] border border-[#202320]/10 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/60">Conversation/offer events</span>
            <Lock className="w-4 h-4 text-[#202320]/70" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#202320]">{logs.filter((log) => ['conversation', 'offer'].includes(log.category)).length}</div>
          <div className="text-xs text-[#202320]/60 mt-1">Current page only</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[#FCFBF8] p-4 rounded-2xl border border-[#202320]/10 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#202320]/40 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search this page by action or entity identifier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-[#202320]/15 bg-white text-[#202320] focus:outline-none focus:ring-2 focus:ring-[#ED572E]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date range toggle */}
          <div className="inline-flex p-1 bg-[#202320]/5 rounded-xl border border-[#202320]/10 text-xs font-semibold">
            <button
              onClick={() => {
                setDateFilter('24h');
                setPage(1);
                setLoading(true);
              }}
              className={`px-3 py-1 rounded-lg transition-colors ${
                dateFilter === '24h' ? 'bg-white text-[#202320] shadow-sm' : 'text-[#202320]/60 hover:text-[#202320]'
              }`}
            >
              Past 24h
            </button>
            <button
              onClick={() => {
                setDateFilter('7d');
                setPage(1);
                setLoading(true);
              }}
              className={`px-3 py-1 rounded-lg transition-colors ${
                dateFilter === '7d' ? 'bg-white text-[#202320] shadow-sm' : 'text-[#202320]/60 hover:text-[#202320]'
              }`}
            >
              Past 7 Days
            </button>
            <button
              onClick={() => {
                setDateFilter('month');
                setPage(1);
                setLoading(true);
              }}
              className={`px-3 py-1 rounded-lg transition-colors ${
                dateFilter === 'month' ? 'bg-white text-[#202320] shadow-sm' : 'text-[#202320]/60 hover:text-[#202320]'
              }`}
            >
              This month
            </button>
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#202320]/15 bg-white text-xs font-semibold text-[#202320]">
            <Filter className="w-3.5 h-3.5 text-[#ED572E]" />
            <select
              aria-label="Category filter"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setPage(1);
                setLoading(true);
              }}
              className="bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="All">All Categories</option>
              <option value="property">Property Listings</option>
              <option value="inspection">Inspection Slots</option>
              <option value="conversation">Concierge Handoffs</option>
              <option value="offer">Offers</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#202320]/5 text-[#202320]/70 uppercase tracking-wider font-bold border-b border-[#202320]/10">
              <tr>
                <th className="py-4 px-6">Timestamp (WAT)</th>
                <th className="py-4 px-6">Actor</th>
                <th className="py-4 px-6">Action Performed</th>
                <th className="py-4 px-6">Entity Affected</th>
                <th className="py-4 px-6">Actor Type</th>
                <th className="py-4 px-6 text-right">Telemetry</th>
              </tr>
            </thead>
            <tbody ref={tableBodyRef} className="divide-y divide-[#202320]/10 text-[#202320]">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-ink">Loading audit history…</td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-muted-ink">No audit records match the current filters.</td></tr>
              ) : filteredLogs.map((item) => (
                <tr key={item.id} className="hover:bg-white/80 transition-colors">
                  <td className="py-4 px-6 font-mono text-xs whitespace-nowrap">
                    {formatAuditTimestamp(item.timestamp)}
                  </td>
                  <td className="py-4 px-6">
                    <div className="font-bold">{item.actor}</div>
                    <div className="text-[11px] text-[#202320]/60 font-mono">{item.actorType || 'Demo record'}</div>
                  </td>
                  <td className="py-4 px-6">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#DDE7DB] text-[#173F35]">
                      {item.action}
                    </span>
                  </td>
                  <td className="py-4 px-6 font-medium">
                    {item.target}
                  </td>
                  <td className="py-4 px-6 text-[#202320]/70">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ED572E]"></span>
                      {item.actorType || 'Demo record'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <button
                      onClick={() => setSelectedEvent(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#202320]/15 hover:border-[#ED572E] text-xs font-bold text-[#202320] hover:text-[#ED572E] bg-white transition-colors"
                    >
                      <Code className="w-3.5 h-3.5" />
                      Redacted details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="py-4 px-6 border-t border-[#202320]/10 flex items-center justify-between text-xs text-[#202320]/60">
          <span>
            {total === 0 ? 'No records' : `Displaying ${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total} events · Page ${page} / ${Math.max(1, Math.ceil(total / 50))}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPage((current) => Math.max(1, current - 1));
                setSelectedEvent(null);
                setLoading(true);
              }}
              disabled={page === 1 || loading}
              className="p-2 rounded-lg border border-[#202320]/10 text-[#202320] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPage((current) => current + 1);
                setSelectedEvent(null);
                setLoading(true);
              }}
              disabled={page >= Math.ceil(total / 50) || loading}
              className="p-2 rounded-lg border border-[#202320]/10 hover:bg-white text-[#202320] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Slideover / Drawer for Telemetry Payload */}
      {selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Event Telemetry Payload"
          className="fixed inset-0 z-50 overflow-hidden flex justify-end"
        >
          <div
            onClick={() => setSelectedEvent(null)}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />
          <div ref={drawerRef} className="relative z-10 w-full max-w-xl bg-[#FCFBF8] h-full shadow-2xl flex flex-col border-l border-[#202320]/10">
            {/* Drawer Header */}
            <div className="p-6 border-b border-[#202320]/10 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono text-[#ED572E] font-bold">
                  <Shield className="w-3.5 h-3.5" />
                  {selectedEvent.id}
                </div>
                <h3 className="text-lg font-extrabold text-[#202320] mt-0.5">
                  Event Telemetry Payload
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                aria-label="Close payload drawer"
                className="w-8 h-8 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 flex items-center justify-center text-[#202320] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Actor Signature Card */}
              <div className="p-4 rounded-2xl bg-white border border-[#202320]/10 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#202320]/60">
                  Actor & Session Signature
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#202320]/50 block">Operator Identity:</span>
                    <span className="font-bold text-[#202320]">{selectedEvent.actor}</span>
                  </div>
                  <div>
                    <span className="text-[#202320]/50 block">Actor type:</span>
                      <span className="font-mono text-[#202320]">{selectedEvent.actorType || 'System Service'}</span>
                  </div>
                  <div>
                      <span className="text-[#202320]/50 block">Event ID:</span>
                      <span className="font-mono text-[#202320]">{selectedEvent.id}</span>
                  </div>
                  <div>
                    <span className="text-[#202320]/50 block">Execution Time:</span>
                    <span className="font-mono text-[#202320]">{formatAuditTimestamp(selectedEvent.timestamp)}</span>
                  </div>
                </div>
              </div>

              {/* State Delta */}
              {selectedEvent.deltaBefore && (
                <div className="p-4 rounded-2xl bg-white border border-[#202320]/10 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#202320]/60">
                    State Delta
                  </span>
                  <div className="flex items-center gap-3 text-xs font-mono p-3 rounded-xl bg-[#202320]/5">
                    <span className="text-red-600 line-through">{selectedEvent.deltaBefore}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#202320]/50 shrink-0" />
                    <span className="text-green-700 font-bold">{selectedEvent.deltaAfter}</span>
                  </div>
                </div>
              )}

              {/* Raw JSON */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/70">
                    Normalized Event JSON
                  </span>
                  <button
                    onClick={() => handleCopyPayload(selectedEvent.rawPayload)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 text-xs font-semibold text-[#202320] transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-[#173F35]" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy Object'}
                  </button>
                </div>
                <pre className="p-4 rounded-2xl bg-[#202320] text-[#FCFBF8] text-xs font-mono overflow-x-auto leading-relaxed">
                  {JSON.stringify(selectedEvent.rawPayload || selectedEvent, null, 2)}
                </pre>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-6 border-t border-[#202320]/10 flex items-center justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-6 py-2.5 rounded-full bg-[#202320] text-[#FCFBF8] text-xs font-bold hover:bg-[#202320]/90 transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
