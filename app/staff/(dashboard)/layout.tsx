'use client';

import React, { useRef } from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffSidebar } from '@/components/staff/StaffSidebar';
import { MOTION, prefersReducedMotion } from '@/lib/motion';

export default function StaffDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !contentRef.current) return;
      gsap.fromTo(
        contentRef.current,
        { y: 8, opacity: 0.92 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.fast,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [pathname] }
  );

  return (
    <div className="min-h-screen bg-warm flex flex-col lg:flex-row antialiased text-charcoal">
      {/* Left Sidebar */}
      <StaffSidebar />

      {/* Main Backoffice Content Area */}
      <div
        ref={contentRef}
        className="flex-1 min-w-0 flex flex-col min-h-screen"
      >
        {children}
      </div>
    </div>
  );
}
