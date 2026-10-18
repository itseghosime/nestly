'use client';

import React, { use, useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import { useMessageStreamScroll } from '@/hooks/use-message-stream-scroll';
import {
  getAiOwnershipNotice,
  getConversationChannelNotice,
  getDeliveryLabel,
} from '@/lib/staff-conversation-status';
import { isTwilioMessageSid } from '@/lib/twilio-message-sid';
import {
  ArrowLeft,
  ArrowDown,
  Bot,
  User,
  CheckCircle2,
  Lock,
  ChevronRight,
  MapPin,
} from 'lucide-react';

type ThreadMessage = {
  id: string;
  direction: string;
  sender_type: 'customer' | 'nia' | 'agent' | 'system';
  content: string | null;
  delivery_status: string;
  dispatch_status: string;
  dispatch_error_code: string | null;
  dispatch_updated_at: string | null;
  has_provider_message_id: boolean;
  has_valid_provider_message_sid: boolean;
  created_at: string;
};

type Conversation = {
  id: string;
  channel: 'website' | 'whatsapp';
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED';
  assignedStaffId: string | null;
  assignedStaff: string;
  isAssignedToCurrentStaff: boolean;
  whatsappDispatchAvailable: boolean;
  whatsappOutboundEnabled: boolean;
  whatsappSendConfigured: boolean;
  whatsappStatusCallbackConfigured: boolean;
  canSendWhatsApp: boolean;
  createdAt: string;
  customer: { displayName: string; email: string; phone: string };
  property: { id: string | null; title: string; reference: string; location: string } | null;
  messages: ThreadMessage[];
};

type StaffNote = { id: string; note: string; created_at: string; author_id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isThreadSender(value: unknown): value is ThreadMessage['sender_type'] {
  return value === 'customer' || value === 'nia' || value === 'agent' || value === 'system';
}

function parseThreadMessage(value: unknown): ThreadMessage | null {
  if (
    !isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.direction !== 'string'
    || !isThreadSender(value.sender_type)
    || !(value.content === null || typeof value.content === 'string')
    || typeof value.delivery_status !== 'string'
    || typeof value.dispatch_status !== 'string'
    || !(value.dispatch_error_code === null || typeof value.dispatch_error_code === 'string')
    || !(value.dispatch_updated_at === null || typeof value.dispatch_updated_at === 'string')
    || typeof value.has_provider_message_id !== 'boolean'
    || typeof value.has_valid_provider_message_sid !== 'boolean'
    || typeof value.created_at !== 'string'
  ) return null;
  return {
    id: value.id,
    direction: value.direction,
    sender_type: value.sender_type,
    content: value.content,
    delivery_status: value.delivery_status,
    dispatch_status: value.dispatch_status,
    dispatch_error_code: value.dispatch_error_code,
    dispatch_updated_at: value.dispatch_updated_at,
    has_provider_message_id: value.has_provider_message_id,
    has_valid_provider_message_sid: value.has_valid_provider_message_sid,
    created_at: value.created_at,
  };
}

function localTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

export default function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [staffNotes, setStaffNotes] = useState<StaffNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [replyDraft, setReplyDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [reconcilingMessageId, setReconcilingMessageId] = useState<string | null>(null);
  const [reconciliationSids, setReconciliationSids] = useState<Record<string, string>>({});
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replyAnnouncement, setReplyAnnouncement] = useState('');
  const replyRequestRef = useRef<{ content: string; key: string } | null>(null);
  const messageKey = conversation
    ? `${conversation.id}:${messages.at(-1)?.id ?? 'empty'}`
    : null;
  const {
    containerRef: streamRef,
    handleScroll: handleStreamScroll,
    hasNewMessages,
    isNearBottom,
    requestScrollToLatest,
    scrollToLatest,
  } = useMessageStreamScroll(messageKey, Boolean(conversation) && !loading);
  const triageMode = conversation?.mode === 'HUMAN_ACTIVE'
    ? 'HUMAN'
    : conversation?.mode === 'CLOSED'
      ? 'CLOSED'
      : 'AI';
  const unresolvedWhatsAppSend = conversation?.channel === 'whatsapp'
    && messages.some((message) => (
      message.direction === 'outbound'
      && (message.dispatch_status === 'dispatching' || message.dispatch_status === 'unknown')
    ));

  const loadConversation = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [conversationResponse, notesResponse] = await Promise.all([
        fetch(`/api/staff/conversations/${resolvedParams.id}`),
        fetch(`/api/staff/notes?entity_type=conversation&entity_id=${encodeURIComponent(resolvedParams.id)}`),
      ]);
      const [conversationResult, notesResult] = await Promise.all([
        conversationResponse.json(),
        notesResponse.json(),
      ]);
      if (!conversationResponse.ok) throw new Error(conversationResult.error || 'Unable to load conversation');
      if (!notesResponse.ok) throw new Error(notesResult.error || 'Unable to load internal notes');
      const loaded = conversationResult.data as Conversation;
      setConversation(loaded);
      setMessages(loaded.messages || []);
      setStaffNotes(notesResult.data || []);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load conversation');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadConversation();
    });
    return () => {
      active = false;
    };
  }, [loadConversation]);

  useEffect(() => {
    if (!conversation || conversation.mode === 'CLOSED') return;
    const refresh = window.setInterval(() => void loadConversation(false), 8000);
    return () => window.clearInterval(refresh);
  }, [conversation, loadConversation]);

  useEffect(() => {
    const refreshTime = () => setCurrentTime(Date.now());
    refreshTime();
    const interval = window.setInterval(refreshTime, 8000);
    return () => window.clearInterval(interval);
  }, []);

  useGSAP(
    () => {
      if (!streamRef.current) return;
      const bubbles = streamRef.current.querySelectorAll('[data-thread-msg]');
      const last = bubbles[bubbles.length - 1];
      if (last && !prefersReducedMotion()) {
        gsap.fromTo(
          last,
          { y: 8, opacity: 0, scale: 0.98 },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.2,
            ease: MOTION.ease.crispOut,
            clearProps: 'transform,opacity',
          }
        );
      }
    },
    { dependencies: [messages.length] }
  );

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/staff/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'conversation',
          entityId: resolvedParams.id,
          body: newNote.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save internal note');
      setStaffNotes((current) => [result.data, ...current]);
      setNewNote('');
      setNotice('Internal note saved for authorized staff only.');
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : 'Unable to save internal note');
    } finally {
      setSaving(false);
    }
  };

  const updateMode = async (action: 'takeover' | 'return_to_ai' | 'close') => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/staff/conversations/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to update conversation ownership');
      await loadConversation(false);
      setNotice(action === 'takeover'
        ? 'Human takeover recorded. Queued AI replies are suppressed.'
        : action === 'return_to_ai'
          ? 'Conversation returned to AI mode. External dispatch remains unverified.'
          : 'Conversation closed. Queued AI replies are suppressed.');
    } catch (modeError) {
      setError(modeError instanceof Error ? modeError.message : 'Unable to update conversation ownership');
    } finally {
      setSaving(false);
    }
  };

  const handleSendReply = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = replyDraft.trim();
    if (
      !conversation
      || !content
      || sendingReply
      || conversation.mode !== 'HUMAN_ACTIVE'
      || (conversation.channel === 'whatsapp' && !conversation.canSendWhatsApp)
      || unresolvedWhatsAppSend
    ) return;

    const request = replyRequestRef.current?.content === content
      ? replyRequestRef.current
      : { content, key: crypto.randomUUID() };
    replyRequestRef.current = request;
    setSendingReply(true);
    setError('');
    try {
      const response = await fetch(`/api/staff/conversations/${resolvedParams.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': request.key,
        },
        body: JSON.stringify({ content }),
      });
      const resultValue: unknown = await response.json();
      const result = isRecord(resultValue) ? resultValue : {};
      const returnedMessage = parseThreadMessage(result.data);
      if (result.retryWithNewKey === true) replyRequestRef.current = null;
      if (returnedMessage) {
        requestScrollToLatest();
        setMessages((current) => (
          current.some((message) => message.id === returnedMessage.id)
            ? current
            : [...current, returnedMessage]
        ));
      }
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Unable to save staff reply');
      }
      if (!returnedMessage) {
        throw new Error('Reply status could not be confirmed. Refresh the conversation before sending again.');
      }
      if (
        conversation.channel === 'whatsapp'
        && returnedMessage
        && (returnedMessage.dispatch_status === 'unknown' || returnedMessage.dispatch_status === 'dispatching')
      ) {
        setReplyAnnouncement(
          typeof result.notice === 'string'
            ? result.notice
            : 'Twilio may have received this message. Do not resend until it is reconciled.',
        );
        return;
      }
      setReplyDraft('');
      replyRequestRef.current = null;
      setReplyAnnouncement(conversation.channel === 'website'
        ? 'Reply saved to website chat. It will be marked delivered when the customer loads it; no external message was sent.'
        : typeof result.notice === 'string'
          ? result.notice
          : 'Twilio accepted the reply. Delivery is not confirmed until a signed status callback arrives.');
    } catch (replyError) {
      setError(replyError instanceof Error ? replyError.message : 'Unable to save staff reply');
    } finally {
      setSendingReply(false);
    }
  };

  const reconcileTwilioMessage = async (message: ThreadMessage) => {
    if (!conversation || reconcilingMessageId) return;
    const providerMessageSid = reconciliationSids[message.id]?.trim();
    setReconcilingMessageId(message.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/staff/conversations/${conversation.id}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          ...(providerMessageSid ? { providerMessageSid } : {}),
        }),
      });
      const resultValue: unknown = await response.json();
      const result = isRecord(resultValue) ? resultValue : {};
      if (!response.ok) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Unable to verify Twilio status');
      }
      setReconciliationSids((current) => {
        const next = { ...current };
        delete next[message.id];
        return next;
      });
      await loadConversation(false);
      setNotice(typeof result.notice === 'string' ? result.notice : 'Twilio evidence was recorded. No message was resent.');
    } catch (reconciliationError) {
      setError(reconciliationError instanceof Error
        ? reconciliationError.message
        : 'Unable to verify Twilio status; do not resend this message.');
    } finally {
      setReconcilingMessageId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-warm">
        <StaffHeader breadcrumbs={[{ label: 'Inbox', href: '/staff/inbox' }, { label: 'Loading conversation' }]} />
        <main className="mx-auto w-full max-w-7xl p-4 text-sm text-muted-ink sm:p-8">Loading conversation…</main>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex min-h-screen flex-1 flex-col bg-warm">
        <StaffHeader breadcrumbs={[{ label: 'Inbox', href: '/staff/inbox' }, { label: 'Conversation unavailable' }]} />
        <main className="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-8">
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error || 'Conversation not found or not accessible.'}
          </div>
          <Link href="/staff/inbox" className="text-sm font-bold text-primary hover:underline">Back to inbox</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[
          { label: 'Inbox', href: '/staff/inbox' },
          { label: `${conversation.customer.displayName} (${conversation.id})` },
        ]}
      />

      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
        <div role="status" className="sr-only">{replyAnnouncement}</div>
        {/* Top Context & Navigation Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-hairline">
          <div className="flex items-center gap-3">
            <Link
              href="/staff/inbox"
              className="nestly-press inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-bold transition-all border border-hairline shadow-2xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Inbox</span>
            </Link>
            <span className="text-hairline">/</span>
            <div className="flex items-center gap-2">
              <span className="font-headline text-base sm:text-lg font-bold text-charcoal tracking-tight">
                {conversation.customer.displayName}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  triageMode === 'HUMAN'
                    ? 'bg-persimmon/10 text-persimmon'
                    : triageMode === 'AI'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-soft-stone text-muted-ink'
                }`}
              >
                {triageMode === 'HUMAN'
                  ? 'HUMAN_ACTIVE'
                  : triageMode === 'AI'
                    ? 'AI_ACTIVE'
                    : 'CLOSED'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-ink">{conversation.channel.toUpperCase()} · {localTimestamp(conversation.createdAt)}</span>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        )}
        {notice && (
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>
        )}

        {/* 3-Column Bespoke Grid Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ZONE 1: Thread Header, Meta & Takeover Protocol (Col span 3) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Customer Key Card */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-hairline space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-soft-stone text-primary font-bold text-sm flex items-center justify-center border border-hairline">
                  {conversation.customer.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-headline text-sm font-bold text-charcoal truncate">
                    {conversation.customer.displayName}
                  </h2>
                  <p className="text-xs font-mono text-muted-ink">
                    {conversation.customer.phone || conversation.customer.email || 'No contact details'}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-hairline text-xs">
                <div className="flex justify-between items-center text-charcoal/70">
                  <span>Channel:</span>
                  <span className="font-semibold text-charcoal flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    {conversation.channel}
                  </span>
                </div>
                <div className="flex justify-between items-center text-charcoal/70">
                  <span>Timezone:</span>
                  <span className="font-semibold text-charcoal">
                    WAT (UTC+1)
                  </span>
                </div>
                <div className="flex justify-between items-center text-charcoal/70">
                  <span>Assigned:</span>
                  <span className="font-semibold text-persimmon">
                    {conversation.assignedStaff}
                  </span>
                </div>
              </div>
            </div>

            {/* Takeover Control Bar */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-hairline space-y-3">
              <h3 className="text-xs font-bold text-charcoal uppercase tracking-wider">
                Takeover Control Bar
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void updateMode('takeover')}
                  disabled={saving || triageMode === 'CLOSED'}
                  className={`nestly-press w-full flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
                    triageMode === 'HUMAN'
                      ? 'bg-persimmon text-white shadow-xs'
                      : 'bg-soft-stone hover:bg-hairline text-charcoal'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5" />
                    <span>Human Active</span>
                  </span>
                  {triageMode === 'HUMAN' && (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void updateMode('return_to_ai')}
                  disabled={saving || triageMode === 'CLOSED'}
                  className={`nestly-press w-full flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
                    triageMode === 'AI'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-soft-stone hover:bg-hairline text-charcoal'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5" />
                    <span>Return to AI (Nia)</span>
                  </span>
                  {triageMode === 'AI' && (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void updateMode('close')}
                  disabled={saving || triageMode === 'CLOSED'}
                  className={`nestly-press w-full flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-bold transition-all ${
                    triageMode === 'CLOSED'
                      ? 'bg-charcoal text-white shadow-xs'
                      : 'bg-soft-stone hover:bg-hairline text-charcoal'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Close Conversation</span>
                  </span>
                </button>
              </div>

              {conversation?.mode === 'AI_ACTIVE' && (
                <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] leading-relaxed">
                  <strong>AI ownership recorded.</strong> {getAiOwnershipNotice(conversation.channel)}
                </div>
              )}
            </div>

          </div>

          {/* ZONE 2: Central Chat Thread, Events & Live Composer (Col span 5) */}
          <div className="lg:col-span-5 flex flex-col bg-white rounded-3xl shadow-sm border border-hairline overflow-hidden min-h-[620px]">
            {/* Chat Header */}
            <div className="px-5 py-3.5 bg-soft-stone/70 border-b border-hairline flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-bold text-charcoal">
                  Conversation Thread
                </span>
              </div>
              <span className="text-[11px] text-muted-ink font-semibold">
                {conversation
                  ? getConversationChannelNotice(conversation)
                  : 'Loading conversation status…'}
              </span>
            </div>

            {/* Message Stream */}
            <div
              ref={streamRef}
              onScroll={handleStreamScroll}
              aria-label="Conversation messages"
              className="relative flex-1 p-5 space-y-4 overflow-y-auto max-h-[460px] bg-warm/30"
            >
              <div className="flex justify-center">
                <span className="px-3 py-1 rounded-full bg-soft-stone text-muted-ink text-[10px] font-bold uppercase tracking-wider border border-hairline">
                  Today · Africa/Lagos (WAT)
                </span>
              </div>

              {messages.map((msg) => {
                const isUser = msg.sender_type === 'customer';
                const isStaff = msg.sender_type === 'agent';
                const dispatchAgeMs = currentTime - new Date(msg.dispatch_updated_at || msg.created_at).getTime();
                const dispatchIsStale = Number.isFinite(dispatchAgeMs) && dispatchAgeMs >= 15 * 60 * 1000;
                const senderName = isUser
                  ? conversation.customer.displayName
                  : msg.sender_type === 'nia'
                    ? 'Nia'
                    : msg.sender_type === 'agent'
                      ? conversation.assignedStaff
                      : 'System';

                return (
                  <div
                    key={msg.id}
                    data-thread-msg
                    className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-ink font-semibold mb-1 px-1">
                      <span>{senderName}</span>
                      <span>•</span>
                      <span>{localTimestamp(msg.created_at)} WAT</span>
                    </div>

                    <div
                      className={`max-w-[85%] p-4 rounded-3xl text-xs leading-relaxed ${
                        isUser
                          ? 'bg-white text-charcoal border border-hairline shadow-2xs rounded-bl-xs'
                          : isStaff
                            ? 'bg-charcoal text-white rounded-br-xs shadow-2xs'
                            : 'bg-emerald-50 text-emerald-950 border border-emerald-200 rounded-br-xs shadow-2xs'
                      }`}
                    >
                      <p>{msg.content || '[Message content unavailable]'}</p>
                      {msg.direction === 'outbound' && (
                        <p className="mt-2 text-[10px] opacity-70">
                          {getDeliveryLabel(
                            msg.delivery_status,
                            conversation.channel,
                            msg.dispatch_status,
                            msg.has_valid_provider_message_sid,
                          )}
                        </p>
                      )}
                      {conversation.channel === 'whatsapp'
                        && (msg.dispatch_status === 'dispatching' || msg.dispatch_status === 'unknown') && (
                        <div className="mt-3 max-w-[min(85vw,24rem)] space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-[11px] leading-relaxed text-amber-950">
                          <p>
                            This send is unresolved. Do not resend. After 15 minutes, verify its exact Twilio record; a missing search result does not prove it was not sent.
                          </p>
                          <p>
                            Dispatch state last changed {localTimestamp(msg.dispatch_updated_at || msg.created_at)} WAT.
                            {' '}{dispatchIsStale ? 'Provider verification is available.' : 'Provider verification unlocks after 15 minutes.'}
                          </p>
                          {!msg.has_provider_message_id && (
                            <label className="block space-y-1">
                              <span className="font-semibold">MessageSid from Twilio Console</span>
                              <input
                                type="text"
                                value={reconciliationSids[msg.id] || ''}
                                onChange={(event) => setReconciliationSids((current) => ({
                                  ...current,
                                  [msg.id]: event.target.value,
                                }))}
                                placeholder="SM followed by 32 hex characters"
                                autoComplete="off"
                                spellCheck={false}
                                className="w-full rounded-lg border border-amber-400 bg-white px-2 py-1.5 font-mono text-[10px] text-charcoal"
                              />
                            </label>
                          )}
                          <p>
                            The server checks the provider account, sender, recipient, exact message and creation time. It records the provider status and an audit event; it never sends a replacement.
                          </p>
                          <button
                            type="button"
                            onClick={() => void reconcileTwilioMessage(msg)}
                            disabled={
                              reconcilingMessageId !== null
                              || !dispatchIsStale
                              || (!msg.has_provider_message_id && !isTwilioMessageSid(reconciliationSids[msg.id]))
                            }
                            className="rounded-full border border-amber-700 px-3 py-1.5 font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {reconcilingMessageId === msg.id
                              ? 'Checking Twilio…'
                              : 'Verify Twilio status'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {hasNewMessages && !isNearBottom && (
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

            {(conversation.channel === 'website' && triageMode === 'HUMAN')
              || (conversation.channel === 'whatsapp' && triageMode === 'HUMAN' && conversation.canSendWhatsApp) ? (
              <form onSubmit={handleSendReply} className="border-t border-hairline bg-white p-4 space-y-2">
                <label htmlFor="conversation-staff-reply" className="block text-xs font-bold text-charcoal">
                  {conversation.channel === 'website' ? 'Reply in website chat' : 'Reply in WhatsApp via Twilio'}
                </label>
                <textarea
                  id="conversation-staff-reply"
                  value={replyDraft}
                  onChange={(event) => {
                    setReplyAnnouncement('');
                    setReplyDraft(event.target.value);
                  }}
                  maxLength={4000}
                  rows={3}
                  disabled={unresolvedWhatsAppSend}
                  placeholder={conversation.channel === 'website'
                    ? 'Write a reply for the customer’s saved website conversation…'
                    : 'Write a WhatsApp reply…'}
                  className="w-full resize-y rounded-2xl border border-hairline bg-warm px-3 py-2 text-sm text-charcoal outline-none focus:border-primary"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] leading-relaxed text-muted-ink">
                    {unresolvedWhatsAppSend
                      ? 'A previous send outcome is unresolved. Do not retry until a signed callback or manual reconciliation updates it.'
                      : conversation.channel === 'website'
                        ? 'Saved to this website conversation only. External delivery is not configured.'
                        : 'Sent through the configured Twilio WhatsApp sender. Delivery is confirmed only by a signed status callback.'}
                  </p>
                  <button
                    type="submit"
                    disabled={sendingReply || unresolvedWhatsAppSend || !replyDraft.trim()}
                    className="nestly-press shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {sendingReply
                      ? (conversation.channel === 'website' ? 'Saving…' : 'Sending…')
                      : 'Send reply'}
                  </button>
                </div>
                {replyAnnouncement && (
                  <p role="status" className="text-[11px] leading-relaxed text-muted-ink">{replyAnnouncement}</p>
                )}
              </form>
            ) : (
              <div className="border-t border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
                {conversation.channel === 'whatsapp'
                  ? triageMode === 'HUMAN'
                    ? !conversation.whatsappDispatchAvailable
                      ? 'Twilio staff replies are unavailable until the additive message-tracking migration is applied to this database. No external message was sent.'
                      : !conversation.whatsappOutboundEnabled
                        ? 'Twilio staff sending is disabled for this deployment. No external message was sent.'
                        : !conversation.whatsappSendConfigured
                          ? 'Twilio staff send configuration is incomplete. No external message was sent.'
                        : !conversation.isAssignedToCurrentStaff
                          ? `This conversation is assigned to ${conversation.assignedStaff}. Only the assigned staff member can send a WhatsApp reply.`
                        : 'Your staff role is not authorized to send WhatsApp replies.'
                    : triageMode === 'CLOSED'
                      ? 'This conversation is closed. Reopen or take over only through the authorized staff workflow before replying.'
                      : 'Take over this WhatsApp conversation before replying. Nia stays paused while staff owns it.'
                  : 'Website replies use the direct Next.js API. Twilio staff sending and delivery status do not apply to this channel.'}
              </div>
            )}
          </div>

          {/* ZONE 3: Linked Property & Internal Staff Notes (Col span 4) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Linked Property Card */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-hairline space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                  Linked Property File
                </span>
                {conversation.property && (
                  <Link
                    href={`/staff/properties/${conversation.property.id}/preview`}
                    className="text-xs font-bold text-persimmon hover:underline flex items-center gap-1"
                  >
                    <span>Preview</span>
                    <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
              </div>

              {conversation.property ? (
                <div className="rounded-2xl bg-soft-stone p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase text-muted-ink">
                    {conversation.property.reference || 'Linked record'}
                  </span>
                  <h3 className="font-headline text-sm font-bold text-charcoal">
                    {conversation.property.title}
                  </h3>
                  <p className="text-xs text-muted-ink flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>{conversation.property.location}</span>
                  </p>
                </div>
              ) : (
                <p className="rounded-2xl bg-soft-stone p-4 text-xs text-muted-ink">
                  No property is linked to this conversation.
                </p>
              )}
            </div>

            {/* Scheduled Inspection Summary */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-hairline space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                  Related Inspection
                </span>
                <span className="px-2 py-0.5 rounded-full bg-soft-stone text-muted-ink text-[10px] font-bold">
                  Not linked
                </span>
              </div>

              <div className="space-y-1 text-xs">
                <p className="text-muted-ink">Inspection requests and gate details are managed from the Inspection Calendar.</p>
              </div>
            </div>

            {/* Internal Staff Notes */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-hairline space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Internal Coordinator Notes
              </span>
              <div className="space-y-2">
                {staffNotes.length === 0 && (
                  <p className="text-xs text-muted-ink">No internal notes for this conversation.</p>
                )}
                {staffNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-2xl bg-soft-stone border border-hairline text-xs text-charcoal/80 leading-relaxed"
                  >
                    <p>{note.note}</p>
                    <time className="mt-2 block text-[10px] text-muted-ink">{localTimestamp(note.created_at)} WAT</time>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddNote} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add private staff note..."
                  className="flex-1 bg-warm rounded-full px-3.5 py-2 text-xs text-charcoal placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="submit"
                  disabled={!newNote.trim() || saving}
                  className="nestly-press px-3.5 py-2 rounded-full bg-charcoal text-white text-xs font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Add'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
