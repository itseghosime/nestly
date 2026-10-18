"use client";

import React, { useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import Link from "next/link";
import { StaffHeader } from "@/components/staff/StaffHeader";
import {
  ShieldAlert,
  ArrowLeft,
  Mail,
  CheckCircle2,
  X,
  Send,
  UserCheck,
  Lock,
} from "lucide-react";

export default function PermissionDeniedPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(
    "Tunde Adebayo (Principal Admin)",
  );
  const [reason, setReason] = useState(
    "Requires elevated permissions to view audit ledger.",
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  useGSAP(() => {
    if (!isModalOpen || !modalRef.current || prefersReducedMotion()) return;
    gsap.fromTo(modalRef.current, { scale: 0.97, y: 8, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [isModalOpen] });
  useGSAP(() => {
    if (!toastMessage || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [toastMessage] });

  const handleSendEscalation = (e: React.FormEvent) => {
    e.preventDefault();
    setIsModalOpen(false);
    showToast(`Escalation request dispatched to ${selectedAdmin}`);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader breadcrumbs={[{ label: "Permission Denied" }]} />
      <div className="flex flex-col items-center justify-center flex-1 py-12 px-4">
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

        {/* Main Restricted Card */}
        <div className="w-full max-w-xl bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-8 md:p-12 shadow-xl flex flex-col items-center text-center">
          {/* Shield Icon */}
          <div className="w-20 h-20 rounded-3xl bg-[#ED572E]/10 flex items-center justify-center text-[#ED572E] mb-6 shadow-sm">
            <ShieldAlert className="w-10 h-10" />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#202320]/5 text-[#202320]/60 mb-3">
            <Lock className="w-3.5 h-3.5" />
            Error 403 · Access Restricted · S18
          </div>

          <h1 className="text-2xl md:text-3xl font-extrabold text-[#202320] tracking-tight mb-3">
            Access Restricted
          </h1>

          <p className="text-sm md:text-base text-[#202320]/70 mb-8 max-w-md leading-relaxed">
            You do not have access to this page. Ask your workspace
            administrator if you need access.
          </p>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full">
            <Link
              href="/staff/dashboard"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#ED572E] text-white text-xs font-bold shadow-md hover:bg-[#ED572E]/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Overview
            </Link>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[#202320]/15 bg-white text-xs font-bold text-[#202320] shadow-sm hover:bg-[#202320]/5 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Mail className="w-4 h-4 text-[#ED572E]" />
              Contact Administrator (Demo)
            </button>
          </div>
        </div>

        {/* Contact Administrator Modal */}
        {isModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
          >
            <div ref={modalRef} className="bg-[#FCFBF8] border border-[#202320]/15 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#DDE7DB] text-[#173F35] flex items-center justify-center">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#202320]">
                      Escalate Permission Request
                    </h3>
                    <p className="text-xs text-[#202320]/60">
                      Dispatch an elevated access request to workspace leads
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 flex items-center justify-center text-[#202320] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSendEscalation} className="space-y-4">
                <div>
                  <label
                    htmlFor="target-admin"
                    className="block text-xs font-bold uppercase tracking-wider text-[#202320] mb-2"
                  >
                    Target Administrator
                  </label>
                  <select
                    id="target-admin"
                    value={selectedAdmin}
                    onChange={(e) => setSelectedAdmin(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-[#202320]/15 bg-white text-xs font-semibold text-[#202320] focus:outline-none focus:ring-2 focus:ring-[#ED572E]"
                  >
                    <option value="Tunde Adebayo (Principal Admin)">
                      Tunde Adebayo — Principal Admin (Edo Central Hub)
                    </option>
                    <option value="Victoria Nosa (Managing Director)">
                      Victoria Nosa — Managing Director
                    </option>
                    <option value="Amina Bello (Compliance Lead)">
                      Amina Bello — Legal & Compliance Lead
                    </option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="req-reason"
                    className="block text-xs font-bold uppercase tracking-wider text-[#202320] mb-2"
                  >
                    Justification / Access Scope
                  </label>
                  <textarea
                    id="req-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full p-4 rounded-2xl border border-[#202320]/15 bg-white text-xs text-[#202320] focus:outline-none focus:ring-2 focus:ring-[#ED572E] leading-relaxed resize-none"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-[#202320]/5 text-xs text-[#202320]/70 flex items-center gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-[#ED572E] shrink-0" />
                  <span>
                    Simulated request will dispatch to the coordinator dispatch
                    log.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#202320]/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-full border border-[#202320]/15 text-xs font-bold text-[#202320] hover:bg-[#202320]/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#ED572E] text-white text-xs font-bold shadow-md hover:bg-[#ED572E]/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Dispatch Escalation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
