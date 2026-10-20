"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import Link from "next/link";
import { StaffHeader } from "@/components/staff/StaffHeader";
import {
  CheckCircle2,
  MessageSquare,
  Calendar,
  Building,
  ArrowRight,
  Search,
  RefreshCw,
} from "lucide-react";

interface Notification {
  id: string;
  type: "escalation" | "inspection" | "listing" | "system";
  title: string;
  badge: string;
  description: string;
  createdAt: string;
  channel: string;
  statusText: string;
  isRead: boolean;
  readAt: string | null;
  href: string | null;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<
    "all" | "failed" | "escalation" | "inspection" | "unread"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingNotificationIds, setUpdatingNotificationIds] = useState<string[]>([]);

  const loadNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (filter === "failed") params.set("status", "failed");
      if (filter === "escalation" || filter === "inspection") params.set("kind", filter);
      const response = await fetch(`/api/staff/notifications?${params}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load notifications");
      setNotifications(result.data as Notification[]);
      setTotal(result.total || 0);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load notifications");
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  const updateReadState = async (notification: Notification) => {
    const isRead = !notification.isRead;
    setUpdatingNotificationIds((current) => [...current, notification.id]);
    try {
      const response = await fetch("/api/staff/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notification.id, isRead }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result
          && typeof result.error === "string"
          ? result.error
          : "Unable to update notification read state";
        throw new Error(message);
      }
      if (
        !result
        || typeof result !== "object"
        || !("isRead" in result)
        || result.isRead !== isRead
      ) {
        throw new Error("The server returned an invalid notification read-state response.");
      }
      const readAt = "readAt" in result && typeof result.readAt === "string"
        ? result.readAt
        : null;
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, isRead, readAt } : item
      )));
      setError("");
      window.dispatchEvent(new Event("staff-activity-changed"));
    } catch (updateError) {
      setError(updateError instanceof Error
        ? updateError.message
        : "Unable to update notification read state");
    } finally {
      setUpdatingNotificationIds((current) => current.filter((id) => id !== notification.id));
    }
  };

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) void loadNotifications();
    };
    void Promise.resolve().then(refresh);
    const interval = window.setInterval(refresh, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  useGSAP(() => {
    if (prefersReducedMotion() || !listRef.current) return;
    const rows = listRef.current.querySelectorAll('[data-notif-row]');
    if (!rows.length) return;
    gsap.fromTo(rows, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.16, stagger: 0.025, ease: MOTION.ease.crispOut, overwrite: 'auto', clearProps: 'transform,opacity' });
  }, { dependencies: [filter, searchQuery], scope: listRef });

  const filteredNotifs = notifications.filter((n) => {
    const matchesSearch =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      filter === "failed" ||
      (filter === "unread" && !n.isRead) ||
      (filter === "escalation" && n.type === "escalation") ||
      (filter === "inspection" && n.type === "inspection");

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader
        breadcrumbs={[{ label: "Notifications & Alerts" }]}
        actions={
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadNotifications();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold transition-colors border border-hairline shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-ink" />
            <span>Refresh</span>
          </button>
        }
      />

      <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full space-y-6">
        {/* Page Context Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-persimmon px-2.5 py-0.5 rounded-full bg-persimmon/10">
                Persisted staff alerts
              </span>
              <span className="text-xs text-muted-ink">Refreshes every 15 seconds</span>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl font-bold text-charcoal tracking-tight">
              Operations Dispatch & Alerts
            </h1>
            <p className="text-sm text-charcoal/70">
              Delivery and handoff events from the configured database. Personal message content is not shown here.
            </p>
          </div>
        </div>

        {/* Filter Pills Bar */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-hairline space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  if (filter === "all" && page === 1) return;
                  setFilter("all");
                  setPage(1);
                  setLoading(true);
                }}
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full transition-all ${
                  filter === "all"
                    ? "bg-charcoal text-white font-bold"
                    : "bg-soft-stone text-charcoal/70 hover:bg-hairline"
                }`}
              >
                All ({filter === "all" ? total : "—"})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (filter === "unread" && page === 1) return;
                  setFilter("unread");
                  setPage(1);
                  setLoading(true);
                }}
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full transition-all ${
                  filter === "unread"
                    ? "bg-charcoal text-white font-bold"
                    : "bg-soft-stone text-charcoal/70 hover:bg-hairline"
                }`}
              >
                Unread on page
              </button>
              <button
                type="button"
                onClick={() => {
                  if (filter === "failed" && page === 1) return;
                  setFilter("failed");
                  setPage(1);
                  setLoading(true);
                }}
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full transition-all ${
                  filter === "failed"
                    ? "bg-persimmon text-white font-bold"
                    : "bg-soft-stone text-charcoal/70 hover:bg-hairline"
                }`}
              >
                Failed delivery
              </button>
              <button
                type="button"
                onClick={() => {
                  if (filter === "escalation" && page === 1) return;
                  setFilter("escalation");
                  setPage(1);
                  setLoading(true);
                }}
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full transition-all ${
                  filter === "escalation"
                    ? "bg-primary text-white font-bold"
                    : "bg-soft-stone text-charcoal/70 hover:bg-hairline"
                }`}
              >
                Escalations
              </button>
              <button
                type="button"
                onClick={() => {
                  if (filter === "inspection" && page === 1) return;
                  setFilter("inspection");
                  setPage(1);
                  setLoading(true);
                }}
                className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full transition-all ${
                  filter === "inspection"
                    ? "bg-emerald-700 text-white font-bold"
                    : "bg-soft-stone text-charcoal/70 hover:bg-hairline"
                }`}
              >
                Inspection Requests
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-muted-ink absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search alerts on this page..."
                className="pl-10 pr-4 py-2 bg-warm rounded-full text-xs text-charcoal placeholder:text-muted-ink/60 border border-hairline focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Notifications Feed (8 cols) */}
          <div ref={listRef} className="lg:col-span-8 space-y-4">
            {loading ? (
              <div className="rounded-3xl border border-hairline bg-white p-8 text-center text-sm text-muted-ink">
                Loading notification records…
              </div>
            ) : filteredNotifs.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-hairline space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h3 className="font-headline font-bold text-sm text-charcoal">
                  {notifications.length === 0 ? "No notification records" : "No matching alerts"}
                </h3>
                <p className="text-xs text-muted-ink">
                  No persisted records match the current filters and staff permissions.
                </p>
              </div>
            ) : (
              filteredNotifs.map((n) => (
                <article
                  data-notif-row
                  key={n.id}
                  className={`p-5 rounded-3xl bg-white shadow-sm border transition-all flex flex-col gap-3 ${
                    n.statusText === "failed"
                      ? "border-persimmon/40 ring-1 ring-persimmon/10"
                      : "border-hairline"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          n.type === "escalation"
                            ? "bg-persimmon/10 text-persimmon"
                            : n.type === "inspection"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-soft-stone text-charcoal"
                        }`}
                      >
                        {n.type === "escalation" ? (
                          <MessageSquare className="w-4 h-4" />
                        ) : n.type === "inspection" ? (
                          <Calendar className="w-4 h-4" />
                        ) : (
                          <Building className="w-4 h-4" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-persimmon" aria-label="Unread" />
                          )}
                          {n.statusText === "failed" && (
                            <span className="w-2 h-2 rounded-full bg-persimmon animate-pulse"></span>
                          )}
                          <h3 className="font-headline text-sm font-bold text-charcoal">
                            {n.title}
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-soft-stone text-muted-ink text-[10px] font-bold uppercase">
                            {n.badge}
                          </span>
                        </div>
                        <p className="text-xs text-charcoal/70 leading-relaxed">
                          {n.description}
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] text-muted-ink font-semibold shrink-0 bg-soft-stone px-2.5 py-1 rounded-full">
                      {formatTimestamp(n.createdAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 items-center justify-between pt-2 border-t border-hairline text-xs">
                    <span className="text-[11px] text-muted-ink font-medium">
                      Channel: {n.channel} ·{" "}
                      <strong className="text-charcoal">{n.statusText}</strong>
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-muted-ink">
                        {n.isRead ? "Read" : "Unread"}
                      </span>
                      <button
                        type="button"
                        aria-label={`${n.isRead ? "Mark as unread" : "Mark as read"}: ${n.title}`}
                        onClick={() => void updateReadState(n)}
                        disabled={updatingNotificationIds.includes(n.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-hairline bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold disabled:opacity-50"
                      >
                        {updatingNotificationIds.includes(n.id)
                          ? "Updating…"
                          : n.isRead
                            ? "Mark unread"
                            : "Mark read"}
                      </button>
                      {n.href ? (
                        <Link
                          href={n.href}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-xs font-bold transition-all shadow-2xs"
                        >
                          <span>Open Details</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      ) : (
                        <span className="text-[11px] text-muted-ink">No linked record</span>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
            {!loading && total > 0 && (
              <div className="flex items-center justify-between rounded-2xl border border-hairline bg-white px-4 py-3 text-xs text-muted-ink">
                <span>Page {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPage((current) => Math.max(1, current - 1));
                      setLoading(true);
                    }}
                    disabled={page === 1}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-full border border-hairline bg-soft-stone hover:bg-hairline text-charcoal font-semibold disabled:opacity-40 shrink-0 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPage((current) => current + 1);
                      setLoading(true);
                    }}
                    disabled={page >= Math.ceil(total / 50)}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-full border border-hairline bg-soft-stone hover:bg-hairline text-charcoal font-semibold disabled:opacity-40 shrink-0 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Summary Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-4 sticky top-24">
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-hairline space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-ink">
                Alert types on this page
              </span>
              <div className="space-y-2 text-xs">
                <div className="p-3 rounded-2xl bg-persimmon/10 text-charcoal flex justify-between items-center">
                  <span className="font-bold text-persimmon">
                    Handoff events
                  </span>
                  <span className="font-bold">{filteredNotifs.filter((n) => n.type === "escalation").length}</span>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50 text-charcoal flex justify-between items-center">
                  <span className="font-bold text-emerald-800">
                    Inspection events
                  </span>
                  <span className="font-bold">{filteredNotifs.filter((n) => n.type === "inspection").length}</span>
                </div>
                <div className="p-3 rounded-2xl bg-soft-stone text-charcoal flex justify-between items-center">
                  <span className="font-bold text-muted-ink">
                    Listing events
                  </span>
                  <span className="font-bold">{filteredNotifs.filter((n) => n.type === "listing").length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
