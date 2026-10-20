'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { StaffHeader } from '@/components/staff/StaffHeader';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  Database,
  MessageSquare,
  Network,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';

import type { IntegrationStatus } from '@/lib/backend/staff-integrations';

export default function IntegrationsPage() {
  const [selectedService, setSelectedService] = useState<IntegrationStatus | null>(null);
  const [services, setServices] = useState<IntegrationStatus[]>([]);
  const [checkedAt, setCheckedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch('/api/staff/integrations', { cache: 'no-store', signal });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 403 ? 'Integration configuration is available to Platform Admin and Operations Lead roles.' : result.error || 'Unable to check integrations');
      if (signal?.aborted) return;
      setServices(result.data);
      setCheckedAt(result.checkedAt);
      setError('');
    } catch (error) {
      if (signal?.aborted) return;
      setServices([]);
      setError(error instanceof Error ? error.message : 'Unable to check integrations');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => refresh(controller.signal));
    return () => controller.abort();
  }, [refresh]);
  const modalRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!selectedService || !modalRef.current || prefersReducedMotion()) return;
    gsap.fromTo(
      modalRef.current,
      { scale: 0.97, y: 8, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' },
    );
  }, { dependencies: [selectedService] });

  useEffect(() => {
    if (!selectedService) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedService(null);
      if (event.key === 'Tab' && modalRef.current) {
        const targets = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'));
        const first = targets[0]; const last = targets[targets.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [selectedService]);

  const renderIcon = (type: string) => {
    switch (type) {
      case 'chat':
        return <MessageSquare className="w-5 h-5 text-[#ED572E]" />;
      case 'tree':
        return <Network className="w-5 h-5 text-[#173F35]" />;
      case 'database':
        return <Database className="w-5 h-5 text-[#202320]" />;
      case 'bot':
        return <Bot className="w-5 h-5 text-[#ED572E]" />;
      case 'meta':
        return <BadgeCheck className="w-5 h-5 text-[#173F35]" />;
      case 'shield':
        return <ShieldCheck className="w-5 h-5 text-[#173F35]" />;
      default:
        return <Server className="w-5 h-5 text-[#202320]" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader breadcrumbs={[{ label: 'Integrations Status' }]} />
      <div className="p-4 sm:p-8 space-y-8 pb-16 max-w-7xl mx-auto w-full">
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-[#202320]">
            <span className="font-bold uppercase tracking-wider text-amber-800 block mb-0.5">
              Read-only integration checks
            </span>
            Database access, Telegram bot identity and webhook destination are checked without sending messages. Nia configuration is reported separately from health; no AI reply is generated.
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#202320]/60 mb-1">
              <Activity className="w-3.5 h-3.5 text-[#ED572E]" />
              Integration checks
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#202320] tracking-tight">
              Integrations &amp; External Services
            </h1>
            <p className="text-sm text-[#202320]/70 mt-1">
              Current server configuration and bounded, read-only checks. No secrets or customer data are returned.
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading}
            className="shrink-0 rounded-full border border-hairline bg-white px-4 py-2 text-xs font-bold disabled:opacity-40">
            {loading ? 'Checking…' : 'Refresh checks'}
          </button>
        </div>

        {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
        {checkedAt && !error && <p className="text-xs text-muted-ink">Checked {new Date(checkedAt).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' })} WAT. Refresh to check again.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <div
              key={service.id}
              className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-[#202320]/10 flex items-center justify-center shadow-xs">
                    {renderIcon(service.iconType)}
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-soft-stone text-charcoal">
                    {service.label}
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#202320]/50 mb-1">
                  {service.category}
                </div>
                <h3 className="text-base font-bold text-[#202320] leading-snug">{service.name}</h3>
                <p className="text-xs text-[#202320]/70 mt-2 leading-relaxed">
                  {service.detail}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#202320]/10 space-y-3">
                <p className="text-[11px] text-[#202320]/60">Check type: {service.state === 'verified' ? 'Read-only check passed' : service.state}</p>
                <button
                  type="button"
                  onClick={() => setSelectedService(service)}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-[#202320]/15 bg-white hover:bg-[#202320]/5 text-xs font-bold text-[#202320] transition-colors"
                >
                  View status details
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedService && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedService.name} status`}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              onClick={() => setSelectedService(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />
            <div
              ref={modalRef}
              tabIndex={-1}
              className="relative z-10 max-h-[85dvh] overflow-y-auto bg-[#FCFBF8] border border-[#202320]/15 rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-[#202320]/10 flex items-center justify-center">
                    {renderIcon(selectedService.iconType)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#202320]">{selectedService.name}</h2>
                    <p className="text-xs text-[#202320]/60">{selectedService.category}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedService(null)}
                  aria-label="Close integration status details"
                  className="w-8 h-8 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 flex items-center justify-center text-[#202320] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-950">
                {selectedService.detail}
              </div>
              <div className="flex justify-end pt-4 border-t border-[#202320]/10">
                <button
                  type="button"
                  onClick={() => setSelectedService(null)}
                  className="px-6 py-2.5 rounded-full bg-[#202320] text-[#FCFBF8] text-xs font-bold hover:bg-[#202320]/90 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
