'use client';

import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { StaffHeader } from '@/components/staff/StaffHeader';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  Network,
  Database,
  Bot,
  BadgeCheck,
  ShieldCheck,
  Server,
  X,
  Code,
  RotateCw,
  Activity,
} from 'lucide-react';
import { IntegrationService } from '@/lib/fixtures/staff';

interface ExtendedService extends IntegrationService {
  id: string;
  iconType: string;
  endpointSample: string;
  payloadSample: Record<string, unknown>;
  retryPolicy: string;
}

const ALL_INTEGRATIONS: ExtendedService[] = [
  {
    id: 'twilio-wa',
    name: 'Twilio WhatsApp (Nia AI Endpoint)',
    category: 'Omnichannel Messaging',
    status: 'Operational',
    latency: '180ms',
    description: 'Inbound and outbound messaging integration for customer WhatsApp communications and automated inquiry notifications.',
    lastHeartbeat: '2 mins ago (14:21 WAT)',
    iconType: 'chat',
    endpointSample: 'https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json',
    payloadSample: {
      channel: 'whatsapp',
      from: 'whatsapp:+2348000NESTLY',
      to: 'whatsapp:+2348035550192',
      event: 'INSPECTION_CONFIRMED',
      body: 'Your inspection for The Residence at Boundary Rd is confirmed for 14:00 WAT.'
    },
    retryPolicy: 'Exponential backoff with 3 retries over 5 minutes. Fallback to SMS via Termii.'
  },
  {
    id: 'n8n-workflow',
    name: 'n8n Operations Orchestration',
    category: 'Event Automation Engine',
    status: 'Operational',
    latency: '95ms',
    description: 'Workflow automation connector designed to handle scheduled triggers and synchronize operations events with regional databases.',
    lastHeartbeat: '30s ago (14:23 WAT)',
    iconType: 'tree',
    endpointSample: 'https://workflows.nestly.ng/webhook/v1/property-inspection-scheduled',
    payloadSample: {
      workflow_id: 'n8n_wf_8821',
      trigger: 'INSPECTION_CREATED',
      customer_id: 'cust-01',
      inspector_id: 'usr_osa_02',
      timestamp: '2026-10-27T14:23:00+01:00'
    },
    retryPolicy: 'Immediate queue retry on 5xx errors; dead-letter triage queue after 5 failed attempts.'
  },
  {
    id: 'supabase-db',
    name: 'Supabase Regional Cluster',
    category: 'Core Data Backend',
    status: 'Operational',
    latency: '45ms',
    description: 'Core data backend configured for properties, customer directory records, and application logs storage with RLS governance.',
    lastHeartbeat: '15s ago (14:23 WAT)',
    iconType: 'database',
    endpointSample: 'https://project-ref.supabase.co/rest/v1/properties',
    payloadSample: {
      table: 'properties',
      filter: 'region=eq.Edo&status=eq.Available',
      rls_policy: 'staff_authenticated_read',
      latency_profile: 'optimized_cache'
    },
    retryPolicy: 'Built-in connection pooler failover to secondary replica in West Africa Zone.'
  },
  {
    id: 'gemini-ai',
    name: 'Gemini AI Vision & Intake Engine',
    category: 'Assistant Intelligence',
    status: 'Operational',
    latency: '310ms',
    description: 'AI service intended for assistant intelligence, automated property summary draft generation, and photographic compliance checks.',
    lastHeartbeat: '4 mins ago (14:19 WAT)',
    iconType: 'bot',
    endpointSample: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    payloadSample: {
      model: 'gemini-1.5-pro',
      prompt_type: 'PROPERTY_COMPLIANCE_AUDIT',
      photo_verified: true,
      natural_light_score: 0.94
    },
    retryPolicy: 'Graceful degradation to deterministic template generator if latency exceeds 2.5s.'
  },
  {
    id: 'meta-wa',
    name: 'Meta Cloud API Official Channel',
    category: 'Direct Onboarding',
    status: 'Configured (Sandbox)',
    latency: '220ms',
    description: 'Official channel onboarding and account association flow for company WhatsApp business green-badge profiles.',
    lastHeartbeat: '1 hour ago (13:15 WAT)',
    iconType: 'meta',
    endpointSample: 'https://graph.facebook.com/v19.0/PHONE_NUMBER_ID/messages',
    payloadSample: {
      messaging_product: 'whatsapp',
      template_name: 'inspection_gate_pass_v1',
      language: { code: 'en_NG' },
      status: 'sandbox_verified'
    },
    retryPolicy: 'Standard Graph API webhook retry queue.'
  },
  {
    id: 'prembly-kyc',
    name: 'Prembly / Identitypass (NIN/BVN Vetting)',
    category: 'KYC & Verification',
    status: 'Operational',
    latency: '340ms',
    description: 'Instant Nigerian National Identity Number (NIN) and verified landlord identity verification.',
    lastHeartbeat: '1 min ago (14:22 WAT)',
    iconType: 'shield',
    endpointSample: 'https://api.identitypass.com/api/v2/biometrics/merchant/data/verification/nin',
    payloadSample: {
      verification_type: 'NIN_DIRECT',
      status: 'VERIFIED_EDO_RESIDENT',
      nin_masked: '2910****391',
      match_confidence: 99.8
    },
    retryPolicy: 'Single automatic retry on network timeout; manual staff escalation if identity is unconfirmed.'
  },
  {
    id: 'termii-sms',
    name: 'Termii SMS Gateway (Nigeria)',
    category: 'SMS & OTP Dispatch',
    status: 'Operational',
    latency: '120ms',
    description: 'One-time passwords, gate access pass SMS dispatch, and field physical inspection safety alerts.',
    lastHeartbeat: '30s ago (14:23 WAT)',
    iconType: 'chat',
    endpointSample: 'https://api.ng.termii.com/api/sms/send',
    payloadSample: {
      to: '2348035550192',
      from: 'NESTLY-PASS',
      sms: 'Your Gate Entry Pass for GRA Villa is #GRA-441. Show to security.',
      type: 'plain',
      channel: 'dnd'
    },
    retryPolicy: 'Dual-telco auto-routing between MTN, Airtel, and Glo routes.'
  },
  {
    id: 'edogis-cadastre',
    name: 'EDOGIS Cadastre & Land Registry',
    category: 'Geographic Cadastre',
    status: 'Operational',
    latency: '410ms',
    description: 'Edo State Geographic Information Service parcel lookup, survey plan coordinate cross-checks, and C-of-O title validation.',
    lastHeartbeat: '5 mins ago (14:18 WAT)',
    iconType: 'server',
    endpointSample: 'https://cadastre.edogis.gov.ng/api/v1/parcels/verify',
    payloadSample: {
      survey_beacon: 'ED/2024/9912',
      parcel_zone: 'Oredo Local Govt Area',
      c_of_o_status: 'REGISTERED_FREE_OF_ENCUMBRANCE'
    },
    retryPolicy: 'Batch queue retry during government registry maintenance windows.'
  }
];

export default function IntegrationsPage() {
  const [isResyncing, setIsResyncing] = useState(false);
  const [selectedService, setSelectedService] = useState<ExtendedService | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'payload' | 'retry'>('payload');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleResyncAll = () => {
    setIsResyncing(true);
    setTimeout(() => {
      setIsResyncing(false);
      showToast('All 8 external integration clusters and webhooks re-synced successfully.');
    }, 800);
  };

  useGSAP(() => {
    if (!selectedService || !modalRef.current || prefersReducedMotion()) return;
    gsap.fromTo(modalRef.current, { scale: 0.97, y: 8, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [selectedService] });
  useGSAP(() => {
    if (!toastMessage || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [toastMessage] });

  const handleTestPing = (serviceName: string) => {
    showToast(`Test heartbeat dispatched to ${serviceName} (Latency: OK)`);
  };

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
      {/* Toast Notification */}
      {toastMessage && (
        <div
          ref={toastRef}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 bg-[#202320] text-[#FCFBF8] rounded-2xl shadow-2xl border border-[#ED572E]/20"
        >
          <CheckCircle2 className="w-5 h-5 text-[#ED572E] shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Illustrative Architecture Notice Banner */}
      <div className="p-4 rounded-2xl bg-[#ED572E]/10 border border-[#ED572E]/20 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-[#ED572E] shrink-0 mt-0.5" />
        <div className="text-xs text-[#202320]">
          <span className="font-bold uppercase tracking-wider text-[#ED572E] block mb-0.5">
            Design State · Illustrative Architecture Notice
          </span>
          These telemetry cards represent frontend design states and operational mockups. Actual API connections and live webhooks must be verified against backend production environments.
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#202320]/60 mb-1">
            <Activity className="w-3.5 h-3.5 text-[#ED572E]" />
            Service Orchestration · S17
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#202320] tracking-tight">
            Integrations & External Services
          </h1>
          <p className="text-sm text-[#202320]/70 mt-1">
            Overview of external services, messaging pipelines, and planned integrations for the Nestly platform.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-[#202320]/60 font-mono hidden sm:inline">
            Cluster: West-Africa-1
          </span>
          <button
            onClick={handleResyncAll}
            disabled={isResyncing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#202320] text-[#FCFBF8] text-xs font-bold hover:bg-[#202320]/90 transition-all shadow-sm"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isResyncing ? 'animate-spin' : ''}`} />
            {isResyncing ? 'Re-syncing...' : 'Re-sync All Clusters'}
          </button>
        </div>
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {ALL_INTEGRATIONS.map((service) => (
          <div
            key={service.id}
            className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div>
              {/* Card top */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-white border border-[#202320]/10 flex items-center justify-center shadow-xs">
                  {renderIcon(service.iconType)}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold ${
                    service.status === 'Operational'
                      ? 'bg-[#DDE7DB] text-[#173F35]'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      service.status === 'Operational' ? 'bg-[#173F35]' : 'bg-amber-600'
                    }`}
                  ></span>
                  {service.status}
                </span>
              </div>

              {/* Title & Category */}
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#202320]/50 mb-1">
                {service.category}
              </div>
              <h3 className="text-base font-bold text-[#202320] leading-snug">
                {service.name}
              </h3>
              <p className="text-xs text-[#202320]/70 mt-2 leading-relaxed">
                {service.description}
              </p>
            </div>

            {/* Card Footer */}
            <div className="mt-6 pt-4 border-t border-[#202320]/10 space-y-3">
              <div className="flex items-center justify-between text-[11px] text-[#202320]/60">
                <span>Latency: <strong className="text-[#202320]">{service.latency}</strong></span>
                <span>Heartbeat: {service.lastHeartbeat}</span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setSelectedService(service)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-[#202320]/15 bg-white hover:bg-[#202320]/5 text-xs font-bold text-[#202320] transition-colors"
                >
                  <Code className="w-3.5 h-3.5 text-[#ED572E]" />
                  View Details
                </button>
                <button
                  onClick={() => handleTestPing(service.name)}
                  className="py-2 px-3 rounded-xl border border-[#202320]/15 bg-white hover:bg-[#202320]/5 text-xs font-bold text-[#202320] transition-colors"
                  title="Dispatch test ping"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Integration Detail Modal */}
      {selectedService && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
        >
          <div ref={modalRef} className="bg-[#FCFBF8] border border-[#202320]/15 rounded-3xl max-w-2xl w-full p-6 md:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white border border-[#202320]/10 flex items-center justify-center">
                  {renderIcon(selectedService.iconType)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#202320]">
                    {selectedService.name}
                  </h3>
                  <p className="text-xs text-[#202320]/60 font-mono">
                    Endpoint: {selectedService.endpointSample}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedService(null)}
                className="w-8 h-8 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 flex items-center justify-center text-[#202320] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 border-b border-[#202320]/10 pb-3">
              <button
                onClick={() => setActiveModalTab('payload')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeModalTab === 'payload'
                    ? 'bg-[#202320] text-[#FCFBF8]'
                    : 'text-[#202320]/60 hover:text-[#202320]'
                }`}
              >
                Sample Webhook Payload
              </button>
              <button
                onClick={() => setActiveModalTab('retry')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  activeModalTab === 'retry'
                    ? 'bg-[#202320] text-[#FCFBF8]'
                    : 'text-[#202320]/60 hover:text-[#202320]'
                }`}
              >
                Retry Policy & Escalation
              </button>
            </div>

            {activeModalTab === 'payload' ? (
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/60">
                  Telemetry Payload Format
                </span>
                <pre className="p-4 rounded-2xl bg-[#202320] text-[#FCFBF8] text-xs font-mono overflow-x-auto leading-relaxed">
                  {JSON.stringify(selectedService.payloadSample, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-white border border-[#202320]/10 space-y-3 text-xs text-[#202320]">
                <h4 className="font-bold text-sm text-[#202320]">Failover & Retry Architecture</h4>
                <p className="leading-relaxed text-[#202320]/80">
                  {selectedService.retryPolicy}
                </p>
                <div className="pt-2 border-t border-[#202320]/10 text-[#202320]/60 font-mono text-[11px]">
                  Regional Gateway: West-Africa-1 / Oredo Data Center · Redundant Multi-WAN
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-[#202320]/10">
              <span className="text-xs text-[#173F35] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Service Health Verified (Last Heartbeat: {selectedService.lastHeartbeat})
              </span>
              <button
                onClick={() => setSelectedService(null)}
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
