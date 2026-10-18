'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import gsap from 'gsap';
import { MOTION, prefersReducedMotion, saveListingScrollPosition } from '@/lib/motion';

/**
 * Shared-element transition: PropertyCard photo -> /property/[id] hero.
 *
 * Implementation notes (verified frame-by-frame with a rAF probe):
 * - The overlay is moved with transforms only. The outer box is translated and
 *   non-uniformly scaled; the inner image is counter-scaled each frame so it is
 *   always rendered as `object-fit: cover` of the current box (no stretching,
 *   crop continuously interpolates from card crop to hero crop).
 * - Corner radius is corrected for the non-uniform scale with an elliptical
 *   `rx / ry` radius so it reads as a true circular radius on screen.
 * - The destination rect is re-measured every frame, so late layout changes on
 *   the destination never cause a jump at the end.
 * - Handoff is atomic: the overlay unmounts and the real hero becomes visible in
 *   the same React commit (no cross-fade, so no translucent frames).
 */

interface TransitionSource {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
  zoom: number; // hover zoom of card image at click time
}

export interface PropertyTransitionPayload {
  id: number;
  propertyId: string;
  imageSrc: string;
  title: string;
  source: TransitionSource;
  naturalWidth: number;
  naturalHeight: number;
  fromPath: string;
  startedAt: number;
}

interface TriggerArgs {
  propertyId: string;
  imageSrc: string;
  title: string;
  cardImageElement: HTMLElement | null;
  targetHref: string;
}

interface PropertyNavigationPreview {
  propertyId: string;
  imageSrc: string;
  title: string;
}

interface PropertyTransitionContextValue {
  activeTransition: PropertyTransitionPayload | null;
  propertyPreview: PropertyNavigationPreview | null;
  clearPropertyPreview: (propertyId: string) => void;
  triggerPropertyTransition: (e: React.MouseEvent<HTMLElement>, payload: TriggerArgs) => void;
  isMorphingProperty: (propertyId: string) => boolean;
  cancelPropertyTransition: () => void;
}

const PropertyTransitionContext = createContext<PropertyTransitionContextValue>({
  activeTransition: null,
  propertyPreview: null,
  clearPropertyPreview: () => {},
  triggerPropertyTransition: () => {},
  isMorphingProperty: () => false,
  cancelPropertyTransition: () => {},
});

const PENDING_TIMEOUT_MS = 2500;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function PropertyTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTransition, setActiveTransition] = useState<PropertyTransitionPayload | null>(null);
  const [propertyPreview, setPropertyPreview] = useState<PropertyNavigationPreview | null>(null);
  const clearPropertyPreview = useCallback((propertyId: string) => {
    setPropertyPreview((preview) => preview?.propertyId === propertyId ? null : preview);
  }, []);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const overlayImgRef = useRef<HTMLImageElement | null>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<'idle' | 'pending' | 'morphing' | 'handoff'>('idle');
  const idRef = useRef(0);
  const activeIdRef = useRef(0);

  const clearTransition = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (tweenRef.current) {
      tweenRef.current.kill();
      tweenRef.current = null;
    }
    phaseRef.current = 'idle';
    activeIdRef.current = 0;
    setActiveTransition(null);
  }, []);

  const triggerPropertyTransition = useCallback(
    (e: React.MouseEvent<HTMLElement>, { propertyId, imageSrc, title, cardImageElement, targetHref }: TriggerArgs) => {
      // Native behaviour for modified / non-primary clicks (new tab, new window, etc.)
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }

      saveListingScrollPosition(pathname, propertyId);
      const cardImg = cardImageElement?.querySelector('img');
      setPropertyPreview({ propertyId, imageSrc: cardImg?.currentSrc || imageSrc, title });

      // Ordinary navigation fallback: reduced motion, missing/invisible source.
      if (prefersReducedMotion() || !cardImageElement) return;
      const rect = cardImageElement.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.bottom < 0 || rect.top > window.innerHeight) return;

      const imgRect = cardImg ? cardImg.getBoundingClientRect() : rect;
      const zoom = Math.max(1, imgRect.width / rect.width);
      const radius = parseFloat(window.getComputedStyle(cardImageElement).borderTopLeftRadius) || 16;

      e.preventDefault();

      if (tweenRef.current) {
        tweenRef.current.kill();
        tweenRef.current = null;
      }
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);

      idRef.current += 1;
      const id = idRef.current;
      activeIdRef.current = id;
      phaseRef.current = 'pending';

      setActiveTransition({
        id,
        propertyId,
        imageSrc: cardImg?.currentSrc || imageSrc,
        title,
        source: { left: rect.left, top: rect.top, width: rect.width, height: rect.height, radius, zoom },
        naturalWidth: cardImg?.naturalWidth || rect.width,
        naturalHeight: cardImg?.naturalHeight || rect.height,
        fromPath: pathname,
        startedAt: performance.now(),
      });

      // If the destination never mounts (slow network, aborted navigation), fall back cleanly.
      pendingTimerRef.current = setTimeout(() => {
        if (activeIdRef.current === id && phaseRef.current === 'pending') clearTransition();
      }, PENDING_TIMEOUT_MS);

      router.push(targetHref);
    },
    [pathname, router, clearTransition]
  );

  // Back/Forward during a transition: never leave a stale overlay.
  useEffect(() => {
    const onPop = () => {
      setPropertyPreview(null);
      if (activeIdRef.current) clearTransition();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [clearTransition]);

  // Drive the morph once the destination hero exists.
  useEffect(() => {
    if (!activeTransition) return;
    const expectedPath = `/property/${activeTransition.propertyId}`;

    if (pathname !== expectedPath) {
      // Still on the source page (navigation not committed yet) -> keep waiting.
      if (pathname === activeTransition.fromPath && phaseRef.current === 'pending') return;
      // Navigated somewhere unexpected -> clean up on next tick.
      const id = setTimeout(clearTransition, 0);
      return () => clearTimeout(id);
    }

    if (phaseRef.current !== 'pending') return;

    const t = activeTransition;
    let rafId = 0;

    const start = () => {
      const destImg = document.querySelector<HTMLImageElement>(
        `[data-property-hero-img="${t.propertyId}"][data-active="true"]`
      );
      const destContainer = document.querySelector<HTMLElement>(`[data-property-hero="${t.propertyId}"]`);
      const overlay = overlayRef.current;
      const inner = overlayImgRef.current;

      if (!destImg || !destContainer || !overlay || !inner) {
        if (performance.now() - t.startedAt < PENDING_TIMEOUT_MS) rafId = requestAnimationFrame(start);
        else clearTransition();
        return;
      }

      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      phaseRef.current = 'morphing';

      if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

      const containerStyle = window.getComputedStyle(destContainer);
      const border = parseFloat(containerStyle.borderTopWidth) || 0;
      const destRadius = Math.max(0, (parseFloat(containerStyle.borderTopLeftRadius) || 24) - border);

      // Base box = destination size; everything else is a transform of it.
      const d0 = destImg.getBoundingClientRect();
      const BW = d0.width;
      const BH = d0.height;
      const nw = t.naturalWidth;
      const nh = t.naturalHeight;
      const s0 = Math.max(BW / nw, BH / nh);
      const IW = nw * s0;
      const IH = nh * s0;

      overlay.style.width = `${BW}px`;
      overlay.style.height = `${BH}px`;
      overlay.style.left = '0px';
      overlay.style.top = '0px';
      inner.style.width = `${IW}px`;
      inner.style.height = `${IH}px`;
      inner.style.left = `${(BW - IW) / 2}px`;
      inner.style.top = `${(BH - IH) / 2}px`;

      // The pending photo shell can be replaced by the validated gallery mid-morph.
      // Always resolve the mounted destination rather than measuring a detached image.
      const currentDestination = () => document.querySelector<HTMLImageElement>(
        `[data-property-hero-img="${t.propertyId}"][data-active="true"]`
      ) || destImg;
      const src = t.source;
      const apply = (p: number) => {
        const d = currentDestination().getBoundingClientRect();
        if (d.width < 8 || d.height < 8) return;
        const x = lerp(src.left, d.left, p);
        const y = lerp(src.top, d.top, p);
        const w = lerp(src.width, d.width, p);
        const h = lerp(src.height, d.height, p);
        const r = lerp(src.radius, destRadius, p);
        const zoom = lerp(src.zoom, 1, p);
        const sx = w / BW;
        const sy = h / BH;
        overlay.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${sx}, ${sy})`;
        overlay.style.borderRadius = `${r / sx}px / ${r / sy}px`;
        const sc = Math.max(w / nw, h / nh) * zoom;
        inner.style.transform = `scale(${sc / (s0 * sx)}, ${sc / (s0 * sy)})`;
        overlay.style.boxShadow = `0 ${lerp(18, 2, p)}px ${lerp(44, 10, p)}px rgba(32,35,32,${lerp(0.2, 0.05, p)})`;
      };

      apply(0);
      overlay.style.visibility = 'visible';

      const state = { p: 0 };
      tweenRef.current = gsap.to(state, {
        p: 1,
        duration: MOTION.duration.signature,
        ease: MOTION.ease.signature,
        onUpdate: () => apply(state.p),
        onComplete: () => {
          phaseRef.current = 'handoff';
          const finish = () => {
            if (activeIdRef.current === t.id) clearTransition();
          };
          // Destination photo is the same cached asset; make sure it is decoded before the swap.
          currentDestination().decode().then(finish, finish);
        },
      });
    };

    rafId = requestAnimationFrame(start);
    return () => cancelAnimationFrame(rafId);
  }, [pathname, activeTransition, clearTransition]);

  useEffect(() => () => clearTransition(), [clearTransition]);

  const isMorphingProperty = useCallback(
    (propertyId: string) => Boolean(activeTransition && activeTransition.propertyId === propertyId),
    [activeTransition]
  );

  return (
    <PropertyTransitionContext.Provider value={{ activeTransition, propertyPreview, clearPropertyPreview, triggerPropertyTransition, isMorphingProperty, cancelPropertyTransition: clearTransition }}>
      {children}

      {activeTransition && (
        <div
          key={activeTransition.id}
          ref={overlayRef}
          aria-hidden="true"
          data-property-transition-overlay={activeTransition.propertyId}
          style={{
            position: 'fixed',
            left: activeTransition.source.left,
            top: activeTransition.source.top,
            width: activeTransition.source.width,
            height: activeTransition.source.height,
            borderRadius: activeTransition.source.radius,
            transformOrigin: '0 0',
            zIndex: 9999,
            overflow: 'hidden',
            pointerEvents: 'none',
            willChange: 'transform',
            contain: 'strict',
            backgroundColor: '#F4F2EB',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={overlayImgRef}
            src={activeTransition.imageSrc}
            alt=""
            decoding="sync"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transformOrigin: '50% 50%',
              transform: `scale(${activeTransition.source.zoom})`,
              willChange: 'transform',
            }}
          />
        </div>
      )}
    </PropertyTransitionContext.Provider>
  );
}

export function usePropertyTransition() {
  return useContext(PropertyTransitionContext);
}
