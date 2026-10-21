'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { useSavedHomes } from '@/lib/saved-homes-context';
import { prefersReducedMotion } from '@/lib/motion';
import { useDialogA11y } from '@/hooks/use-dialog-a11y';
import {
  Heart,
  MessageSquare,
  Menu,
  X,
  Home as HomeIcon,
  Compass,
  MapPin,
  HelpCircle,
  Info,
  PlusCircle,
  Lock,
  ChevronRight
} from 'lucide-react';

interface HeaderProps {
  onOpenNia?: () => void;
}

export function Header({ onOpenNia }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { savedCount } = useSavedHomes();
  const pathname = usePathname();

  const badgeRef = useRef<HTMLSpanElement>(null);
  const heartRef = useRef<SVGSVGElement>(null);
  const prevCountRef = useRef<number>(savedCount);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Accessible dialog management: body scroll lock, focus trap, Escape key, and focus return
  useDialogA11y({
    isOpen: mobileMenuOpen,
    onClose: () => closeMobileMenu(true),
    containerRef: drawerRef,
    initialFocusRef: closeBtnRef,
    returnFocusRef: menuTriggerRef,
  });

  // Subtle header shadow on scroll
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Animate saved count badge when count updates
  useEffect(() => {
    if (prevCountRef.current !== savedCount) {
      prevCountRef.current = savedCount;
      if (!prefersReducedMotion()) {
        if (badgeRef.current) {
          gsap.fromTo(
            badgeRef.current,
            { scale: 1.42 },
            { scale: 1, duration: 0.36, ease: 'back.out(2.2)' }
          );
        }
        if (heartRef.current) {
          gsap.fromTo(
            heartRef.current,
            { scale: 1.3 },
            { scale: 1, duration: 0.32, ease: 'back.out(2)' }
          );
        }
      }
    }
  }, [savedCount]);

  const closeMobileMenu = useCallback((restoreFocus = true) => {
    if (prefersReducedMotion() || !drawerRef.current || !backdropRef.current) {
      setMobileMenuOpen(false);
      if (restoreFocus) {
        requestAnimationFrame(() => menuTriggerRef.current?.focus());
      }
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        setMobileMenuOpen(false);
        if (restoreFocus) {
          requestAnimationFrame(() => menuTriggerRef.current?.focus());
        }
      },
    });

    tl.to(drawerRef.current, {
      xPercent: 100,
      duration: 0.22,
      ease: 'power2.in',
    }, 0);
    tl.to(backdropRef.current, {
      opacity: 0,
      duration: 0.2,
      ease: 'power1.out',
    }, 0.02);
  }, []);

  // Coordinate mobile drawer entrance animation
  useEffect(() => {
    if (!mobileMenuOpen) return;

    if (!prefersReducedMotion() && drawerRef.current && backdropRef.current) {
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.24, ease: 'power2.out' }
      );
      gsap.fromTo(
        drawerRef.current,
        { xPercent: 100 },
        { xPercent: 0, duration: 0.32, ease: 'power3.out' }
      );
      const items = drawerRef.current.querySelectorAll('[data-drawer-item]');
      if (items.length > 0) {
        gsap.fromTo(
          items,
          { opacity: 0, x: 14 },
          { opacity: 1, x: 0, duration: 0.26, stagger: 0.028, ease: 'power2.out', delay: 0.08 }
        );
      }
    }
  }, [mobileMenuOpen]);

  const navLinks = [
    { label: 'Browse homes', href: '/browse' },
    { label: 'How it works', href: '/how-it-works' },
    { label: 'Neighborhoods', href: '/neighborhoods' },
    { label: 'About', href: '/about' },
    { label: 'FAQ', href: '/faq' },
  ];

  return (
    <>
      <header
        className={`w-full h-[76px] lg:h-[88px] bg-warm/95 backdrop-blur-md border-b border-hairline sticky top-0 z-40 px-4 sm:px-8 lg:px-16 flex items-center justify-between transition-shadow duration-200 ${
          scrolled ? 'shadow-[0_4px_20px_rgba(32,35,32,0.05)]' : ''
        }`}
      >
        {/* Brand / Logo with door glyph */}
        <Link
          href="/"
          aria-label="Nestly Home"
          className="flex items-center gap-2 sm:gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-charcoal rounded-xl shrink-0 nestly-press"
        >
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-charcoal flex items-center justify-center text-white relative overflow-hidden transition-transform duration-200 group-hover:scale-105 shadow-sm">
            <svg fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg" className="sm:w-[22px] sm:h-[22px]">
              <path d="M4 21V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v15" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
              <path d="M9 21v-8a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v8" stroke="#ED572E" strokeLinecap="round" strokeWidth="2.2" />
              <circle cx="15" cy="14" fill="#ED572E" r="1.2" />
            </svg>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-headline text-xl sm:text-[26px] font-extrabold tracking-tight text-charcoal">nestly</span>
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-persimmon"></span>
          </div>
        </Link>

        {/* Center Desktop Navigation */}
        <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-8 xl:gap-9 text-[15px] font-semibold text-charcoal/80">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative py-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon rounded-md ${
                  isActive
                    ? 'text-charcoal font-bold'
                    : 'hover:text-charcoal'
                }`}
              >
                <span>{link.label}</span>
                <span
                  className={`absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full bg-persimmon transition-transform duration-200 origin-left ${
                    isActive ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        {/* Right Utility Actions */}
        <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
          {/* Saved Homes Button */}
          <Link
            href="/saved"
            aria-label={`Saved homes (${savedCount})`}
            className="flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white border border-hairline hover:border-charcoal/30 text-charcoal relative shadow-2xs hover:shadow-sm nestly-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon"
          >
            <Heart
              ref={heartRef}
              className={`w-4 h-4 sm:w-[18px] sm:h-[18px] transition-colors duration-150 ${savedCount > 0 ? 'fill-persimmon text-persimmon' : 'text-charcoal'}`}
            />
            <span
              ref={badgeRef}
              className={`absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full border text-[10px] sm:text-[11px] font-bold flex items-center justify-center transition-colors duration-150 ${
                savedCount > 0
                  ? 'bg-persimmon text-white border-persimmon'
                  : 'bg-soft-stone text-charcoal border-hairline'
              }`}
            >
              {savedCount}
            </span>
          </Link>

          {/* Submit Property Link (Desktop) */}
          <Link
            href="/submit-property"
            className="hidden xl:inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white border border-hairline hover:border-charcoal/40 text-charcoal text-[13px] font-bold tracking-tight nestly-press shrink-0"
          >
            <PlusCircle className="w-4 h-4 text-primary shrink-0" />
            <span>List Home</span>
          </Link>

          {/* Chat with Nia trigger (Tablet/Desktop) */}
          <button
            type="button"
            onClick={onOpenNia}
            className="hidden sm:inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-[13px] sm:text-[14px] font-bold tracking-tight shadow-sm hover:shadow-md nestly-press cursor-pointer shrink-0"
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span>Chat with Nia</span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            ref={menuTriggerRef}
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label={mobileMenuOpen ? 'Close mobile navigation' : 'Open mobile navigation'}
            aria-expanded={mobileMenuOpen}
            className="lg:hidden flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-hairline hover:bg-soft-stone text-charcoal nestly-press shrink-0"
          >
            <Menu className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
          </button>
        </div>
      </header>

      {/* Accessible Mobile Drawer & Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          {/* Backdrop overlay */}
          <div
            ref={backdropRef}
            className="fixed inset-0 bg-charcoal/45 backdrop-blur-xs"
            onClick={() => closeMobileMenu(true)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            ref={drawerRef}
            className="relative w-[86%] max-w-[340px] bg-warm h-full shadow-2xl flex flex-col justify-between overflow-y-auto p-6 z-10"
          >
            {/* Drawer Header */}
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-hairline">
                <Link
                  href="/"
                  className="flex items-center gap-2"
                  onClick={() => closeMobileMenu(false)}
                >
                  <div className="w-8 h-8 rounded-xl bg-charcoal flex items-center justify-center text-white">
                    <svg fill="none" height="18" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="18">
                      <path d="M4 21V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v15" strokeLinecap="round" />
                      <path d="M9 21v-8a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v8" stroke="#ED572E" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="font-headline text-xl font-extrabold tracking-tight text-charcoal">nestly</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-persimmon"></span>
                </Link>

                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={() => closeMobileMenu(true)}
                  aria-label="Close menu"
                  className="w-10 h-10 rounded-full bg-soft-stone hover:bg-stone-card text-charcoal flex items-center justify-center nestly-press shrink-0"
                >
                  <X className="w-5 h-5 shrink-0" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="flex flex-col gap-1.5 py-6">
                <Link
                  data-drawer-item
                  href="/browse"
                  onClick={() => closeMobileMenu(false)}
                  className="px-4 py-3 rounded-2xl bg-primary text-white font-bold flex items-center justify-between shadow-xs nestly-press"
                >
                  <div className="flex items-center gap-3">
                    <HomeIcon className="w-5 h-5 text-emerald-300" />
                    <span>Browse Homes</span>
                  </div>
                  <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/20">Edo &amp; Delta</span>
                </Link>

                <Link
                  data-drawer-item
                  href="/how-it-works"
                  onClick={() => closeMobileMenu(false)}
                  className="px-4 py-3 rounded-2xl hover:bg-soft-stone text-charcoal font-semibold flex items-center justify-between nestly-press"
                >
                  <div className="flex items-center gap-3">
                    <Compass className="w-5 h-5 text-muted-ink" />
                    <span>How It Works</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-ink" />
                </Link>

                <Link
                  data-drawer-item
                  href="/neighborhoods"
                  onClick={() => closeMobileMenu(false)}
                  className="px-4 py-3 rounded-2xl hover:bg-soft-stone text-charcoal font-semibold flex items-center justify-between nestly-press"
                >
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-muted-ink" />
                    <span>Neighborhood Guides</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-ink" />
                </Link>

                <Link
                  data-drawer-item
                  href="/saved"
                  onClick={() => closeMobileMenu(false)}
                  className="px-4 py-3 rounded-2xl hover:bg-soft-stone text-charcoal font-semibold flex items-center justify-between nestly-press"
                >
                  <div className="flex items-center gap-3">
                    <Heart className="w-5 h-5 text-persimmon" />
                    <span>Saved Homes</span>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-persimmon-soft text-persimmon text-xs font-bold flex items-center justify-center">
                    {savedCount}
                  </span>
                </Link>

                <Link
                  data-drawer-item
                  href="/submit-property"
                  onClick={() => closeMobileMenu(false)}
                  className="px-4 py-3 rounded-2xl hover:bg-soft-stone text-charcoal font-semibold flex items-center justify-between nestly-press"
                >
                  <div className="flex items-center gap-3">
                    <PlusCircle className="w-5 h-5 text-primary" />
                    <span>Submit Property</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-ink" />
                </Link>

                <Link
                  data-drawer-item
                  href="/about"
                  onClick={() => closeMobileMenu(false)}
                  className="px-4 py-3 rounded-2xl hover:bg-soft-stone text-charcoal font-semibold flex items-center justify-between nestly-press"
                >
                  <div className="flex items-center gap-3">
                    <Info className="w-5 h-5 text-muted-ink" />
                    <span>About Nestly</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-ink" />
                </Link>

                <Link
                  data-drawer-item
                  href="/faq"
                  onClick={() => closeMobileMenu(false)}
                  className="px-4 py-3 rounded-2xl hover:bg-soft-stone text-charcoal font-semibold flex items-center justify-between nestly-press"
                >
                  <div className="flex items-center gap-3">
                    <HelpCircle className="w-5 h-5 text-muted-ink" />
                    <span>Help &amp; FAQ</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-ink" />
                </Link>
              </nav>
            </div>

            {/* Bottom Actions & Staff Link */}
            <div data-drawer-item className="pt-6 border-t border-hairline flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  closeMobileMenu(false);
                  if (onOpenNia) onOpenNia();
                }}
                className="w-full py-3 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm nestly-press"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Chat with Nia</span>
              </button>

              <Link
                href="/staff/signin"
                onClick={() => closeMobileMenu(false)}
                className="py-2.5 px-4 rounded-full bg-white border border-hairline hover:bg-soft-stone text-muted-ink text-xs font-semibold flex items-center justify-center gap-2 nestly-press"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Staff Portal Access</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
