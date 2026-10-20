'use client';

import React, { useEffect, useRef, useState } from 'react';
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

interface IntegrationDirectoryEntry {
  id: string;
  name: string;
  category: string;
  iconType: string;
}

const INTEGRATION_DIRECTORY: IntegrationDirectoryEntry[] = [
  { id: 'twilio-wa', name: 'Twilio WhatsApp (deferred)', category: 'Historical Channel', iconType: 'chat' },
  { id: 'n8n-workflow', name: 'n8n Operations Orchestration', category: 'Event Automation', iconType: 'tree' },
  { id: 'supabase-db', name: 'Supabase Database', category: 'Core Data Backend', iconType: 'database' },
  { id: 'gemini-ai', name: 'Gemini AI', category: 'Assistant Intelligence', iconType: 'bot' },
  { id: 'meta-wa', name: 'Meta WhatsApp Cloud API (deferred)', category: 'Not Active', iconType: 'meta' },
  { id: 'prembly-kyc', name: 'Prembly / Identitypass', category: 'Identity Verification', iconType: 'shield' },
  { id: 'termii-sms', name: 'Termii SMS', category: 'SMS & OTP', iconType: 'chat' },
  { id: 'edogis-cadastre', name: 'EDOGIS Cadastre', category: 'Geographic Cadastre', iconType: 'server' },
];

export default function IntegrationsPage() {
  const [selectedService, setSelectedService] = useState<IntegrationDirectoryEntry | null>(null);
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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
              Live integration status unavailable
            </span>
            This directory does not read provider health or configuration. A listed service is not evidence that it is connected or operational; this page does not send test pings or resynchronize services.
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#202320]/60 mb-1">
              <Activity className="w-3.5 h-3.5 text-[#ED572E]" />
              Integration directory
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#202320] tracking-tight">
              Integrations &amp; External Services
            </h1>
            <p className="text-sm text-[#202320]/70 mt-1">
              Reference categories only; connection details have not been verified here.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            Status unavailable
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {INTEGRATION_DIRECTORY.map((service) => (
            <div
              key={service.id}
              className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-[#202320]/10 flex items-center justify-center shadow-xs">
                    {renderIcon(service.iconType)}
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                    Status unavailable
                  </span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#202320]/50 mb-1">
                  {service.category}
                </div>
                <h3 className="text-base font-bold text-[#202320] leading-snug">{service.name}</h3>
                <p className="text-xs text-[#202320]/70 mt-2 leading-relaxed">
                  Live connection state and provider configuration are not available from this workspace.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#202320]/10 space-y-3">
                <p className="text-[11px] text-[#202320]/60">Health checks: unavailable</p>
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
              className="relative z-10 bg-[#FCFBF8] border border-[#202320]/15 rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl space-y-6"
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
                Live configuration, health telemetry, sample payloads, and retry policy are not available here.
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
