'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { ChevronLeft, ChevronRight, Maximize2, Pause, Play, X } from 'lucide-react';
import type { Property } from '@/lib/types';
import { MOTION, prefersReducedMotion, useReducedMotion } from '@/lib/motion';

/**
 * Property detail gallery: hero with automatic, decode-gated cross-fades,
 * thumbnails, swipe, and an accessible lightbox.
 *
 * - Two stacked <img> layers. The incoming photo is fully decoded before it
 *   fades in OVER the current one; the current photo stays opaque underneath,
 *   so there is never a blank or translucent frame.
 * - Autoplay waits for the card->hero transition to settle (`morphing` false)
 *   and for the first photo to be ready.
 * - Paused by: mouse hover, keyboard focus within, open lightbox, hidden tab,
 *   gallery out of view, or a deliberate user pause (sticky until Play).
 * - Reduced motion: no autoplay by default (user may opt in with Play).
 * - Automatic slides are not announced (live region is `off` while playing).
 */

const decodeCache = new Map<string, Promise<boolean>>();
function decodeUrl(url: string): Promise<boolean> {
  const cached = decodeCache.get(url);
  if (cached) return cached;
  const p = new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img.decode().then(
      () => resolve(true),
      () => resolve(img.complete && img.naturalWidth > 0)
    );
  }).then((ok) => {
    if (!ok) decodeCache.delete(url);
    return ok;
  });
  decodeCache.set(url, p);
  return p;
}

interface PropertyGalleryProps {
  property: Property;
  morphing: boolean;
}

export function PropertyGallery({ property, morphing }: PropertyGalleryProps) {
  const reduced = useReducedMotion();

  const photos = useMemo(() => {
    const list = (property.galleryImages?.length ? property.galleryImages : [property.featuredImage]).filter(Boolean);
    return Array.from(new Set(list));
  }, [property.galleryImages, property.featuredImage]);

  const [failed, setFailed] = useState<string[]>([]);
  const valid = useMemo(() => photos.filter((p) => !failed.includes(p)), [photos, failed]);
  const multi = valid.length > 1;

  const [index, setIndex] = useState(0); // index into `photos`
  const [intent, setIntent] = useState<'auto' | 'paused' | 'playing'>('auto');
  const [hovering, setHovering] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [inView, setInView] = useState(true);
  const [firstReady, setFirstReady] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const playIntent = intent === 'playing' || (intent === 'auto' && !reduced);
  const running =
    multi && playIntent && !hovering && !focusWithin && !tabHidden && inView && !lightboxOpen && !morphing && firstReady;

  const rootRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<Array<HTMLImageElement | null>>([null, null]);
  const frontRef = useRef(0);
  const indexRef = useRef(0);
  const fillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const seqRef = useRef(0);
  const busyRef = useRef(false);
  const elapsedRef = useRef(0);
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClickRef = useRef(false);

  const total = photos.length;
  const validCount = valid.length;
  const displayIndex = Math.max(0, valid.indexOf(photos[index])) + 1;

  const markReady = useCallback(() => setFirstReady(true), []);

  const resetProgress = useCallback(() => {
    elapsedRef.current = 0;
    fillRefs.current.forEach((el) => {
      if (el) el.style.transform = 'scaleX(0)';
    });
  }, []);

  const nextValidIndex = useCallback(
    (from: number, dir: 1 | -1) => {
      for (let step = 1; step <= total; step += 1) {
        const i = (from + dir * step + total * step) % total;
        if (!failed.includes(photos[i])) return i;
      }
      return from;
    },
    [failed, photos, total]
  );

  /** Show photo `target`. The current photo stays visible until the next one is decoded. */
  const goTo = useCallback(
    async (target: number, opts: { manual?: boolean; instant?: boolean } = {}) => {
      const url = photos[target];
      if (!url) return;
      const seq = ++seqRef.current;
      if (tweenRef.current) tweenRef.current.progress(1); // settle any in-flight fade first
      if (opts.manual) resetProgress();

      const front = layerRefs.current[frontRef.current];
      const back = layerRefs.current[1 - frontRef.current];
      if (!front || !back) return;
      if (front.getAttribute('src') === url) {
        indexRef.current = target;
        setIndex(target);
        return;
      }

      busyRef.current = true;
      const ok = await decodeUrl(url);
      if (seq !== seqRef.current) return;
      if (!ok) {
        busyRef.current = false;
        setFailed((f) => (f.includes(url) ? f : [...f, url]));
        return;
      }
      back.src = url;
      try {
        await back.decode();
      } catch {
        /* already decoded via cache */
      }
      if (seq !== seqRef.current) return;

      indexRef.current = target;
      setIndex(target);
      resetProgress();

      const label = `${property.title} — photo ${valid.indexOf(url) + 1} of ${valid.length}`;
      const swap = () => {
        front.style.opacity = '0';
        front.dataset.active = 'false';
        front.alt = '';
        front.setAttribute('aria-hidden', 'true');
        back.dataset.active = 'true';
        back.alt = label;
        back.removeAttribute('aria-hidden');
        front.style.zIndex = '1';
        back.style.zIndex = '2';
        frontRef.current = 1 - frontRef.current;
        busyRef.current = false;
        tweenRef.current = null;
      };

      back.style.zIndex = '3';
      if (opts.instant) {
        back.style.opacity = '1';
        swap();
        return;
      }
      const duration = prefersReducedMotion()
        ? 0.2
        : opts.manual
          ? MOTION.gallery.manualCrossfade
          : MOTION.gallery.crossfade;
      tweenRef.current = gsap.fromTo(
        back,
        { opacity: 0 },
        { opacity: 1, duration, ease: MOTION.ease.crossfade, onComplete: swap }
      );
    },
    [photos, property.title, resetProgress, valid]
  );

  const step = useCallback(
    (dir: 1 | -1, manual = true) => {
      if (!multi) return;
      goTo(nextValidIndex(indexRef.current, dir), { manual });
    },
    [goTo, multi, nextValidIndex]
  );

  // Autoplay clock: only ticks while `running`; progress is written straight to the DOM.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const hold = MOTION.gallery.holdMs;
    const loop = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      if (!busyRef.current) {
        elapsedRef.current += dt;
        const fill = fillRefs.current[indexRef.current];
        if (fill) fill.style.transform = `scaleX(${Math.min(1, elapsedRef.current / hold)})`;
        if (elapsedRef.current >= hold) {
          elapsedRef.current = 0;
          goTo(nextValidIndex(indexRef.current, 1));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, goTo, nextValidIndex]);

  // Warm the decode cache for the whole gallery once the hero has settled.
  useEffect(() => {
    if (morphing || !firstReady || !multi) return;
    const id = window.setTimeout(() => valid.forEach((u) => void decodeUrl(u)), 250);
    return () => window.clearTimeout(id);
  }, [morphing, firstReady, multi, valid]);

  // Tab visibility
  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Viewport visibility
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.35),
      { threshold: [0, 0.35, 0.6] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // If the current photo failed to load, move to a valid one without animation.
  useEffect(() => {
    if (!failed.includes(photos[indexRef.current]) || !valid.length) return;
    const target = photos.indexOf(valid[0]);
    const id = window.setTimeout(() => goTo(target, { instant: true }), 0);
    return () => window.clearTimeout(id);
  }, [failed, photos, valid, goTo]);

  useEffect(() => () => {
    seqRef.current += 1;
    tweenRef.current?.kill();
  }, []);

  const handleFirstLayerError = () => {
    const url = photos[0];
    setFailed((f) => (f.includes(url) ? f : [...f, url]));
  };

  // ---- Pointer / keyboard interaction --------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (!multi || (e.pointerType === 'mouse' && e.button !== 0)) return;
    swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      suppressClickRef.current = true;
      window.setTimeout(() => (suppressClickRef.current = false), 0);
      step(dx < 0 ? 1 : -1);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (lightboxOpen || !multi) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    }
  };

  const onFocusCapture = (e: React.FocusEvent) => {
    const target = e.target as HTMLElement;
    // Controls inside the carousel should not pause autoplay when focused;
    // otherwise clicking Play immediately re-pauses because focus stays on the button.
    if (target.closest?.('[data-gallery-controls]')) return;
    setFocusWithin(true);
  };
  const onBlurCapture = (e: React.FocusEvent) => {
    const next = (e.relatedTarget as Node | null) || document.activeElement;
    if (!next || !rootRef.current?.contains(next)) setFocusWithin(false);
  };

  const openLightbox = () => {
    if (suppressClickRef.current) return;
    setLightboxOpen(true);
  };

  const togglePlay = () => {
    const isReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setIntent((prev) => {
      const willPause = prev === 'playing' || (prev === 'auto' && !isReduced);
      return willPause ? 'paused' : 'playing';
    });
  };

  const activeUrl = photos[index];

  return (
    <>
      <div
        ref={rootRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${property.title} photos`}
        onKeyDown={onKeyDown}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHovering(false)}
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-12"
        data-gallery-running={running ? 'true' : 'false'}
        data-gallery-index={index}
      >
        {/* Main hero photo — target of the card -> detail shared-element transition */}
        <div
          data-property-hero={property.id}
          className={`lg:col-span-8 h-[340px] sm:h-[480px] rounded-3xl overflow-hidden border relative shadow-sm group select-none transition-[border-color,background-color] duration-300 ${
            morphing ? 'bg-transparent border-transparent shadow-none' : 'bg-soft-stone border-hairline'
          }`}
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipeRef.current = null)}
        >
          <div className="absolute inset-0 cursor-zoom-in" style={{ opacity: morphing ? 0 : 1 }} onClick={openLightbox}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={(el) => {
                layerRefs.current[0] = el;
                if (el && el.complete && el.naturalWidth > 0) markReady();
              }}
              data-property-hero-img={property.id}
              data-active="true"
              src={photos[0]}
              alt={`${property.title} — photo 1 of ${validCount}`}
              draggable={false}
              onLoad={markReady}
              onError={handleFirstLayerError}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ zIndex: 2 }}
            />
            {multi && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                ref={(el) => {
                  layerRefs.current[1] = el;
                }}
                data-property-hero-img={property.id}
                data-active="false"
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: 1, opacity: 0 }}
              />
            )}
          </div>

          {/* Controls fade in only once the hero has settled */}
          <div
            data-gallery-controls
            className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${morphing ? 'opacity-0' : 'opacity-100'}`}
            style={{ zIndex: 5 }}
          >
            {multi && (
              <div aria-hidden="true" className="absolute top-4 left-4 right-4 flex gap-1.5">
                {photos.map((p, i) =>
                  failed.includes(p) ? null : (
                    <span key={p} className="relative h-[3px] flex-1 rounded-full bg-white/35 overflow-hidden">
                      <span
                        ref={(el) => {
                          fillRefs.current[i] = el;
                        }}
                        className={`absolute inset-0 origin-left rounded-full ${
                          i === index ? 'bg-white' : 'bg-white/0'
                        }`}
                        style={{ transform: 'scaleX(0)' }}
                      />
                    </span>
                  )
                )}
              </div>
            )}

            {multi && (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous photo"
                  className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-charcoal flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-90 transition-opacity duration-200 nestly-press cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next photo"
                  className="pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-charcoal flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-90 transition-opacity duration-200 nestly-press cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <div className="absolute bottom-4 left-4 flex items-center gap-2">
              {multi && (
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playIntent ? 'Pause slideshow' : 'Play slideshow'}
                  aria-pressed={!playIntent}
                  className="pointer-events-auto w-8 h-8 rounded-full bg-charcoal/80 hover:bg-charcoal text-white flex items-center justify-center backdrop-blur-xs nestly-press cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {playIntent ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-px" />}
                </button>
              )}
              <div className="px-3 py-1.5 rounded-full bg-charcoal/80 text-white text-xs font-medium backdrop-blur-xs tabular-nums">
                Photo {displayIndex} of {validCount} · Daylight verified
              </div>
            </div>

            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label="Open full-screen photo gallery"
              className="pointer-events-auto absolute bottom-4 right-4 px-3.5 py-1.5 rounded-full bg-white/95 hover:bg-white text-charcoal text-xs font-bold flex items-center gap-1.5 shadow-sm nestly-press cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Expand Gallery</span>
            </button>
          </div>

          {/* Announce only user-driven changes (WAI carousel pattern) */}
          <div className="sr-only" aria-live={running ? 'off' : 'polite'} aria-atomic="true">
            Photo {displayIndex} of {validCount}
          </div>
        </div>

        {/* Side thumbnails */}
        <div className="lg:col-span-4 grid grid-cols-3 lg:grid-cols-1 gap-3 h-full">
          {photos.map((img, idx) =>
            failed.includes(img) ? null : (
              <button
                key={img}
                data-property-thumb
                type="button"
                aria-label={`View photo ${valid.indexOf(img) + 1} of ${validCount}`}
                aria-current={index === idx ? 'true' : undefined}
                onClick={() => goTo(idx, { manual: true })}
                className={`relative h-[100px] lg:h-[150px] rounded-2xl overflow-hidden border-2 cursor-pointer transition-[border-color,box-shadow,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon ${
                  index === idx
                    ? 'border-persimmon ring-2 ring-persimmon/20'
                    : 'border-hairline opacity-80 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt=""
                  draggable={false}
                  onError={() => setFailed((f) => (f.includes(img) ? f : [...f, img]))}
                  className="w-full h-full object-cover"
                />
              </button>
            )
          )}
        </div>
      </div>

      {lightboxOpen && (
        <GalleryLightbox
          title={property.title}
          photos={valid}
          activeUrl={activeUrl}
          onNavigate={(url) => goTo(photos.indexOf(url), { manual: true, instant: true })}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

interface GalleryLightboxProps {
  title: string;
  photos: string[];
  activeUrl: string;
  onNavigate: (url: string) => void;
  onClose: () => void;
}

function GalleryLightbox({ title, photos, activeUrl, onNavigate, onClose }: GalleryLightboxProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [shownUrl, setShownUrl] = useState(activeUrl);
  const current = Math.max(0, photos.indexOf(shownUrl));

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (prefersReducedMotion() || !backdropRef.current || !contentRef.current) {
      onClose();
      return;
    }
    gsap.to(contentRef.current, { opacity: 0, scale: 0.98, duration: 0.18, ease: 'power2.in' });
    gsap.to(backdropRef.current, { opacity: 0, duration: 0.2, ease: 'power1.in', onComplete: onClose });
  }, [onClose]);

  const show = useCallback(
    async (url: string) => {
      const ok = await decodeUrl(url);
      if (!ok) return;
      setShownUrl(url);
      onNavigate(url);
      if (!prefersReducedMotion() && imgRef.current) {
        gsap.fromTo(imgRef.current, { opacity: 0.55 }, { opacity: 1, duration: 0.22, ease: 'power1.out' });
      }
    },
    [onNavigate]
  );

  const go = useCallback(
    (dir: 1 | -1) => {
      if (photos.length < 2) return;
      show(photos[(current + dir + photos.length) % photos.length]);
    },
    [current, photos, show]
  );

  // Open animation, scroll lock (with scrollbar compensation), focus management.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const body = document.body;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (sbw > 0) body.style.paddingRight = `${sbw}px`;
    closeBtnRef.current?.focus({ preventScroll: true });

    if (!prefersReducedMotion() && backdropRef.current && contentRef.current) {
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power1.out' });
      gsap.fromTo(
        contentRef.current,
        { opacity: 0, scale: 0.97 },
        { opacity: 1, scale: 1, duration: 0.3, ease: MOTION.ease.crispOut, clearProps: 'transform' }
      );
    }
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      } else if (e.key === 'ArrowRight') {
        go(1);
      } else if (e.key === 'ArrowLeft') {
        go(-1);
      } else if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, requestClose]);

  const swipe = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} photo gallery`}
    >
      <div ref={backdropRef} onClick={requestClose} className="fixed inset-0 bg-charcoal/90 backdrop-blur-md" />

      <div ref={contentRef} className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-4">
        <div className="w-full flex items-center justify-between text-white px-2">
          <div>
            <h3 className="font-headline text-sm sm:text-base font-bold">{title}</h3>
            <p className="text-xs text-white/70 tabular-nums" aria-live="polite">
              Photo {current + 1} of {photos.length} · Daylight verified
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={requestClose}
            aria-label="Close photo gallery"
            className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center nestly-press cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="relative w-full h-[55vh] sm:h-[68vh] rounded-3xl overflow-hidden bg-charcoal border border-white/15 flex items-center justify-center"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s) return;
            const dx = e.clientX - s.x;
            if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.3) go(dx < 0 ? 1 : -1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={shownUrl}
            alt={`${title} photo ${current + 1}`}
            draggable={false}
            className="w-full h-full object-contain select-none"
          />

          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => go(-1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-charcoal/75 hover:bg-persimmon text-white flex items-center justify-center border border-white/20 nestly-press cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => go(1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-charcoal/75 hover:bg-persimmon text-white flex items-center justify-center border border-white/20 nestly-press cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <div className="flex items-center gap-3 overflow-x-auto max-w-full py-1">
            {photos.map((img, i) => (
              <button
                key={img}
                type="button"
                onClick={() => show(img)}
                aria-label={`Show photo ${i + 1} of ${photos.length}`}
                aria-current={current === i ? 'true' : undefined}
                className={`w-20 h-14 rounded-xl overflow-hidden border-2 cursor-pointer shrink-0 transition-[border-color,opacity] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  current === i ? 'border-persimmon' : 'border-white/20 opacity-60 hover:opacity-100'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
