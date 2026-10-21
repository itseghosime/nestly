"use client";

import React, { useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import Link from "next/link";
import { StaffHeader } from "@/components/staff/StaffHeader";
import { useDialogA11y } from "@/hooks/use-dialog-a11y";
import {
  ShieldAlert,
  ArrowLeft,
  Mail,
  X,
  Lock,
} from "lucide-react";

export default function PermissionDeniedPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const contactBtnRef = useRef<HTMLButtonElement>(null);
  const modalCloseBtnRef = useRef<HTMLButtonElement>(null);

  useDialogA11y({
    isOpen: isModalOpen,
    onClose: () => setIsModalOpen(false),
    containerRef: modalRef,
    initialFocusRef: modalCloseBtnRef,
    returnFocusRef: contactBtnRef,
  });

  useGSAP(() => {
    if (!isModalOpen || !modalRef.current || prefersReducedMotion()) return;
    gsap.fromTo(modalRef.current, { scale: 0.97, y: 8, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [isModalOpen] });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader breadcrumbs={[{ label: "Permission Denied" }]} />
      <div className="flex flex-col items-center justify-center flex-1 py-12 px-4">
        {/* Main Restricted Card */}
        <div className="w-full max-w-xl bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-8 md:p-12 shadow-xl flex flex-col items-center text-center">
          {/* Shield Icon */}
          <div className="w-20 h-20 rounded-3xl bg-[#ED572E]/10 flex items-center justify-center text-[#ED572E] mb-6 shadow-sm">
            <ShieldAlert className="w-10 h-10" />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#202320]/5 text-[#202320]/60 mb-3">
            <Lock className="w-3.5 h-3.5" />
            Error 403 · Access Restricted
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
              ref={contactBtnRef}
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[#202320]/15 bg-white text-xs font-bold text-[#202320] shadow-sm hover:bg-[#202320]/5 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Mail className="w-4 h-4 text-[#ED572E]" />
              Contact Administrator
            </button>
          </div>
        </div>

        {/* Contact Administrator Modal */}
        {isModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Administrator contact information"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            />
            <div ref={modalRef} className="relative z-10 bg-[#FCFBF8] border border-[#202320]/15 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#DDE7DB] text-[#173F35] flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#202320]">
                      Administrator contact unavailable
                    </h3>
                    <p className="text-xs text-[#202320]/60">
                      This page cannot route an access request.
                    </p>
                  </div>
                </div>
                <button
                  ref={modalCloseBtnRef}
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 flex items-center justify-center text-[#202320] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-5">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-950">
                  No request has been sent or logged from this page. Contact your workspace administrator through your approved internal channel.
                </div>
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#202320]/10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2.5 rounded-full bg-[#202320] text-[#FCFBF8] text-xs font-bold hover:bg-[#202320]/90 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
