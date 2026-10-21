'use client';

import { useEffect, useRef } from 'react';

export interface UseDialogA11yOptions {
  isOpen: boolean;
  onClose?: () => void;
  containerRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  closeOnEscape?: boolean;
  lockScroll?: boolean;
  trapFocus?: boolean;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

// Module-level state tracking active scroll locks across overlapping dialogs/drawers
let activeScrollLocks = 0;
let savedBodyOverflow = '';
let savedBodyPaddingRight = '';

export function acquireScrollLock() {
  if (typeof document === 'undefined') return;
  if (activeScrollLocks === 0) {
    const body = document.body;
    savedBodyOverflow = body.style.overflow;
    savedBodyPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  activeScrollLocks += 1;
}

export function releaseScrollLock() {
  if (typeof document === 'undefined') return;
  activeScrollLocks = Math.max(0, activeScrollLocks - 1);
  if (activeScrollLocks === 0) {
    document.body.style.overflow = savedBodyOverflow;
    document.body.style.paddingRight = savedBodyPaddingRight;
  }
}

export function getActiveScrollLocks(): number {
  return activeScrollLocks;
}

export function resetScrollLocks(): void {
  activeScrollLocks = 0;
  savedBodyOverflow = '';
  savedBodyPaddingRight = '';
}

/**
 * Reusable hook managing accessibility for modal dialogs and slide-over drawers:
 * - Locks body scroll with reference-counted overlap protection and scrollbar shift compensation
 * - Restores body scroll only when all open dialog locks are released
 * - Sets initial focus once on open to designated ref or first interactive child
 * - Traps Tab / Shift+Tab keyboard navigation within the dialog container
 * - Handles Escape key dismissal through a stable callback strategy
 * - Ignores ordinary parent re-renders so typing, filtering, or list updates do not refocus or reset state
 * - Restores focus to opening trigger element upon close
 */
export function useDialogA11y({
  isOpen,
  onClose,
  containerRef,
  initialFocusRef,
  closeOnEscape = true,
  lockScroll = true,
  trapFocus = true,
  returnFocusRef,
}: UseDialogA11yOptions) {
  // Stable refs for caller-supplied values to avoid lifecycle restarts on ordinary rerenders
  const onCloseRef = useRef(onClose);
  const containerRefRef = useRef(containerRef);
  const initialFocusRefRef = useRef(initialFocusRef);
  const returnFocusRefRef = useRef(returnFocusRef);
  const closeOnEscapeRef = useRef(closeOnEscape);
  const lockScrollRef = useRef(lockScroll);
  const trapFocusRef = useRef(trapFocus);

  // Synchronize latest values after render without restarting the open lifecycle
  useEffect(() => {
    onCloseRef.current = onClose;
    containerRefRef.current = containerRef;
    initialFocusRefRef.current = initialFocusRef;
    returnFocusRefRef.current = returnFocusRef;
    closeOnEscapeRef.current = closeOnEscape;
    lockScrollRef.current = lockScroll;
    trapFocusRef.current = trapFocus;
  });

  useEffect(() => {
    if (!isOpen) return;

    // Capture the opening trigger element once upon open
    const opener = returnFocusRefRef.current?.current ?? (document.activeElement as HTMLElement | null);

    let didLock = false;
    if (lockScrollRef.current) {
      acquireScrollLock();
      didLock = true;
    }

    // Set initial focus once upon open
    const frameId = requestAnimationFrame(() => {
      if (initialFocusRefRef.current?.current) {
        initialFocusRefRef.current.current.focus({ preventScroll: true });
      } else if (containerRefRef.current?.current) {
        const container = containerRefRef.current.current;
        const focusable = container.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus({ preventScroll: true });
        } else {
          container.setAttribute('tabindex', '-1');
          container.focus({ preventScroll: true });
        }
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscapeRef.current && event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }

      if (trapFocusRef.current && event.key === 'Tab' && containerRefRef.current?.current) {
        const container = containerRefRef.current.current;
        const focusableElements = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);

        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === container) {
            event.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      if (didLock) {
        releaseScrollLock();
      }
      requestAnimationFrame(() => {
        const elementToFocus = returnFocusRefRef.current?.current ?? opener;
        elementToFocus?.focus?.({ preventScroll: true });
      });
    };
  }, [isOpen]);
}
