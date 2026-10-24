'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  X,
  Mic,
  Loader2,
  Send,
  Copy,
  Check,
  ShieldCheck,
  ChevronRight,
  Home,
  Minus,
  Maximize2,
  RotateCcw,
  AlertCircle,
  ArrowDown,
  Square,
} from 'lucide-react';
import {
  isNiaWebsiteConversationSnapshot,
  isNiaWebsiteReply,
} from '@/lib/backend/nia-conversation-contract';
import { useDialogA11y } from '@/hooks/use-dialog-a11y';
import type { NiaSearchProperty } from '@/lib/backend/nia-property-search';
import { useSavedHomes } from '@/lib/saved-homes-context';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { useVoiceNote } from '@/hooks/use-voice-note';
import { appendVoiceTranscript } from '@/lib/voice-recording';
import { useMessageStreamScroll } from '@/hooks/use-message-stream-scroll';

export type NiaConversationState =
  | 'idle'
  | 'composing'
  | 'waiting'
  | 'replying'
  | 'error';

interface NiaMessage {
  id: string;
  sender: 'user' | 'nia' | 'agent' | 'system';
  text: string;
  time: string;
  properties?: NiaSearchProperty[];
  isError?: boolean;
  failedQuery?: string;
}

interface NiaWidgetProps {
  isOpenExternal?: boolean;
  onCloseExternal?: () => void;
}

const STATE_LABELS: Record<
  NiaConversationState,
  { badge: string; subtext: string; dotClass: string }
> = {
  idle: {
    badge: 'Property Search',
    subtext: 'Here to help with your home search',
    dotClass: 'bg-emerald-400',
  },
  composing: {
    badge: 'Composing',
    subtext: 'Drafting your question...',
    dotClass: 'bg-amber-300',
  },
  waiting: {
    badge: 'Searching Listings',
    subtext: 'Checking current published property records...',
    dotClass: 'bg-persimmon',
  },
  replying: {
    badge: 'Preparing Results',
    subtext: 'Formatting public listing details...',
    dotClass: 'bg-emerald-300',
  },
  error: {
    badge: 'Search Unavailable',
    subtext: 'Could not load listing results · Retry available',
    dotClass: 'bg-rose-400',
  },
};

const WELCOME_MESSAGE: NiaMessage = {
  id: 'nia-welcome',
  sender: 'nia',
  text: 'Hey! 👋 I’m Nia, Nestly’s virtual property assistant. What kind of home are you looking for?',
  time: 'Just now',
};

function localMessageTime(value: string) {
  return new Intl.DateTimeFormat('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

export function NiaWidget({ isOpenExternal, onCloseExternal }: NiaWidgetProps) {
  const [isOpenInternal, setIsOpenInternal] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport, { passive: true });
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  const [inputVal, setInputVal] = useState('');
  const [pendingState, setPendingState] = useState<'none' | 'waiting' | 'replying'>('none');
  const [modeState, setModeState] = useState<'normal' | 'error'>('normal');
  const [conversationMode, setConversationMode] = useState<'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED' | null>(null);
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);

  const { savedProperties } = useSavedHomes();

  const panelRef = useRef<HTMLDivElement>(null);
  const minimizedRef = useRef<HTMLDivElement>(null);
  const launcherBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const msgIdCounterRef = useRef(1);
  const failedRequestRef = useRef<{ query: string; key: string } | null>(null);

  const isOpen = Boolean(isOpenExternal || isOpenInternal);
  const voice = useVoiceNote({
    enabled: isOpen && !isMinimized && conversationMode !== 'CLOSED' && pendingState === 'none',
    onTranscript: useCallback((text: string) => { setInputVal(current => appendVoiceTranscript(current, text)); inputRef.current?.focus(); }, []),
  });

  const setIsOpen = useCallback(
    (val: boolean) => {
      if (!val && onCloseExternal) onCloseExternal();
      setIsOpenInternal(val);
      if (val) {
        setIsMinimized(false);
      }
    },
    [onCloseExternal]
  );

  // Derive explicit conversation state
  const conversationState: NiaConversationState = (() => {
    if (pendingState === 'waiting') return 'waiting';
    if (pendingState === 'replying') return 'replying';
    if (modeState === 'error') return 'error';
    if (inputVal.trim().length > 0) return 'composing';
    return 'idle';
  })();

  const [messages, setMessages] = useState<NiaMessage[]>([WELCOME_MESSAGE]);
  const {
    containerRef: messagesContainerRef,
    handleScroll: handleMessagesScroll,
    hasNewMessages: hasUnreadBelow,
    isNearBottom,
    requestScrollToLatest,
    scrollToLatest,
  } = useMessageStreamScroll(messages.at(-1)?.id ?? null, isOpen && !isMinimized);

  const loadSavedConversation = useCallback(async (forceScrollToLatest = false) => {
    const response = await fetch('/api/nia/conversations', { cache: 'no-store' });
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error('Saved conversation is temporarily unavailable');
    if (
      !result
      || typeof result !== 'object'
      || !('data' in result)
      || result.data === null
    ) {
      if (forceScrollToLatest) requestScrollToLatest();
      setConversationMode(null);
      setMessages([WELCOME_MESSAGE]);
      return;
    }
    const data = (result as { data: unknown }).data;
    if (!isNiaWebsiteConversationSnapshot(data)) {
      throw new Error('Saved conversation returned an invalid response');
    }
    const savedMessages: NiaMessage[] = data.messages.map((message) => ({
      id: message.id,
      sender: message.senderType === 'customer'
        ? 'user'
        : message.senderType === 'agent'
          ? 'agent'
          : message.senderType,
      text: message.content ?? '[Message content unavailable]',
      time: localMessageTime(message.createdAt),
    }));
    const latestNiaMessage = [...savedMessages].reverse().find((message) => message.sender === 'nia');
    if (latestNiaMessage && data.currentProperties.length) {
      latestNiaMessage.properties = data.currentProperties;
    }
    if (forceScrollToLatest) requestScrollToLatest();
    setConversationMode(data.mode);
    setMessages([WELCOME_MESSAGE, ...savedMessages]);

    const pendingDeliveryIds = data.messages
      .filter((message) => (
        message.senderType !== 'customer'
        && message.deliveryStatus === 'queued'
      ))
      .map((message) => message.id);
    if (pendingDeliveryIds.length) {
      try {
        const acknowledgement = await fetch('/api/nia/conversations/acknowledgements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageIds: pendingDeliveryIds }),
        });
        if (!acknowledgement.ok) {
          console.error('Website message delivery acknowledgement failed', acknowledgement.status);
        }
      } catch {
        console.error('Website message delivery acknowledgement request failed');
      }
    }
  }, [requestScrollToLatest]);

  useEffect(() => {
    void loadSavedConversation(true).catch(() => {
      setModeState('error');
      setMessages((current) => current.length ? current : [WELCOME_MESSAGE]);
    });
  }, [loadSavedConversation]);

  useEffect(() => {
    if (!isOpen || !conversationMode) return;
    const refresh = window.setInterval(() => {
      void loadSavedConversation().catch(() => undefined);
    }, 10000);
    return () => window.clearInterval(refresh);
  }, [conversationMode, isOpen, loadSavedConversation]);

  const clearPendingTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  // Animate panel open
  useGSAP(
    () => {
      if (!isOpen || isMinimized || !panelRef.current || prefersReducedMotion()) return;
      gsap.fromTo(
        panelRef.current,
        { y: 20, opacity: 0, scale: 0.97 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: MOTION.duration.normal,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [isOpen, isMinimized] }
  );

  // Animate minimized bar
  useGSAP(
    () => {
      if (!isOpen || !isMinimized || !minimizedRef.current || prefersReducedMotion()) return;
      gsap.fromTo(
        minimizedRef.current,
        { y: 12, opacity: 0, scale: 0.96 },
        {
          y: 0,
          opacity: 1,
          scale: 1,
          duration: 0.22,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [isOpen, isMinimized] }
  );

  // Animate newly added message bubble
  useGSAP(
    () => {
      const container = messagesContainerRef.current;
      if (!container) return;

      const items = container.querySelectorAll('[data-nia-msg]');
      const lastItem = items[items.length - 1];
      if (lastItem && !prefersReducedMotion()) {
        gsap.fromTo(
          lastItem,
          { y: 10, opacity: 0, scale: 0.98 },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.26,
            ease: MOTION.ease.softOut,
            clearProps: 'transform,opacity',
          }
        );
      }

    },
    { dependencies: [messages.length] }
  );

  // Accessible dialog management (body scroll lock and focus trap on mobile; single unified Escape handler on all viewports)
  useDialogA11y({
    isOpen: isOpen && !isMinimized,
    onClose: () => {
      if (pendingState !== 'none') {
        clearPendingTimers();
        setPendingState('none');
      } else {
        setIsOpen(false);
      }
    },
    containerRef: panelRef,
    lockScroll: isMobileViewport,
    trapFocus: isMobileViewport,
    closeOnEscape: true,
    returnFocusRef: launcherBtnRef,
  });

  const handleSend = (textToSend?: string, isRetry = false) => {
    const q = (textToSend ?? inputVal).trim();
    if (!q || pendingState !== 'none' || voice.isBusy) return;

    clearPendingTimers();
    const requestKey = isRetry && failedRequestRef.current?.query === q
      ? failedRequestRef.current.key
      : crypto.randomUUID();
    failedRequestRef.current = { query: q, key: requestKey };
    if (!isRetry) {
      requestScrollToLatest();
      msgIdCounterRef.current += 1;
      const userMsg: NiaMessage = {
        id: `pending-${requestKey}`,
        sender: 'user',
        text: q,
        time: 'Just now',
      };
      setMessages((prev) => [...prev, userMsg]);
      setInputVal('');
    }

    setModeState('normal');
    setLastFailedQuery(null);
    setPendingState('waiting');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const pendingTimer = setTimeout(() => {
      setPendingState('replying');
    }, 280);
    timersRef.current = [pendingTimer];

    const complete = async () => {
      try {
        const response = await fetch('/api/nia/conversations/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestKey,
          },
          body: JSON.stringify({ content: q }),
          signal: controller.signal,
        });
        const result: unknown = await response.json().catch(() => null);
        if (
          !response.ok
          || !result
          || typeof result !== 'object'
          || !('data' in result)
          || !isNiaWebsiteReply(result.data)
        ) {
          const errorMessage = result && typeof result === 'object' && 'error' in result
            && typeof result.error === 'string'
            ? result.error
            : 'Your message could not be saved';
          throw new Error(errorMessage);
        }
        setConversationMode(result.data.mode);
        const savedReply = result.data;
        requestScrollToLatest();
        setMessages((current) => [...current.filter((message) => !message.isError), {
          id: `reply-${requestKey}`,
          sender: savedReply.mode === 'AI_ACTIVE' ? 'nia' : 'system',
          text: savedReply.message,
          properties: savedReply.properties,
          time: 'Just now',
        }]);
        // The POST has already persisted this reply. History hydration must not delay showing it.
        void loadSavedConversation(true).catch(() => undefined);
        failedRequestRef.current = null;
        setLastFailedQuery(null);
        setModeState('normal');
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setModeState('error');
        setLastFailedQuery(q);
        msgIdCounterRef.current += 1;
        setMessages((prev) => [
          ...prev.filter((message) => !message.isError),
          {
            id: `err-${msgIdCounterRef.current}`,
            sender: 'system',
            text: requestError instanceof Error
              ? requestError.message
              : 'Nia could not complete the saved conversation request.',
            time: 'Just now',
            isError: true,
            failedQuery: q,
          },
        ]);
      } finally {
        timersRef.current.forEach((timer) => clearTimeout(timer));
        timersRef.current = [];
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
        setPendingState('none');
      }
    };

    void complete();
  };

  const handleCancelPending = () => {
    clearPendingTimers();
    setPendingState('none');
    msgIdCounterRef.current += 1;
    const cancelId = msgIdCounterRef.current;
    requestScrollToLatest();
    setMessages((prev) => [
      ...prev,
      {
        id: `cancel-${cancelId}`,
        sender: 'system',
        text: 'The request was cancelled locally; your message may already have been saved.',
        time: 'Just now',
      },
    ]);
  };

  const handleRetryFailed = (queryToRetry?: string) => {
    const q = queryToRetry || lastFailedQuery;
    if (!q) return;
    setMessages((prev) => prev.filter((m) => !m.isError));
    handleSend(q, true);
  };

  const handleCopyShortlist = () => {
    if (savedProperties.length === 0) {
      navigator.clipboard.writeText('Nestly Saved Shortlist: Browse homes at https://nestly.ng/browse');
    } else {
      const summary = savedProperties
        .map(
          (p, i) =>
            `${i + 1}. ${p.title} (${p.neighborhood}, ${p.city}) - ${p.priceFormatted}/yr [Ref: ${p.id}]`
        )
        .join('\n');
      navigator.clipboard.writeText(
        `Nestly Shortlist (${savedProperties.length} saved homes):\n${summary}\n\nRequest an inspection on Nestly`
      );
    }
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2500);
  };

  const stateMeta = STATE_LABELS[conversationState];
  const isReplyPending = pendingState === 'waiting' || pendingState === 'replying';

  return (
    <>
      {/* Floating Launcher Button (Subtle, calm presence — no constant pulse/bounce loops) */}
      {(!isOpen || isMinimized) && (
        <div className="fixed bottom-6 right-6 z-40">
          {isOpen && isMinimized ? (
            <div
              ref={minimizedRef}
              className="flex items-center gap-3 pl-3.5 pr-2.5 py-2.5 rounded-full bg-primary text-white shadow-[0_10px_28px_rgba(23,63,53,0.28)] border border-emerald-900/40"
            >
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="flex items-center gap-2.5 text-left pr-2"
                aria-label="Expand Nia assistant window"
              >
                <div className="relative w-7 h-7 rounded-full bg-secondary-container text-primary flex items-center justify-center font-bold text-xs">
                  <span
                    className={`w-2 h-2 rounded-full ${stateMeta.dotClass} absolute -top-0.5 -right-0.5 ring-2 ring-primary`}
                  />
                  <span>N</span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Nia Assistant</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-white/10 text-emerald-200">
                      {stateMeta.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/75 truncate max-w-[160px]">
                    {messages[messages.length - 1]?.text}
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                aria-label="Expand Nia panel"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMinimized(false);
                  setIsOpen(false);
                }}
                aria-label="Close Nia panel"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              ref={launcherBtnRef}
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Open Nia Property Assistant"
              className="nestly-press flex items-center gap-3 pl-3 pr-5 py-3 rounded-full bg-primary hover:bg-[#0f2c25] text-white shadow-[0_8px_24px_rgba(23,63,53,0.24)] hover:shadow-[0_12px_32px_rgba(23,63,53,0.32)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 group border border-emerald-900/30"
            >
              <div className="relative w-8 h-8 rounded-full bg-secondary-container text-primary flex items-center justify-center font-bold text-xs shadow-inner">
                <span className="w-2 h-2 rounded-full bg-emerald-400 absolute -top-0.5 -right-0.5 ring-2 ring-primary" />
                <span>N</span>
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold tracking-tight text-white">Ask Nia</span>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-white/10 text-emerald-200">
                    Search
                  </span>
                </div>
                <p className="text-[11px] text-white/75 font-medium">Current published listings</p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Interactive Popover Dialog */}
      {isOpen && !isMinimized && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Nia Property Assistant"
          data-nia-state={conversationState}
          className="fixed inset-0 sm:inset-auto sm:bottom-24 sm:right-6 sm:w-[410px] sm:h-[640px] max-h-[100dvh] bg-warm rounded-none sm:rounded-3xl shadow-2xl z-50 flex flex-col border border-hairline overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 bg-primary text-white flex items-center justify-between border-b border-emerald-950">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-9 h-9 rounded-full bg-secondary-container text-primary flex items-center justify-center font-bold text-sm shrink-0">
                <span>N</span>
                <span
                  className={`w-2.5 h-2.5 rounded-full ${stateMeta.dotClass} absolute -bottom-0.5 -right-0.5 ring-2 ring-primary`}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="font-bold text-sm truncate">Nia · Property Assistant</h3>
                  <span
                    data-testid="nia-state-badge"
                    className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-emerald-100"
                  >
                    {stateMeta.badge}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-200/85 truncate">{stateMeta.subtext}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                aria-label="Minimize Nia assistant"
                title="Minimize"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close Nia assistant"
                title="Close (Esc)"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Assistant Info & Mode Controls Bar */}
          <div className="px-4 py-2 bg-soft-stone border-b border-hairline flex items-center justify-between text-[11px] text-muted-ink gap-2">
            <span className="flex items-center gap-1 font-medium truncate">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">
                {conversationMode === 'HUMAN_ACTIVE'
                  ? 'Nestly team handoff active · Replies appear here'
                  : conversationMode === 'CLOSED'
                    ? 'This conversation is closed'
                    : 'Current public listings · Conversation saved in this browser'}
              </span>
            </span>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleCopyShortlist}
                className="text-persimmon font-bold hover:underline flex items-center gap-1"
              >
                {copiedText ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Share Shortlist</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            aria-label="Conversation messages"
            className="relative flex-1 overflow-y-auto p-4 space-y-3.5"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                data-nia-msg
                className={`flex flex-col ${
                  msg.sender === 'user'
                    ? 'items-end'
                    : msg.sender === 'system'
                    ? 'items-center'
                    : 'items-start'
                }`}
              >
                {msg.sender === 'system' && !msg.isError ? (
                  <div className="px-3 py-1 rounded-full bg-soft-stone border border-hairline text-[11px] text-muted-ink font-medium">
                    {msg.text}
                  </div>
                ) : msg.isError ? (
                  <div className="w-full rounded-2xl p-3.5 bg-rose-50 border border-rose-200 text-rose-900 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div className="text-[14px] leading-relaxed">
                        <p className="font-bold">Unable to save message</p>
                        <p className="text-rose-700 mt-0.5">{msg.text}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleRetryFailed(msg.failedQuery)}
                        className="nestly-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry Question</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setModeState('normal');
                          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                        }}
                        className="px-3 py-1.5 rounded-full bg-white border border-rose-200 text-rose-700 text-[11px] font-semibold hover:bg-rose-100/50 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed shadow-2xs ${
                        msg.sender === 'user'
                          ? 'bg-primary text-white rounded-tr-xs'
                          : msg.sender === 'agent'
                            ? 'bg-charcoal text-white rounded-tl-xs'
                            : 'bg-white text-charcoal border border-hairline rounded-tl-xs'
                      }`}
                    >
                      <p>{msg.text}</p>
                    </div>
                    <span className="text-[10px] text-muted-ink mt-1 px-1">
                      {msg.sender === 'nia'
                        ? 'Nia • '
                        : msg.sender === 'agent'
                          ? 'Nestly team • '
                          : 'You • '}
                      {msg.time}
                    </span>
                  </>
                )}

                {/* Optional Property Attachment */}
                {msg.properties?.map((property) => (
                  <div
                    key={property.id}
                    className="mt-2 w-full max-w-[290px] bg-white rounded-2xl p-2.5 border border-hairline shadow-xs hover:border-charcoal/30 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        aria-hidden="true"
                        className="w-14 h-14 rounded-xl bg-soft-stone text-muted-ink flex items-center justify-center shrink-0"
                      >
                        <Home className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-charcoal truncate">{property.title}</h4>
                        {property.location && (
                          <p className="text-[10px] text-muted-ink truncate">{property.location}</p>
                        )}
                        <p className="text-[11px] font-extrabold text-persimmon">
                          {property.priceLabel}
                        </p>
                        <Link
                          href={`/property/${property.id}`}
                          onClick={() => setIsOpen(false)}
                          className="text-[11px] text-primary font-bold hover:underline flex items-center gap-0.5 mt-0.5"
                        >
                          <span>View current listing</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {/* Pending Typing Indicator — rendered ONLY when a reply is actually pending */}
            {isReplyPending && (
              <div
                data-testid="nia-typing-indicator"
                className="flex items-center justify-between gap-2 bg-white border border-hairline rounded-2xl rounded-tl-xs px-3.5 py-2.5 max-w-[88%] shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.1s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-ink">
                    {pendingState === 'waiting'
                      ? 'Searching current listings...'
                      : 'Preparing listing details...'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCancelPending}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-soft-stone hover:bg-stone-card text-[10px] font-bold text-charcoal transition-colors"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Cancel</span>
                </button>
              </div>
            )}

            {/* Floating New-Message Indicator when user scrolled up */}
            {hasUnreadBelow && !isNearBottom && (
              <div className="sticky bottom-2 flex justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={scrollToLatest}
                  className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-charcoal text-white text-[11px] font-bold shadow-md hover:bg-black transition-all"
                >
                  <span>New messages</span>
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Prompt Suggestions & State Triggers */}
          <div className="px-3 py-2 bg-soft-stone/70 border-t border-hairline flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              disabled={isReplyPending}
              onClick={() => handleSend('Homes with 24hr solar in Benin')}
              className="nestly-press text-[11px] font-semibold text-charcoal bg-white border border-hairline px-3 py-1 rounded-full whitespace-nowrap hover:border-charcoal/40 disabled:opacity-40 transition-colors"
            >
              ⚡ 24hr Solar in Benin
            </button>
            <button
              type="button"
              disabled={isReplyPending}
              onClick={() => handleSend('Sapele rentals on Clinic Road')}
              className="nestly-press text-[11px] font-semibold text-charcoal bg-white border border-hairline px-3 py-1 rounded-full whitespace-nowrap hover:border-charcoal/40 disabled:opacity-40 transition-colors"
            >
              📍 Sapele Clinic Road
            </button>
            <button
              type="button"
              disabled={isReplyPending}
              onClick={() => handleSend('How do physical inspections work?')}
              className="nestly-press text-[11px] font-semibold text-charcoal bg-white border border-hairline px-3 py-1 rounded-full whitespace-nowrap hover:border-charcoal/40 disabled:opacity-40 transition-colors"
            >
              🔑 Inspection Process
            </button>
            <button
              type="button"
              disabled={isReplyPending}
              onClick={() => handleSend('Request field officer handoff')}
              className="nestly-press text-[11px] font-semibold text-charcoal bg-white border border-hairline px-3 py-1 rounded-full whitespace-nowrap hover:border-charcoal/40 disabled:opacity-40 transition-colors"
            >
              👤 Request staff handoff
            </button>
          </div>

          {(voice.isBusy || voice.error) && (
            <div className="px-4 py-2 bg-soft-stone border-t border-hairline text-xs flex items-center justify-between gap-2">
              <span role={voice.error ? 'alert' : 'status'} aria-live="polite" className={voice.error ? 'text-rose-700' : 'text-charcoal'}>
                {voice.error || (voice.state === 'recording' ? `Recording ${voice.seconds}s / 60s · Stop to transcribe` : voice.state === 'transcribing' ? 'Transcribing… Review the text before sending.' : 'Allow microphone access to record.')}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {voice.canRetry && <button type="button" onClick={voice.retry} className="font-semibold text-primary">Retry transcription</button>}
                <button type="button" onClick={voice.cancel} className="font-semibold text-charcoal underline">Cancel recording</button>
              </div>
            </div>
          )}
          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-3 bg-white border-t border-hairline flex items-center gap-2"
          >
            <div className="nia-compact-field min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={(e) => {
                setInputVal(e.target.value);
                if (modeState === 'error') setModeState('normal');
              }}
              placeholder={
                isReplyPending
                  ? 'Reply in progress...'
                  : conversationMode === 'HUMAN_ACTIVE'
                    ? 'Message the Nestly team...'
                    : 'Ask Nia about listings, rent, or visits...'
              }
              className="nia-compact-input h-9 w-full px-3.5 py-2.5 rounded-full bg-soft-stone text-[14px] text-charcoal placeholder-muted-ink focus:outline-none focus:ring-1 focus:ring-primary"
            />
            </div>
            {voice.supported && voice.available && (
              <button type="button"
                onClick={voice.state === 'recording' ? voice.stop : voice.start}
                disabled={isReplyPending || conversationMode === 'CLOSED' || voice.state === 'transcribing' || voice.state === 'requesting'}
                aria-label={voice.state === 'recording' ? 'Stop recording and transcribe' : 'Record voice note'}
                title="Record up to 60 seconds. Audio is sent for transcription; review the text before sending."
                className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40 ${voice.state === 'recording' ? 'bg-rose-600 text-white' : 'bg-soft-stone text-charcoal hover:bg-hairline'}`}>
                {voice.state === 'transcribing' || voice.state === 'requesting' ? <Loader2 className="w-4 h-4 animate-spin" /> : voice.state === 'recording' ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-4 h-4" />}
              </button>
            )}
            {isReplyPending ? (
              <button
                type="button"
                onClick={handleCancelPending}
                aria-label="Cancel pending reply"
                title="Cancel reply"
                className="w-9 h-9 rounded-full bg-charcoal hover:bg-black text-white flex items-center justify-center transition-colors shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!inputVal.trim() || conversationMode === 'CLOSED' || voice.isBusy}
                aria-label="Send message to Nia"
                className="nestly-press w-9 h-9 rounded-full bg-persimmon hover:bg-persimmon-hover disabled:opacity-40 text-white flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
