import React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

const SIMULATION_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

export default function StaffAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col justify-between antialiased">
      {/* Top minimal staff header */}
      <header className="h-16 px-6 sm:px-12 flex items-center justify-between border-b border-hairline/80 bg-warm/90 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="w-2.5 h-2.5 rounded-full bg-persimmon group-hover:scale-125 transition-transform"></span>
            <span className="font-headline font-bold text-lg tracking-tight text-charcoal">nestly</span>
          </Link>
          <span className="text-hairline">|</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-ink">Operations Desk</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-soft-stone text-muted-ink text-[11px] font-semibold border border-hairline">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            {SIMULATION_MODE ? 'Simulation Mode' : 'Staff Portal'}
          </span>
          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-ink hover:text-charcoal transition-colors ml-2"
          >
            <span>Public Site</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {/* Auth Content */}
      <main className="flex-1 flex flex-col justify-center">
        {children}
      </main>

      {/* Bottom minimal staff footer */}
      <footer className="py-6 px-6 sm:px-12 border-t border-hairline bg-white/50 text-center">
        <p className="text-xs text-muted-ink">
          © 2026 Nestly · Internal Staff Operations · Benin City & Sapele Hubs
        </p>
      </footer>
    </div>
  );
}
