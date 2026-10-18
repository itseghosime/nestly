'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  ChevronRight,
  Bot,
  UserCheck,
  Building,
  RefreshCw,
} from 'lucide-react';

type ConversationSummary = {
  id: string;
  channel: 'website' | 'whatsapp' | 'telegram';
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED';
  customerName: string;
  customerPhone: string;
  telegramUsername: string | null;
  propertyTitle: string;
  propertyReference: string | null;
  assignedStaff: string;
  lastMessage: string;
  lastSender: string | null;
  lastTimestamp: string;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  }).format(new Date(value));
}

export default function ConversationInboxPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED'>('ALL');
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'website' | 'whatsapp' | 'telegram'>('ALL');
  const [humanOnly, setHumanOnly] = useState(false);
  const [selectedConvId, setSelectedConvId] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const listRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      const mode = humanOnly ? 'HUMAN_ACTIVE' : statusFilter;
      if (mode !== 'ALL') params.set('mode', mode);
      if (channelFilter !== 'ALL') params.set('channel', channelFilter);
      const response = await fetch(`/api/staff/conversations?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load conversations');
      const records = result.data as ConversationSummary[];
      setConversations(records);
      setTotal(result.total || 0);
      setSelectedConvId((current) => (
        records.some((conversation) => conversation.id === current)
          ? current
          : records[0]?.id || ''
      ));
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load conversations');
    } finally {
      setLoading(false);
    }
  }, [channelFilter, humanOnly, page, statusFilter]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadConversations();
    });
    return () => {
      active = false;
    };
  }, [loadConversations]);

  const filteredConversations = conversations.filter((conv) => {
        const matchesSearch =
          conv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          conv.customerPhone.includes(searchQuery) ||
          (conv.propertyTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
          conv.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesSearch;
      });

  const selectedConversation = filteredConversations.find((item) => item.id === selectedConvId)
    || filteredConversations[0]
    || null;
  const aiCount = conversations.filter((conversation) => conversation.mode === 'AI_ACTIVE').length;
  const humanCount = conversations.filter((conversation) => conversation.mode === 'HUMAN_ACTIVE').length;
  const closedCount = conversations.filter((conversation) => conversation.mode === 'CLOSED').length;

  useGSAP(
    () => {
      if (prefersReducedMotion() || !listRef.current) return;
      const rows = listRef.current.querySelectorAll('[data-inbox-row]');
      if (!rows.length) return;
      gsap.fromTo(
        rows,
        { y: 8, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.2,
          stagger: 0.03,
          ease: MOTION.ease.crispOut,
          overwrite: 'auto',
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [statusFilter, humanOnly, searchQuery, conversations.length], scope: listRef }
  );

  useGSAP(
    () => {
      if (prefersReducedMotion() || !previewRef.current) return;
      gsap.fromTo(
        previewRef.current,
        { opacity: 0.75, y: 4 },
        {
          opacity: 1,
          y: 0,
          duration: 0.18,
          ease: MOTION.ease.crispOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [selectedConversation?.id] }
  );

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: 'Conversations Inbox' }]}
        actions={
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadConversations();
            }}
            disabled={loading}
            className="nestly-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold transition-colors border border-hairline disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-ink" />
            <span>Refresh queue</span>
          </button>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Header / Context Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Conversation Inbox
            </h1>
            <p className="text-sm text-charcoal/70 mt-0.5">
              Persisted website and WhatsApp conversation records visible to your staff role and zone.
            </p>
          </div>

          {/* Quick Stats Metric Pills */}
          <div className="flex items-center gap-3 overflow-x-auto py-1">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-full border border-hairline shadow-2xs">
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold text-xs">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-ink uppercase font-bold">AI active (page)</span>
                <span className="font-headline text-sm font-bold text-charcoal leading-none">{aiCount}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-full border border-hairline shadow-2xs">
              <div className="w-7 h-7 rounded-full bg-persimmon/10 text-persimmon flex items-center justify-center font-bold text-xs">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-ink uppercase font-bold">Human active (page)</span>
                <span className="font-headline text-sm font-bold text-persimmon leading-none">{humanCount}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-full border border-hairline shadow-2xs">
              <div className="w-7 h-7 rounded-full bg-soft-stone text-muted-ink flex items-center justify-center font-bold text-xs">
                <Clock className="w-4 h-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-ink uppercase font-bold">Closed (page)</span>
                <span className="font-headline text-sm font-bold text-charcoal leading-none">{closedCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Controls Section */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-hairline space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Search Input Container */}
            <div className="relative flex-1 min-w-[280px]">
              <Search className="w-4 h-4 text-muted-ink absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations on this page by name, phone, or property..."
                className="w-full pl-11 pr-4 py-2.5 bg-warm rounded-full text-xs text-charcoal placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-ink hover:text-charcoal text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHumanOnly(!humanOnly);
                setStatusFilter('ALL');
                setPage(1);
                }}
                className={`nestly-press flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold transition-colors border ${
                  humanOnly
                    ? 'bg-persimmon text-white border-persimmon'
                    : 'bg-soft-stone hover:bg-hairline text-charcoal border-hairline'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${humanOnly ? 'bg-white' : 'bg-persimmon'}`}></span>
                <span>Human-owned only</span>
              </button>
            </div>
          </div>

          {/* Mode Filters (Segmented Pill Array) */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hairline text-xs font-semibold">
            <span className="text-[11px] font-bold text-muted-ink uppercase tracking-wider mr-1">Status:</span>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setPage(1);
              }}
              className={`nestly-press px-3.5 py-1.5 rounded-full transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-charcoal text-white font-bold'
                  : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('AI_ACTIVE');
                setHumanOnly(false);
                setPage(1);
              }}
              className={`nestly-press px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
                statusFilter === 'AI_ACTIVE'
                  ? 'bg-emerald-700 text-white font-bold'
                  : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              AI Active
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('HUMAN_ACTIVE');
                setHumanOnly(false);
                setPage(1);
              }}
              className={`nestly-press px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
                statusFilter === 'HUMAN_ACTIVE'
                  ? 'bg-persimmon text-white font-bold'
                  : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
              Human Escalate
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('CLOSED');
                setHumanOnly(false);
                setPage(1);
              }}
              className={`nestly-press px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all ${
                statusFilter === 'CLOSED'
                  ? 'bg-charcoal text-white font-bold'
                  : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
              }`}
            >
              Closed
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-hairline text-xs font-semibold">
            <span className="text-[11px] font-bold text-muted-ink uppercase tracking-wider mr-1">Channel:</span>
            {(['ALL', 'website', 'whatsapp', 'telegram'] as const).map((channel) => (
              <button
                key={channel}
                type="button"
                onClick={() => {
                  setChannelFilter(channel);
                  setPage(1);
                }}
                className={`nestly-press px-3.5 py-1.5 rounded-full capitalize transition-all ${
                  channelFilter === channel
                    ? 'bg-charcoal text-white font-bold'
                    : 'bg-soft-stone text-charcoal/70 hover:bg-hairline'
                }`}
              >
                {channel === 'ALL' ? 'All channels' : channel}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Primary Split Workspace: Left List + Right Fast-Preview Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Conversation Queue */}
          <div ref={listRef} className="lg:col-span-7 xl:col-span-8 space-y-3">
            {loading ? (
              <div className="rounded-3xl border border-hairline bg-white p-8 text-center text-sm text-muted-ink">Loading conversations…</div>
            ) : error ? (
              <div role="status" className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-800">
                Conversation list unavailable until staff access is restored.
              </div>
            ) : filteredConversations.length === 0 ? (
              <div data-inbox-row className="bg-white rounded-3xl p-12 text-center border border-hairline space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="font-headline text-lg font-bold text-charcoal">
                  {conversations.length === 0 ? 'No conversations available' : 'No matching conversations'}
                </h3>
                <p className="text-xs text-charcoal/70 max-w-md mx-auto">
                  No records are available for the current staff scope and filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('ALL');
                    setHumanOnly(false);
                    setPage(1);
                  }}
                  className="nestly-press px-4 py-2 rounded-full bg-soft-stone text-charcoal text-xs font-bold hover:bg-hairline"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedConvId === conv.id;
                const isHuman = conv.mode === 'HUMAN_ACTIVE';

                return (
                  <div
                    key={conv.id}
                    data-inbox-row
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`p-4 sm:p-5 rounded-3xl transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-white ring-2 ring-primary border-transparent shadow-sm'
                        : 'bg-white hover:bg-soft-stone/60 border-hairline'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <div
                            className={`w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold ${
                              isHuman ? 'bg-persimmon/10 text-persimmon' : 'bg-emerald-50 text-emerald-800'
                            }`}
                          >
                            {conv.customerName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                          {isHuman && (
                            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-persimmon ring-2 ring-white"></span>
                          )}
                        </div>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-charcoal truncate">
                              {conv.customerName}
                            </span>
                            <span className="text-[11px] font-mono text-muted-ink">
                              {conv.channel === 'telegram'
                                ? conv.telegramUsername
                                  ? `@${conv.telegramUsername}`
                                  : 'Telegram private chat'
                                : conv.customerPhone}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isHuman
                                  ? 'bg-persimmon/10 text-persimmon'
                                  : conv.mode === 'CLOSED'
                                    ? 'bg-soft-stone text-muted-ink'
                                    : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {conv.mode}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-soft-stone text-charcoal/70 text-[10px] font-semibold border border-hairline">
                              {conv.channel}
                            </span>
                          </div>

                          <p className="text-xs text-charcoal font-medium line-clamp-1">
                            &quot;{conv.lastMessage}&quot;
                          </p>

                          <div className="flex items-center gap-2 pt-1 text-xs text-muted-ink">
                            <Building className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="truncate">{conv.propertyTitle}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0 gap-2">
                        <span className="text-[11px] font-semibold text-muted-ink">
                          {formatTimestamp(conv.lastTimestamp)}
                        </span>
                        <Link
                          href={`/staff/inbox/${conv.id}`}
                          className="w-7 h-7 rounded-full bg-soft-stone hover:bg-persimmon hover:text-white text-charcoal flex items-center justify-center transition-colors shadow-2xs"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {!loading && total > 0 && (
              <div className="flex items-center justify-between rounded-2xl border border-hairline bg-white px-4 py-3 text-xs text-muted-ink">
                <span>
                  Showing {(page - 1) * 100 + 1}–{Math.min(page * 100, total)} of {total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                    className="rounded-full border border-hairline px-3 py-1.5 font-semibold text-charcoal disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span>Page {page} of {Math.ceil(total / 100)}</span>
                  <button
                    type="button"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={page >= Math.ceil(total / 100)}
                    className="rounded-full border border-hairline px-3 py-1.5 font-semibold text-charcoal disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Fast Preview Sidebar */}
          <div className="lg:col-span-5 xl:col-span-4 sticky top-24">
            {selectedConversation ? (
              <div ref={previewRef} className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-5">
                <div className="flex items-start justify-between pb-3 border-b border-hairline">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                      Fast Triage Preview
                    </span>
                    <h3 className="font-headline text-base font-bold text-charcoal mt-0.5">
                      {selectedConversation.customerName}
                    </h3>
                    <p className="text-xs font-mono text-muted-ink">{selectedConversation.customerPhone || 'No phone provided'}</p>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      selectedConversation.mode === 'HUMAN_ACTIVE'
                        ? 'bg-persimmon/10 text-persimmon'
                        : selectedConversation.mode === 'CLOSED'
                          ? 'bg-soft-stone text-muted-ink'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {selectedConversation.mode}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-soft-stone border border-hairline space-y-1.5">
                  <span className="text-[10px] font-bold uppercase text-muted-ink">Linked Listing</span>
                  <p className="text-xs font-bold text-charcoal">{selectedConversation.propertyTitle}</p>
                  {selectedConversation.propertyReference && (
                    <p className="text-[11px] text-muted-ink">Reference: {selectedConversation.propertyReference}</p>
                  )}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-charcoal/70">
                    <span>Channel: {selectedConversation.channel}</span>
                    <span>{selectedConversation.assignedStaff === 'Unassigned' ? 'Unassigned' : `Assigned: ${selectedConversation.assignedStaff}`}</span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold uppercase text-muted-ink">Latest persisted message</span>
                  <div className="rounded-2xl border border-hairline bg-soft-stone p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold opacity-75">
                      <span>{selectedConversation.lastSender || 'No sender'}</span>
                      <span>{formatTimestamp(selectedConversation.lastTimestamp)}</span>
                    </div>
                    <p className="leading-relaxed">{selectedConversation.lastMessage}</p>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-hairline">
                  <Link
                    href={`/staff/inbox/${selectedConversation.id}`}
                    className="nestly-press w-full py-3 px-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
                  >
                    <span>Open Conversation Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <div ref={previewRef} className="rounded-3xl border border-hairline bg-white p-6 text-sm text-muted-ink">
                Select a conversation to view its persisted summary.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
