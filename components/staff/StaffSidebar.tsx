'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStaffActivity } from '@/lib/staff-activity';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { getStaffIdentityLabels, type StaffProfileIdentity } from '@/lib/staff-identity';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Building,
  Calendar,
  Clock,
  Handshake,
  Shield,
  History,
  Network,
  Settings,
  LogOut,
  Bell,
  Menu,
  X,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function StaffSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const activity = useStaffActivity();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [staffProfile, setStaffProfile] = useState<StaffProfileIdentity | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  const openMobileDrawer = () => {
    setDrawerMounted(true);
    setMobileOpen(true);
  };

  const closeMobileDrawer = useCallback(() => {
    if (prefersReducedMotion() || !drawerPanelRef.current || !backdropRef.current) {
      setMobileOpen(false);
      setDrawerMounted(false);
      toggleBtnRef.current?.focus();
      return;
    }

    gsap.to(backdropRef.current, {
      opacity: 0,
      duration: 0.18,
      ease: 'power2.in',
    });
    gsap.to(drawerPanelRef.current, {
      x: -24,
      opacity: 0,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        setMobileOpen(false);
        setDrawerMounted(false);
        toggleBtnRef.current?.focus();
      },
    });
  }, []);

  useGSAP(
    () => {
      if (!mobileOpen || !drawerMounted) return;
      if (prefersReducedMotion()) return;

      if (backdropRef.current) {
        gsap.fromTo(
          backdropRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 0.2, ease: MOTION.ease.crispOut }
        );
      }
      if (drawerPanelRef.current) {
        gsap.fromTo(
          drawerPanelRef.current,
          { x: -28, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.24, ease: MOTION.ease.crispOut }
        );
      }
    },
    { dependencies: [mobileOpen, drawerMounted] }
  );

  useEffect(() => {
    if (!drawerMounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerPanelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileDrawer();
      if (e.key === 'Tab' && drawerPanelRef.current) {
        const targets = Array.from(drawerPanelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
        const first = targets[0]; const last = targets[targets.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [drawerMounted, closeMobileDrawer]);

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load staff identity');
        const result: unknown = await response.json();
        if (!isRecord(result)) throw new Error('Invalid staff identity response');
        const profile = isRecord(result.profile) ? result.profile : null;
        if (active) {
          setStaffProfile(profile
            ? {
              display_name: typeof profile.display_name === 'string' ? profile.display_name : '',
              role: typeof profile.role === 'string' ? profile.role : '',
            }
            : null);
        }
      })
      .catch(() => {
        if (active) setStaffProfile(null);
      })
      .finally(() => {
        if (active) setIdentityLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const identity = getStaffIdentityLabels(staffProfile, identityLoaded);

  const navItems = [
    { label: 'Overview', href: '/staff/dashboard', icon: LayoutDashboard },
    {
      label: 'Conversations',
      href: '/staff/inbox',
      icon: MessageSquare,
      badge: activity?.attentionCount || undefined,
      badgeLabel: 'Human handoffs unassigned or assigned to you',
    },
    { label: 'Lead Submissions', href: '/staff/leads', icon: Users },
    { label: 'Customer Directory', href: '/staff/customers', icon: Users },
    { label: 'Property Management', href: '/staff/properties', icon: Building },
    {
      label: 'Inspection Calendar',
      href: '/staff/inspections',
      icon: Calendar,
    },
    {
      label: 'Availability Slots',
      href: '/staff/inspections/availability',
      icon: Clock,
    },
    {
      label: 'Offer Review',
      href: '/staff/offers',
      icon: Handshake,
    },
    {
      label: 'Notifications',
      href: '/staff/notifications',
      icon: Bell,
      badge: activity?.unreadNotifications || undefined,
      badgeLabel: 'Unread notifications for you',
    },
    { label: 'Team & Roles', href: '/staff/team', icon: Shield },
    { label: 'Profile & Security', href: '/staff/profile', icon: Shield },
    { label: 'Workspace Settings', href: '/staff/settings', icon: Settings },
    { label: 'Audit Log', href: '/staff/audit-log', icon: History },
    {
      label: 'Integrations Status',
      href: '/staff/integrations',
      icon: Network,
    },
  ];

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col justify-between h-full py-6 px-4">
      {/* Brand & Workspace Label */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
          <Link
            href="/staff/dashboard"
            onClick={() => isMobile && closeMobileDrawer()}
            className="flex items-center gap-2.5"
          >
            <div className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shadow-xs">
              N
            </div>
            <span className="font-headline text-xl font-bold tracking-tight text-charcoal">
              nestly
            </span>
          </Link>
          <span className="px-2.5 py-0.5 rounded-full bg-soft-stone text-muted-ink text-[10px] font-bold uppercase tracking-wider border border-hairline">
            Staff Portal
          </span>
        </div>

        {/* Navigation list */}
        <nav className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-230px)] no-scrollbar pr-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/staff/dashboard' &&
                item.href !== '/staff/inspections' &&
                pathname.startsWith(item.href)) ||
              (item.href === '/staff/inspections' &&
                pathname.startsWith('/staff/inspections') &&
                !pathname.startsWith('/staff/inspections/availability'));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => isMobile && closeMobileDrawer()}
                className={`nestly-press flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-secondary-container text-charcoal font-bold shadow-xs'
                    : 'text-charcoal/70 hover:bg-soft-stone hover:text-charcoal'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-primary' : 'text-muted-ink'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span title={item.badgeLabel} aria-label={`${item.badge} ${item.badgeLabel}`} className="shrink-0 px-2 py-0.5 rounded-full bg-persimmon text-white text-[10px] font-bold">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="pt-2 my-2 border-t border-hairline">
            <Link
              href="/"
              target="_blank"
              className="flex items-center justify-between px-3.5 py-2 rounded-full text-xs font-medium text-muted-ink hover:text-charcoal hover:bg-soft-stone transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <ExternalLink className="w-3.5 h-3.5" />
                <span>View Public Site</span>
              </span>
              <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </nav>
      </div>

      {/* Footer Profile & Sign Out */}
      <div className="pt-4 border-t border-hairline">
        {signOutError && <p role="alert" className="mb-2 text-xs text-rose-700">{signOutError}</p>}
        <div className="flex items-center justify-between p-2 rounded-2xl bg-white border border-hairline shadow-2xs">
          <Link
            href="/staff/profile"
            onClick={() => isMobile && closeMobileDrawer()}
            className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                {identity.initials}
              </div>
              <span className={`w-2 h-2 rounded-full ${staffProfile ? 'bg-emerald-500' : 'bg-hairline'} absolute -top-0.5 -right-0.5 ring-2 ring-white`}></span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-charcoal truncate">
                {identity.displayName}
              </p>
              <p className="text-[10px] text-muted-ink truncate">
                {identity.role}
              </p>
            </div>
          </Link>
          <button
            type="button"
            title="Sign out"
            disabled={signingOut}
            onClick={async () => {
              if (signingOut) return;
              setSigningOut(true); setSignOutError('');
              try {
                const response = await fetch('/api/auth/signout', { method: 'POST' });
                if (!response.ok) throw new Error('Unable to sign out. Please try again.');
                router.replace('/staff/signin'); router.refresh();
              } catch (error) { setSignOutError(error instanceof Error ? error.message : 'Unable to sign out'); }
              finally { setSigningOut(false); }
            }}
            className="w-8 h-8 rounded-full hover:bg-soft-stone text-muted-ink hover:text-persimmon flex items-center justify-center transition-colors ml-1"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Toggle Bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-warm border-b border-hairline sticky top-0 z-30">
        <Link href="/staff/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-xs">
            N
          </div>
          <span className="font-headline font-bold text-charcoal">
            nestly ops
          </span>
        </Link>
        <button
          ref={toggleBtnRef}
          type="button"
          onClick={openMobileDrawer}
          aria-label="Open staff navigation menu"
          aria-expanded={mobileOpen}
          className="nestly-press p-2 rounded-lg bg-soft-stone text-charcoal"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 h-screen sticky top-0 bg-[#F9F8F3] border-r border-hairline z-30">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {drawerMounted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Staff navigation drawer"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            ref={backdropRef}
            className="fixed inset-0 bg-charcoal/40 backdrop-blur-xs"
            onClick={closeMobileDrawer}
          />
          <div
            ref={drawerPanelRef}
            className="relative w-72 max-w-[82%] bg-[#F9F8F3] h-full shadow-2xl flex flex-col z-10"
          >
            <button
              type="button"
              onClick={closeMobileDrawer}
              aria-label="Close staff navigation menu"
              className="absolute top-4 right-4 p-1.5 rounded-full bg-soft-stone text-charcoal hover:bg-stone-card transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent(true)}
          </div>
        </div>
      )}
    </>
  );
}
