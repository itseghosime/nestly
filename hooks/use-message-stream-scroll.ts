'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

const BOTTOM_THRESHOLD = 80;

export function useMessageStreamScroll(messageKey: string | null, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const isNearBottomRef = useRef(true);
  const shouldForceScrollRef = useRef(true);
  const wasVisibleRef = useRef(false);
  const previousMessageKeyRef = useRef(messageKey);

  const performScrollToLatest = useCallback((behavior?: ScrollBehavior) => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: behavior ?? (prefersReducedMotion() ? 'auto' : 'smooth'),
    });
    shouldForceScrollRef.current = false;
    isNearBottomRef.current = true;
    setIsNearBottom(true);
    setHasNewMessages(false);
  }, []);
  const scrollToLatest = useCallback(() => {
    performScrollToLatest();
  }, [performScrollToLatest]);

  const requestScrollToLatest = useCallback(() => {
    shouldForceScrollRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distance <= BOTTOM_THRESHOLD;
    isNearBottomRef.current = nearBottom;
    setIsNearBottom(nearBottom);
    if (nearBottom) setHasNewMessages(false);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) {
      wasVisibleRef.current = false;
      shouldForceScrollRef.current = true;
      return;
    }

    const wasVisible = wasVisibleRef.current;
    const messageChanged = messageKey !== previousMessageKeyRef.current;
    const forceScroll = shouldForceScrollRef.current || !wasVisible;
    const animationFrames: number[] = [];

    const scheduleScroll = (guardNearBottom: boolean, behavior?: ScrollBehavior) => {
      const firstFrame = window.requestAnimationFrame(() => {
        const secondFrame = window.requestAnimationFrame(() => {
          if (guardNearBottom && !isNearBottomRef.current) {
            setHasNewMessages(true);
            return;
          }
          performScrollToLatest(behavior);
        });
        animationFrames.push(secondFrame);
      });
      animationFrames.push(firstFrame);
    };

    if (forceScroll) {
      scheduleScroll(false, wasVisible ? undefined : 'auto');
    } else if (messageChanged && isNearBottomRef.current) {
      scheduleScroll(true);
    } else if (messageChanged) {
      setHasNewMessages(true);
    }

    previousMessageKeyRef.current = messageKey;
    wasVisibleRef.current = true;

    return () => animationFrames.forEach((frame) => window.cancelAnimationFrame(frame));
  }, [enabled, messageKey, performScrollToLatest]);

  return {
    containerRef,
    handleScroll,
    hasNewMessages,
    isNearBottom,
    requestScrollToLatest,
    scrollToLatest,
  };
}
