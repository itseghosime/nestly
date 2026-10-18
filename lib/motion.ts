'use client';

import { useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register GSAP plugins safely on client
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Shared Motion Tokens for Nestly
 * - Micro-controls: 120ms–220ms
 * - Panels, modals, drawers: 240ms–360ms
 * - Signature transitions & composed hero reveals: 420ms–580ms
 */
export const MOTION = {
  duration: {
    instant: 0.08,
    fast: 0.16,
    normal: 0.24,
    panel: 0.32,
    entrance: 0.44,
    section: 0.46,
    hero: 0.56,
    signature: 0.62,
  },
  ease: {
    out: 'power2.out',
    softOut: 'power2.out',
    outStrong: 'power3.out',
    crispOut: 'power3.out',
    inOut: 'power3.inOut',
    expo: 'expo.out',
    back: 'back.out(1.6)',
    // Moves immediately on click, decelerates into place (no slow-start stall).
    signature: 'power4.out',
    // Cross-fades read smoothest with a gentle symmetric curve.
    crossfade: 'sine.inOut',
  },
  distance: {
    micro: 6,
    small: 14,
    medium: 22,
    large: 32,
  },
  gallery: {
    holdMs: 5000,
    crossfade: 0.8,
    manualCrossfade: 0.42,
  },
} as const;

/**
 * Synchronous check for prefers-reduced-motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reactive, hydration-safe hook for prefers-reduced-motion.
 * Server snapshot is `false`; the client value is applied right after hydration.
 */
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );
}

/**
 * Scroll position memory for returning from Property Detail to listing pages
 */
const SCROLL_STORAGE_KEY = 'nestly_listing_scroll_v1';

interface SavedScrollEntry {
  pathname: string;
  scrollY: number;
  propertyId?: string;
  timestamp: number;
}

export function saveListingScrollPosition(pathname: string, propertyId?: string) {
  if (typeof window === 'undefined') return;
  try {
    const entry: SavedScrollEntry = {
      pathname,
      scrollY: window.scrollY,
      propertyId,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Ignore storage errors in private browsing
  }
}

export function consumeListingScrollPosition(currentPathname: string): SavedScrollEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!raw) return null;
    const entry: SavedScrollEntry = JSON.parse(raw);
    // Only restore if matching pathname and within 15 minutes
    if (entry.pathname === currentPathname && Date.now() - entry.timestamp < 15 * 60 * 1000) {
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
      return entry;
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function peekLastListingPath(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!raw) return null;
    const entry: SavedScrollEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp < 15 * 60 * 1000) {
      return entry.pathname;
    }
  } catch {
    // Ignore
  }
  return null;
}
