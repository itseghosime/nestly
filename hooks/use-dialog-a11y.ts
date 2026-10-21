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

/**
 * Reusable hook managing accessibility for modal dialogs and slide-over drawers:
 * - Locks body scroll with scrollbar shift compensation
 * - Restores body scroll upon close
 * - Sets initial focus to designated ref or first interactive child
 * - Traps Tab / Shift+Tab keyboard navigation within the dialog
 * - Handles Escape key dismissal
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
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Capture opener trigger
    previousFocusRef.current = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);

    let prevOverflow = '';
    let prevPadding = '';
    if (lockScroll) {
      const body = document.body;
      prevOverflow = body.style.overflow;
      prevPadding = body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    // Set initial focus
    const frameId = requestAnimationFrame(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus({ preventScroll: true });
      } else if (containerRef.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus({ preventScroll: true });
        } else {
          containerRef.current.setAttribute('tabindex', '-1');
          containerRef.current.focus({ preventScroll: true });
        }
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (trapFocus && event.key === 'Tab' && containerRef.current) {
        const focusableElements = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
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
          if (document.activeElement === firstElement || document.activeElement === containerRef.current) {
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
      if (lockScroll) {
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPadding;
      }
      const elementToFocus = returnFocusRef?.current ?? previousFocusRef.current;
      elementToFocus?.focus?.({ preventScroll: true });
    };
  }, [isOpen, onClose, containerRef, initialFocusRef, closeOnEscape, lockScroll, trapFocus, returnFocusRef]);
}
