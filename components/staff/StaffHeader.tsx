'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, ChevronRight, Clock } from 'lucide-react';

interface StaffHeaderProps {
  breadcrumbs: Array<{ label: string; href?: string }>;
  title?: string;
  actions?: React.ReactNode;
}

type StaffIdentity = {
  user: { email: string | null };
  profile: {
    display_name: string;
    role: string;
  } | null;
};

export function StaffHeader({ breadcrumbs, actions }: StaffHeaderProps) {
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load staff identity');
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object') throw new Error('Invalid staff identity response');
        const value = result as Record<string, unknown>;
        if (!value.user || typeof value.user !== 'object') throw new Error('Invalid staff identity response');
        const user = value.user as Record<string, unknown>;
        const rawProfile = value.profile && typeof value.profile === 'object'
          ? value.profile as Record<string, unknown>
          : null;
        if (active) {
          setIdentity({
            user: { email: typeof user.email === 'string' ? user.email : null },
            profile: rawProfile
              ? {
                display_name: typeof rawProfile.display_name === 'string' ? rawProfile.display_name : '',
                role: typeof rawProfile.role === 'string' ? rawProfile.role : '',
              }
              : null,
          });
        }
      })
      .catch(() => {
        if (active) setIdentity(null);
      })
      .finally(() => {
        if (active) setIdentityLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const identityLabel = identity?.profile?.display_name.trim()
    || identity?.user.email
    || (identityLoaded ? 'Identity unavailable' : 'Loading identity…');
  const roleLabel = identity?.profile?.role || 'No staff profile';

  return (
    <header className="w-full bg-warm/95 backdrop-blur-md border-b border-hairline py-3.5 px-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-20">
      {/* Left: Breadcrumbs & Time zone info */}
      <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs">
        <nav aria-label="Staff Breadcrumb" className="flex items-center gap-1.5 text-muted-ink">
          <Link href="/staff/dashboard" className="hover:text-charcoal transition-colors">
            Nestly Ops
          </Link>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className="w-3.5 h-3.5 text-hairline" />
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-charcoal transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-bold text-charcoal">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>

        <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-soft-stone text-muted-ink text-[11px] font-medium border border-hairline">
          <Clock className="w-3 h-3 text-emerald-600" />
          <span>WAT (Africa/Lagos)</span>
        </span>
      </div>

      {/* Right: Demo Workspace indicator, Notification bell & Actions */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex flex-col items-end text-right">
          <span className="text-xs font-semibold text-charcoal">{identityLabel}</span>
          <span className="text-[10px] text-muted-ink">{roleLabel}</span>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Operations Online</span>
        </span>

        <Link
          href="/staff/notifications"
          aria-label="Staff notifications"
          className="w-9 h-9 rounded-full bg-white border border-hairline hover:bg-soft-stone text-charcoal flex items-center justify-center relative transition-colors shadow-2xs"
        >
          <Bell className="w-4 h-4 text-muted-ink" />
          <span className="w-2 h-2 rounded-full bg-persimmon absolute top-2 right-2"></span>
        </Link>

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
