"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { z } from "zod";
import { MOTION, prefersReducedMotion } from "@/lib/motion";
import { StaffHeader } from "@/components/staff/StaffHeader";
import {
  activateNotificationSound,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from "@/lib/notification-sound";
import {
  Building2,
  Clock,
  Sun,
  ShieldCheck,
  BellRing,
  MapPin,
  CheckCircle2,
  Lock,
  Globe,
  Sliders,
  Save,
  RotateCcw,
  Volume2,
  MessageSquare,
  MailCheck,
  Minus,
  Plus,
} from "lucide-react";

interface ZoneItem {
  id: string;
  name: string;
  subtext: string;
  active: boolean;
}

const workspaceSettingsResponseSchema = z.object({
  data: z.object({
    workspace_name: z.string().min(1).max(120),
    default_inspection_duration_mins: z.number().int().min(15).max(240),
    transit_buffer_mins: z.number().int().min(0).max(240),
    daylight_lock: z.boolean(),
    daylight_start: z.string(),
    daylight_end: z.string(),
    retention_days: z.number().int().min(30).max(3650),
    updated_at: z.string(),
    updated_by: z.string().nullable(),
  }),
});

const coverageResponseSchema = z.object({
  data: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    active: z.boolean(),
  })),
  canManage: z.boolean(),
});

const coverageUpdateResponseSchema = z.object({
  data: z.object({
    id: z.string().uuid(),
    name: z.string(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    active: z.boolean(),
  }),
});

type WorkspaceSettings = z.infer<typeof workspaceSettingsResponseSchema>["data"];

async function fetchWorkspaceSettings(): Promise<WorkspaceSettings> {
  const response = await fetch("/api/staff/workspace", { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  const parsed = workspaceSettingsResponseSchema.safeParse(body);
  if (!response.ok || !parsed.success) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "Unable to load workspace settings";
    throw new Error(message);
  }
  return parsed.data.data;
}

async function fetchCoverage() {
  const response = await fetch("/api/staff/workspace/coverage", { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  const parsed = coverageResponseSchema.safeParse(body);
  if (!response.ok || !parsed.success) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : "Unable to load coverage areas";
    throw new Error(message);
  }
  return parsed.data;
}

export default function WorkspaceSettingsPage() {
  const [workspaceName, setWorkspaceName] = useState("Nestly");
  const [duration, setDuration] = useState(90);
  const [buffer, setBuffer] = useState(30);
  const [daylightLock, setDaylightLock] = useState(true);
  const [daylightStart, setDaylightStart] = useState("09:00");
  const [daylightEnd, setDaylightEnd] = useState("17:00");
  const [retentionDays, setRetentionDays] = useState(365);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [coverageCanManage, setCoverageCanManage] = useState(false);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [coverageSavingId, setCoverageSavingId] = useState<string | null>(null);
  const [coverageError, setCoverageError] = useState("");
  const [soundAlerts, setSoundAlerts] = useState(false);
  const [soundPreferenceLoaded, setSoundPreferenceLoaded] = useState(false);
  const [soundError, setSoundError] = useState("");
  const toastRef = useRef<HTMLDivElement>(null);

  const coverageAreaCount = zones.length;
  const activeCoverageCount = zones.filter((zone) => zone.active).length;

  const applySettings = useCallback((settings: WorkspaceSettings) => {
    setWorkspaceName(settings.workspace_name);
    setDuration(settings.default_inspection_duration_mins);
    setBuffer(settings.transit_buffer_mins);
    setDaylightLock(settings.daylight_lock);
    setDaylightStart(settings.daylight_start.slice(0, 5));
    setDaylightEnd(settings.daylight_end.slice(0, 5));
    setRetentionDays(settings.retention_days);
    setLastUpdated(settings.updated_at);
  }, []);

  const applyCoverage = useCallback((items: Awaited<ReturnType<typeof fetchCoverage>>["data"]) => {
    setZones(items.map((item) => ({
      id: item.id,
      name: item.name,
      subtext: [item.city, item.state].filter(Boolean).join(" · ") || "Location not specified",
      active: item.active,
    })));
  }, []);

  useEffect(() => {
    let active = true;
    fetchWorkspaceSettings()
      .then((settings) => {
        if (active) {
          applySettings(settings);
          setSettingsLoaded(true);
          setSettingsError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setSettingsError(loadError instanceof Error ? loadError.message : "Unable to load workspace settings");
        }
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applySettings]);

  useEffect(() => {
    let active = true;
    fetchCoverage()
      .then((result) => {
        if (!active) return;
        applyCoverage(result.data);
        setCoverageCanManage(result.canManage);
        setCoverageError("");
      })
      .catch((loadError: unknown) => {
        if (active) setCoverageError(loadError instanceof Error ? loadError.message : "Unable to load coverage areas");
      })
      .finally(() => {
        if (active) setCoverageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyCoverage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setSoundAlerts(isNotificationSoundEnabled());
      } catch {
        setSoundError("This browser does not allow saving a local sound preference.");
      } finally {
        setSoundPreferenceLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useGSAP(() => {
    if (!toastMessage || !toastRef.current || prefersReducedMotion()) return;
    gsap.fromTo(toastRef.current, { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.22, ease: MOTION.ease.crispOut, clearProps: 'transform,opacity' });
  }, { dependencies: [toastMessage] });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError("");
    try {
      const response = await fetch("/api/staff/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceName,
          defaultInspectionDurationMins: duration,
          transitBufferMins: buffer,
          daylightLock,
          daylightStart,
          daylightEnd,
          retentionDays,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = workspaceSettingsResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "Unable to save workspace settings";
        throw new Error(message);
      }
      applySettings(parsed.data.data);
      setSettingsLoaded(true);
      window.dispatchEvent(new Event("staff-workspace-updated"));
      showToast("Workspace settings saved to the connected database");
    } catch (saveError) {
      setSettingsError(saveError instanceof Error ? saveError.message : "Unable to save workspace settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleCoverageChange = async (zone: ZoneItem, active: boolean) => {
    setCoverageSavingId(zone.id);
    setCoverageError("");
    try {
      const response = await fetch("/api/staff/workspace/coverage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: zone.id, active }),
      });
      const body: unknown = await response.json().catch(() => null);
      const parsed = coverageUpdateResponseSchema.safeParse(body);
      if (!response.ok || !parsed.success) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "Unable to update coverage area";
        throw new Error(message);
      }
      const updated = parsed.data.data;
      setZones((current) => current.map((item) => item.id === zone.id
        ? {
          id: updated.id,
          name: updated.name,
          subtext: [updated.city, updated.state].filter(Boolean).join(" · ") || "Location not specified",
          active: updated.active,
        }
        : item));
      showToast("Coverage area updated");
    } catch (saveError) {
      setCoverageError(saveError instanceof Error ? saveError.message : "Unable to update coverage area");
    } finally {
      setCoverageSavingId(null);
    }
  };

  const handleSoundChange = async (enabled: boolean) => {
    setSoundError("");
    if (enabled) {
      try {
        if (!await activateNotificationSound()) {
          setSoundError("This browser does not support notification sounds.");
          return;
        }
      } catch {
        setSoundError("Interact with the page again to allow browser audio.");
        return;
      }
    }
    try {
      setNotificationSoundEnabled(enabled);
      setSoundAlerts(enabled);
    } catch {
      setSoundError("Unable to save the sound preference in this browser.");
    }
  };

  const handleDiscard = async () => {
    setSettingsLoading(true);
    setSettingsError("");
    try {
      applySettings(await fetchWorkspaceSettings());
      setSettingsLoaded(true);
      showToast("Persisted workspace settings reloaded");
    } catch (loadError) {
      setSettingsError(loadError instanceof Error ? loadError.message : "Unable to reload workspace settings");
    } finally {
      setSettingsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-warm">
      <StaffHeader breadcrumbs={[{ label: "Workspace Settings" }]} />
      <div className="p-4 sm:p-8 space-y-8 pb-16 max-w-5xl mx-auto w-full">
        {/* Toast Notification */}
        {toastMessage && (
          <div
            ref={toastRef}
            role="status"
            aria-live="polite"
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 bg-[#202320] text-[#FCFBF8] rounded-2xl shadow-2xl border border-[#ED572E]/20 transition-all duration-300"
          >
            <CheckCircle2 className="w-5 h-5 text-[#ED572E] shrink-0" />
            <span className="text-sm font-medium">{toastMessage}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#202320]/60 mb-1">
              <Sliders className="w-3.5 h-3.5 text-[#ED572E]" />
              System Configuration · S15
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#202320] tracking-tight">
              Workspace Settings
            </h1>
            <p className="text-sm text-[#202320]/70 mt-1">
              Configure regional operating defaults, daylight inspection
              parameters, and coordinator dispatch rules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#DDE7DB] text-[#173F35]">
              <span className="w-2 h-2 rounded-full bg-[#173F35] animate-pulse"></span>
              Workspace: {workspaceName || "Nestly"}
            </span>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          {/* Section 1: Workspace Profile */}
          <div className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 pb-6 border-b border-[#202320]/10">
              <div className="w-10 h-10 rounded-2xl bg-[#DDE7DB] text-[#173F35] flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#202320]">
                  Workspace Profile
                </h2>
                <p className="text-xs text-[#202320]/60">
                  Core geographic entity identifiers and routing defaults
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <label
                  htmlFor="ws-name"
                  className="block text-xs font-bold text-[#202320] uppercase tracking-wider mb-2"
                >
                  Workspace Operational Name
                </label>
                <input
                  id="ws-name"
                  type="text"
                  maxLength={120}
                  disabled={!settingsLoaded || settingsSaving}
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  className="w-full px-4 py-3 rounded-2xl border border-[#202320]/10 bg-white text-sm text-[#202320] disabled:opacity-50"
                />
                <p className="text-xs text-[#202320]/50 mt-1.5">
                  Saved as the operational workspace name.
                </p>
              </div>

              <div>
                <label
                  htmlFor="ws-ref"
                  className="block text-xs font-bold text-[#202320] uppercase tracking-wider mb-2"
                >
                  Workspace Hub Reference ID
                </label>
                <div className="relative">
                  <input
                    id="ws-ref"
                    type="text"
                    disabled
                    value="Database row 1"
                    className="w-full px-4 py-3 rounded-2xl border border-[#202320]/10 bg-[#202320]/5 text-sm font-mono text-[#202320]/70 cursor-not-allowed"
                  />
                  <Lock className="w-4 h-4 text-[#202320]/40 absolute right-4 top-3.5" />
                </div>
                <p className="text-xs text-[#202320]/50 mt-1.5">
                  System immutable regional hub key
                </p>
              </div>

              <div>
                <label
                  htmlFor="ws-curr"
                  className="block text-xs font-bold text-[#202320] uppercase tracking-wider mb-2"
                >
                  Operational Ledger Currency
                </label>
                <select
                  id="ws-curr"
                  disabled
                  value="NGN"
                  className="w-full px-4 py-3 rounded-2xl border border-[#202320]/10 bg-[#202320]/5 text-sm text-[#202320]/70 cursor-not-allowed"
                >
                  <option value="NGN">
                    NGN (₦) — Nigerian Naira (Standard)
                  </option>
                  <option value="USD">USD ($) — United States Dollar</option>
                  <option value="GBP">GBP (£) — British Pound</option>
                </select>
                <p className="text-xs text-[#202320]/50 mt-1.5">
                  Currency configuration is not supported by the current settings API.
                </p>
              </div>

              <div>
                <label
                  htmlFor="ws-tz"
                  className="block text-xs font-bold text-[#202320] uppercase tracking-wider mb-2"
                >
                  Primary Regional Timezone
                </label>
                <div className="relative">
                  <input
                    id="ws-tz"
                    type="text"
                    disabled
                    value="Africa/Lagos (WAT, UTC+1)"
                    className="w-full px-4 py-3 rounded-2xl border border-[#202320]/10 bg-[#202320]/5 text-sm font-mono text-[#202320]/70 cursor-not-allowed"
                  />
                  <Globe className="w-4 h-4 text-[#202320]/40 absolute right-4 top-3.5" />
                </div>
                <p className="text-xs text-[#202320]/50 mt-1.5">
                  Synchronized inspection and shift scheduling
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Operating & Inspection Preferences */}
          <div className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 pb-6 border-b border-[#202320]/10">
              <div className="w-10 h-10 rounded-2xl bg-[#ED572E]/10 text-[#ED572E] flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#202320]">
                  Operating & Inspection Preferences
                </h2>
                <p className="text-xs text-[#202320]/60">
                  Standard viewing schedule buffers and logistical safe hours
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              {/* Duration stepper */}
              <div className="p-5 rounded-2xl bg-white border border-[#202320]/10">
                <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/70">
                  Standard Inspection Duration
                </span>
                <p className="text-xs text-[#202320]/50 mt-1">
                  Default duration used when creating a new inspection slot.
                </p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-2xl font-bold font-mono text-[#202320]">
                    {duration} <span className="text-sm font-normal text-[#202320]/60">mins</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease duration"
                      disabled={!settingsLoaded || settingsSaving || duration <= 15}
                      onClick={() => setDuration((current) => Math.max(15, current - 15))}
                      className="w-9 h-9 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[#202320] transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Increase duration"
                      disabled={!settingsLoaded || settingsSaving || duration >= 240}
                      onClick={() => setDuration((current) => Math.min(240, current + 15))}
                      className="w-9 h-9 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[#202320] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Buffer stepper */}
              <div className="p-5 rounded-2xl bg-white border border-[#202320]/10">
                <span className="text-xs font-bold uppercase tracking-wider text-[#202320]/70">
                  Transit Buffer Between Viewings
                </span>
                <p className="text-xs text-[#202320]/50 mt-1">
                  Field agent road travel allowance
                </p>
                <div className="flex items-center justify-between mt-4">
                  <span className="text-2xl font-bold font-mono text-[#202320]">
                    {buffer}{" "}
                    <span className="text-sm font-normal text-[#202320]/60">
                      mins transit
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease buffer"
                      disabled={!settingsLoaded || settingsSaving}
                      onClick={() =>
                        setBuffer((prev) => Math.max(0, prev - 15))
                      }
                      className="w-9 h-9 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[#202320] transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Increase buffer"
                      disabled={!settingsLoaded || settingsSaving}
                      onClick={() =>
                        setBuffer((prev) => Math.min(240, prev + 15))
                      }
                      className="w-9 h-9 rounded-full bg-[#202320]/5 hover:bg-[#202320]/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-[#202320] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Daylight Safety Banner */}
            <div className="mt-6 p-5 rounded-2xl bg-[#DDE7DB]/40 border border-[#DDE7DB] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#173F35] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Sun className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#173F35]">
                      Daylight Inspection Window
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#173F35] text-white rounded-md">
                      Workspace setting
                    </span>
                  </div>
                  <p className="text-xs text-[#173F35]/80 mt-1 max-w-xl">
                    Inspection services can use this window when validating slots.
                    Configured window: {daylightStart}–{daylightEnd} WAT.
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-semibold text-[#173F35]">
                    <label className="flex items-center gap-2">
                      Start
                      <input
                        type="time"
                        value={daylightStart}
                        disabled={!settingsLoaded || settingsSaving}
                        onChange={(event) => setDaylightStart(event.target.value)}
                        className="rounded-lg border border-[#173F35]/20 bg-white px-2 py-1 disabled:opacity-50"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      End
                      <input
                        type="time"
                        value={daylightEnd}
                        disabled={!settingsLoaded || settingsSaving}
                        onChange={(event) => setDaylightEnd(event.target.value)}
                        className="rounded-lg border border-[#173F35]/20 bg-white px-2 py-1 disabled:opacity-50"
                      />
                    </label>
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={daylightLock}
                  disabled={!settingsLoaded || settingsSaving}
                  onChange={(e) => setDaylightLock(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-12 h-6 bg-[#202320]/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#173F35] peer-disabled:opacity-50"></div>
              </label>
            </div>
          </div>

          {/* Section 3: Coordinator Dispatch & Alerts */}
          <div className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center gap-3 pb-6 border-b border-[#202320]/10">
              <div className="w-10 h-10 rounded-2xl bg-[#DDE7DB] text-[#173F35] flex items-center justify-center font-bold">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#202320]">
                  Coordinator Dispatch
                </h2>
                <p className="text-xs text-[#202320]/60">
                  Alert delivery and inquiry escalation controls are not connected.
                </p>
              </div>
            </div>

            <p className="mt-4 rounded-xl bg-[#202320]/5 px-4 py-3 text-xs text-[#202320]/60">
              Sound is stored in this browser. Escalation routing and digest delivery remain unavailable until a real scheduler and delivery path are configured.
            </p>
            <div className="divide-y divide-[#202320]/10 mt-2">
              <div className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-4 h-4 text-[#ED572E]" />
                  <div>
                    <h4 className="text-sm font-semibold text-[#202320]">
                      In-App Acoustic Sound Alert
                    </h4>
                    <p className="text-xs text-[#202320]/60">
                      This-browser preference plays for newly received unread alerts after browser interaction.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  aria-label="Enable in-app notification sound"
                  checked={soundAlerts}
                  disabled={!soundPreferenceLoaded}
                  onChange={(event) => void handleSoundChange(event.target.checked)}
                  className="w-4 h-4 accent-[#ED572E] rounded disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              {soundError && <p role="alert" className="pb-3 text-xs text-rose-700">{soundError}</p>}

              <div className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-[#173F35]" />
                  <div>
                    <h4 className="text-sm font-semibold text-[#202320]">
                      WhatsApp Dispatch Alerts (deferred)
                    </h4>
                    <p className="text-xs text-[#202320]/60">
                      WhatsApp is outside the active release scope; new app-side sends are disabled by the server flag.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  className="w-4 h-4 accent-[#ED572E] rounded cursor-not-allowed"
                />
              </div>

              <div className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MailCheck className="w-4 h-4 text-[#202320]/70" />
                  <div>
                    <h4 className="text-sm font-semibold text-[#202320]">
                      Daily Operational Digest
                    </h4>
                    <p className="text-xs text-[#202320]/60">
                      Digest scheduling is not configured
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  className="w-4 h-4 accent-[#ED572E] rounded cursor-not-allowed"
                />
              </div>

              <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-[#202320]">
                    Escalation Threshold for Unclaimed Leads
                  </h4>
                  <p className="text-xs text-[#202320]/60">
                    Escalation routing is not configured
                  </p>
                </div>
                <select
                  aria-label="Escalation Threshold"
                  disabled
                  value=""
                  className="px-4 py-2.5 rounded-xl border border-[#202320]/15 bg-[#202320]/5 text-xs font-semibold text-[#202320]/60 cursor-not-allowed"
                >
                  <option value="">Unavailable</option>
                </select>
              </div>
              <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-[#202320]">Workspace retention days</h4>
                  <p className="text-xs text-[#202320]/60">Persisted workspace retention policy setting</p>
                </div>
                <input
                  type="number"
                  aria-label="Workspace retention days"
                  min={30}
                  max={3650}
                  step={1}
                  value={retentionDays}
                  disabled={!settingsLoaded || settingsSaving}
                  onChange={(event) => setRetentionDays(Number(event.target.value))}
                  className="px-4 py-2.5 rounded-xl border border-[#202320]/15 bg-white text-xs font-semibold text-[#202320] focus:outline-none focus:ring-2 focus:ring-[#ED572E] disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Regional Coverage Management */}
          <div className="bg-[#FCFBF8] border border-[#202320]/10 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex items-center justify-between pb-6 border-b border-[#202320]/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#202320]/5 text-[#202320] flex items-center justify-center font-bold">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#202320]">
                    Regional Coverage Administration
                  </h2>
                  <p className="text-xs text-[#202320]/60">
                    Live neighborhood coverage used by inspection eligibility
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 bg-[#DDE7DB] text-[#173F35] rounded-full text-xs font-bold">
                {coverageLoading ? "Loading" : `${activeCoverageCount} / ${coverageAreaCount} Active`}
              </span>
            </div>

            <p className="text-xs text-[#202320]/60 mt-4 mb-4">
              {coverageCanManage
                ? "Coverage changes are saved with an audit record and affect matching neighborhoods in new inspection scheduling and public availability."
                : "You can view coverage areas. Only Platform Admins and Operations Leads can change them."}
            </p>

            {coverageError && <p role="alert" className="mb-4 text-xs text-rose-700">{coverageError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                    zone.active
                      ? "bg-white border-[#202320]/10 shadow-sm"
                      : "bg-[#202320]/5 border-dashed border-[#202320]/15 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#202320]/5 flex items-center justify-center text-[#202320]">
                      <MapPin className="w-4 h-4 text-[#ED572E]" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-[#202320]">
                        {zone.name}
                      </h4>
                      <p className="text-xs text-[#202320]/60">
                        {zone.subtext}
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={`Toggle ${zone.name}`}
                    checked={zone.active}
                    disabled={!coverageCanManage || coverageLoading || coverageSavingId !== null}
                    onChange={(event) => void handleCoverageChange(zone, event.target.checked)}
                    className="w-4 h-4 accent-[#ED572E] rounded disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              ))}
            </div>
            {!coverageLoading && zones.length === 0 && (
              <p className="text-sm text-[#202320]/60">No coverage areas are configured.</p>
            )}
          </div>

          {/* Footer controls & Compliance lock */}
          <div className="p-5 rounded-2xl bg-[#FCFBF8] border border-[#202320]/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-xs text-[#202320]/70">
              <ShieldCheck className="w-4 h-4 text-[#173F35] shrink-0" />
              <span>
                Supported values are saved to workspace_settings after server confirmation.
                <br />
                <span className="text-[#202320]/50 font-mono">
                  {lastUpdated ? `Last updated ${new Date(lastUpdated).toLocaleString()}` : 'Last update time unavailable'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={!settingsLoaded || settingsLoading || settingsSaving}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-[#202320]/15 text-xs font-bold text-[#202320] hover:bg-[#202320]/5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Discard
              </button>
              <button
                type="submit"
                disabled={!settingsLoaded || settingsLoading || settingsSaving}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#ED572E] text-white text-xs font-bold shadow-md hover:bg-[#ED572E]/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Save className="w-3.5 h-3.5" />
                {settingsSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
          {settingsLoading && (
            <p role="status" className="text-sm text-[#202320]/60">Loading persisted workspace settings…</p>
          )}
          {settingsError && (
            <p role="alert" className="text-sm text-rose-700">{settingsError}</p>
          )}
        </form>
      </div>
    </div>
  );
}
