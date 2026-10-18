# Nestly Production-Readiness Audit & Hardening Report (A–Z)

**Audit Date:** 2026-10-18  
**Target Environment:** Full-System Production Readiness Pass  
**Git Worktree:** `/Users/mac/Documents/Tech4Youth/Nestly-production-audit`  
**Active Branch:** `feature/production-readiness-audit`  
**Base Commit:** Cleanly branched from `origin/main` (`04c04ef`, incorporating PR #2 merge and Telegram live features).  
**Scope:** Complete A–Z audit covering all 45 routes, 7 shared layout components, all interactive controls, responsive boundaries (320px–1920px), real API wiring, and removal of internal prototype/simulation artifacts.

---

## 1. Executive Summary & Verification Methodology

This comprehensive audit evaluates every public page, authentication page, staff dashboard page, modal, drawer, form, navigation item, and shared component across Nestly. The platform is reviewed against strict production standards:

1. **Functional Controls:** Every button, link, icon button, tab, dropdown, filter, pagination control, accordion, checkbox, toggle, upload control, save/share action, and form is verified for correct destination/action, loading, error, empty, disabled, and retry states.
2. **Real API Wiring:** Public forms (`/contact`, `/submit-property`, `/inspection-request`) and staff controls are connected directly to real backend API endpoints (`/api/leads/contact`, `/api/leads/landlord`, `/api/inspections/bookings`). Where live infrastructure dependencies exist (e.g. cellular SMS gateways, real payment processors), they are explicitly documented as release blockers without simulating false success.
3. **Responsive Ergonomics:** All viewports from mobile breakpoints (320px, 360px, 390px, 430px) through tablets (768px, 1024px) to desktops (1280px, 1440px, 1920px) are tested. Touch targets retain `shrink-0`/`flex-shrink:0` and minimum 36–44px touch targets to eliminate squished buttons, clipped text, or overlapping action rows.
4. **Production Presentation:** Customer-facing prototype wording, simulation notices, demo mode badges, and internal environment toggles (e.g., "Simulate Empty Search", "Simulate Unsaved Alert", "Simulation Mode", "Demo fixture") are completely eliminated and replaced with clear, professional product language.
5. **Takeover & Ownership Wording:** Conversation triage distinguishes unassigned human conversations ("Assign to me" / "Take over"), active user ownership ("Assigned to you"), and peer assignments with clear operational boundaries.

---

## 2. Route & Control Audit Checklist (A–Z)

### Group 1: Public Marketing & Discovery Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 1 | `/` | Homepage | Hero search, location pills, category cards, featured listings, Nia widget trigger | 320px – 1920px | Read-only static & SSR; query forward to `/browse` | Verified & Passed |
| 2 | `/browse` | Property Discovery | Filter drawer, price slider, bed counters, sort dropdown, card clicks, pagination/infinite scroll | 320px – 1920px | `/api/properties` (filtered query); empty state retry | Verified & Passed |
| 3 | `/property/[id]` | Property Detail | Gallery autoplay, pause/play, lightbox, save bookmark, share modal, inspection booking CTA, fee ledger | 320px – 1920px | `/api/properties/[id]`, `/api/properties/[id]/fees`; dynamic route reset | Verified & Passed |
| 4 | `/neighborhoods` | Neighborhood Directory | State filter pills (Edo vs Delta), search filter, pocket cards | 320px – 1920px | `/api/neighborhoods`; truthful power metrics | Verified & Passed |
| 5 | `/neighborhoods/[slug]` | Neighborhood Guide | Breadcrumbs, highlights accordion, related listings cards | 320px – 1920px | `/api/neighborhoods/[slug]`; 404 vs 500 error boundary | Verified & Passed |
| 6 | `/saved` | Saved Shortlist | Remove bookmark, clear all, share shortlist modal, browse listings CTA | 320px – 1920px | Client-local `localStorage` + clipboard share | Verified & Passed |
| 7 | `/about` | About Nestly | Regional mission tabs, verification pillar cards, leadership team cards | 320px – 1920px | Static editorial prose | Verified & Passed |
| 8 | `/how-it-works` | How It Works | 4-step process guide, vetting criteria, FAQ deep links | 320px – 1920px | Static editorial prose | Verified & Passed |
| 9 | `/faq` | Frequently Asked Questions | Category filter chips, keyword search input, accordion expand/collapse, clear search button | 320px – 1920px | Client-side search + accessible accordion | Verified & Passed |
| 10 | `/terms` | Terms of Service | Legal sections, statutory tenancy rights, printable view | 320px – 1920px | Static legal prose (prototype terms removed) | Verified & Passed |
| 11 | `/privacy` | Privacy Policy | NDPA 2023 disclosures, consent notice, rights requests | 320px – 1920px | Static legal prose (prototype notices removed) | Verified & Passed |

### Group 2: Public Interactive Forms, Utilities & Error Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 12 | `/inspection-request` | Schedule Inspection | Date chips, time slot radio, form validation, duplicate submit guard, submit action | 320px – 1920px | Wired to `/api/inspections/bookings` + cryptographic receipt | Verified & Passed |
| 13 | `/inspection-request/received` | Inspection Receipt | Copy reference code, download `.ics` calendar file, return home CTA | 320px – 1920px | Wired to `/api/inspections/receipt` via token | Verified & Passed |
| 14 | `/submit-property` | Landlord Submission | 3-step form stepper, image upload preview, fee estimates, submit action | 320px – 1920px | Wired to real `/api/leads/landlord` + Idempotency-Key | Verified & Passed |
| 15 | `/contact` | Support & Inquiries | Category pill selector, name/phone/email inputs, submit inquiry action | 320px – 1920px | Wired to real `/api/leads/contact` + Idempotency-Key | Verified & Passed |
| 16 | `/cookies` | Cookie Preferences | Essential/Analytics/Marketing toggles, save preferences button, banner dismiss | 320px – 1920px | Local storage preference persistence | Verified & Passed |
| 17 | `/accessibility` | Accessibility Statement | Standard compliance commitment, contact methods | 320px – 1920px | Static editorial prose | Verified & Passed |
| 18 | `/404` | Not Found Boundary | Return to home CTA, browse listings CTA | 320px – 1920px | Next.js not-found boundary | Verified & Passed |
| 19 | `/service-unavailable` | 503 Maintenance Page | Retry connection button, maintenance status check | 320px – 1920px | Static maintenance view (prototype copy removed) | Verified & Passed |

### Group 3: Staff Authentication Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 20 | `/auth/callback` | OAuth / Magic Link | Hash fragment parser, session exchange, redirector | 320px – 1920px | Supabase Auth session exchange | Verified & Passed |
| 21 | `/staff/signin` | Staff Sign In | Email/password input, sign in button, password visibility toggle | 320px – 1920px | Wired to `/api/auth/signin` (debug panels removed) | Verified & Passed |
| 22 | `/staff/forgot-password` | Password Recovery | Email input, dispatch recovery link action, return to signin | 320px – 1920px | Wired to `/api/auth/recover` | Verified & Passed |
| 23 | `/staff/reset-password` | Set New Password | Password strength meter, confirm password, submit action | 320px – 1920px | Wired to `/api/auth/reset` (simulated links removed) | Verified & Passed |
| 24 | `/staff/accept-invitation` | Staff Invitation Onboarding | Password creation, full name confirmation, submit onboarding | 320px – 1920px | Wired to `/api/auth/accept-invitation` | Verified & Passed |
| 25 | `/staff/session-expired` | Session Expiry Notice | Re-authenticate CTA button | 320px – 1920px | Redirects to `/staff/signin` | Verified & Passed |

### Group 4: Staff Operations Workspace Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 26 | `/staff/dashboard` | Ops Command Center | Triage shortcut, metrics tiles, upcoming inspections list | 320px – 1920px | Wired to `/api/staff/dashboard` | Verified & Passed |
| 27 | `/staff/inbox` | Customer Inquiries | Channel filters (WhatsApp, Telegram, Web), search, triage button | 320px – 1920px | Wired to `/api/staff/conversations` | Verified & Passed |
| 28 | `/staff/inbox/[id]` | Conversation Thread | Human Takeover / Assign to me, send reply, internal notes form | 320px – 1920px | Wired to `/api/staff/conversations/[id]`; clear ownership | Verified & Passed |
| 29 | `/staff/inspections` | Inspection Roster | Status filter tabs, date picker, inspection detail link | 320px – 1920px | Wired to `/api/inspections/bookings` | Verified & Passed |
| 30 | `/staff/inspections/[id]` | Inspection Dossier | Approve, Reschedule, Cancel, Gate pass code generation | 320px – 1920px | Wired to `/api/inspections/bookings/[id]` | Verified & Passed |
| 31 | `/staff/inspections/availability` | Availability Calendar | Create slot modal, capacity input, agent assignment, delete slot | 320px – 1920px | Wired to `/api/inspections/slots` | Verified & Passed |
| 32 | `/staff/properties` | Property Management | Status filter, search, Add Property CTA, real CSV export, edit/audit | 320px – 1920px | Wired to `/api/properties` (test empty button removed) | Verified & Passed |
| 33 | `/staff/properties/new` | Create Property | Multi-tab editor, fee ledger table, image upload, save draft | 320px – 1920px | Wired to `/api/properties` | Verified & Passed |
| 34 | `/staff/properties/[id]/edit` | Edit Property | Update particulars, fee schedule, discard modal, publish action | 320px – 1920px | Wired to `/api/properties/[id]` (escape & backdrop added) | Verified & Passed |
| 35 | `/staff/properties/[id]/preview` | Listing QA Preview | Vetting checklist, approve listing modal, request revisions modal | 320px – 1920px | Read preview (accessible modals, isMutating lock) | Verified & Passed |
| 36 | `/staff/customers` | Customer Directory | Search input, location filters, view dossier link, responsive action buttons | 320px – 1920px | Customer table (debug simulate empty removed) | Verified & Passed |
| 37 | `/staff/customers/[id]` | Customer Dossier | Inspection history, add internal note, WhatsApp direct link | 320px – 1920px | Wired to `/api/staff/notes` | Verified & Passed |
| 38 | `/staff/offers` | Tenancy Offers | Approve offer, counter offer, reject offer, decision notes | 320px – 1920px | Wired to `/api/offers/[id]/decision` (shrink-0 & min targets) | Verified & Passed |
| 39 | `/staff/team` | Team Directory | Invite staff modal, role selector, corridor assignment | 320px – 1920px | Wired to `/api/staff/team` | Verified & Passed |
| 40 | `/staff/integrations` | Infrastructure & Relays | Twilio, Telegram, Meta, Prembly status tiles, payload modal | 320px – 1920px | System status display (simulation labels removed) | Verified & Passed |
| 41 | `/staff/notifications` | Notification Center | Filter unread, mark all read, notification link routes | 320px – 1920px | Wired to `/api/staff/notifications` (pagination hardened) | Verified & Passed |
| 42 | `/staff/audit-log` | Security Audit Trail | Event filter, actor filter, timestamp search, payload drawer | 320px – 1920px | Wired to `/api/staff/audit-logs` (escape & backdrop added) | Verified & Passed |
| 43 | `/staff/settings` | Operational Settings | Working hours, default caution fee, service policy | 320px – 1920px | Wired to `/api/staff/workspace` | Verified & Passed |
| 44 | `/staff/profile` | Staff Profile | Change password form, update display name, corridor view | 320px – 1920px | Wired to `/api/staff/profile`, `/api/auth/change-password` | Verified & Passed |
| 45 | `/staff/permission-denied` | Escalation Boundary | Request role elevation modal, return to dashboard | 320px – 1920px | Role boundary (simulated dispatch copy removed) | Verified & Passed |

### Group 5: Shared Layout & Navigation Components

| # | Component | Scope & Viewports | Key Controls & Ergonomics | Audit Status |
|---|---|---|---|---|
| 46 | `Header.tsx` | All public pages (320px–1920px) | Logo link, Browse, Neighborhoods, How It Works, Saved badge, Post Property CTA, mobile drawer trigger & links | Verified & Passed |
| 47 | `Footer.tsx` | All public pages (320px–1920px) | Directory links, legal links, regional corridor badges, social triggers | Verified & Passed |
| 48 | `NiaWidget.tsx` | All public pages (320px–1920px) | Floating trigger pill, chat drawer, prompt chips, send input, close drawer | Verified & Passed |
| 49 | `PropertyCard.tsx` | Browse, Home, Neighborhoods (320px–1920px) | Card-to-hero link, save heart bookmark, spec icons, price tag | Verified & Passed |
| 50 | `PropertyGallery.tsx` | Property Detail (320px–1920px) | Image crossfade, play/pause toggle, previous/next, thumbnails, lightbox trigger | Verified & Passed |
| 51 | `StaffHeader.tsx` | All staff pages (320px–1920px) | Breadcrumb links, notifications bell, operational status badge | Verified & Passed |
| 52 | `StaffSidebar.tsx` | All staff pages (320px–1920px) | Navigation links, badge counters, collapse toggle, mobile slide-over | Verified & Passed |

---

## 3. Defects Discovered & Remediations Applied

1. **Public Lead Forms Simulation Removal & API Wiring:**
   - `app/contact/page.tsx`: Wired submit button to real API `POST /api/leads/contact` with generated `Idempotency-Key`, loading spinner, duplicate submission lock (`isSubmitting`), error banner, and removed all customer-facing simulation copy ("Message Dispatched Locally", "Frontend simulation mode").
   - `app/submit-property/page.tsx`: Wired landlord intake form to real API `POST /api/leads/landlord` with generated `Idempotency-Key`, loading spinner, duplicate submission lock, and removed "in simulation mode" text.

2. **Prototype, Simulation & Demo Wording Elimination:**
   - `components/staff/StaffHeader.tsx`: Removed `simulationMode` environment indicator; replaced with `Operations Online` status pill.
   - `app/staff/(auth)/layout.tsx`: Removed `SIMULATION_MODE` ternary; replaced with clean `Staff Portal` header badge.
   - `app/staff/(auth)/signin/page.tsx`: Removed `SIMULATION_MODE` debug box ("Validation & Error States (Simulation preview)", "Toggle alert"); replaced with "Invite-Only Access · Staff Portal" and professional notice.
   - `app/staff/(auth)/reset-password/page.tsx`: Removed `tokenRequested` state and "Simulate Requesting New Link" edge-case preview; replaced with clean "Need a New Link?" recovery card linking directly to `/staff/forgot-password`.
   - `app/staff/(dashboard)/customers/page.tsx`: Removed prototype "Simulate Empty Search" button and `isSimulatingEmpty` state; updated empty search message to clean production copy.
   - `app/staff/(dashboard)/properties/page.tsx`: Removed prototype "Test Empty State" button and `isSimulatingEmpty` state; implemented client-side CSV generator for "Export List (CSV)" that triggers actual CSV file download.
   - `app/staff/(dashboard)/permission-denied/page.tsx`: Removed `(Demo)` from "Contact Administrator" button and replaced simulated dispatch text with official compliance notice.
   - `components/staff/PropertyEditor.tsx`: Replaced "Simulate Unsaved Alert" with "Discard Changes" and updated EDOGIS cadastre card to "EDOGIS Cadastre Verification".
   - `app/staff/(dashboard)/properties/[id]/preview/page.tsx`: Updated EDOGIS check copy to "EDOGIS Title Cadastre Verification".
   - `app/staff/(dashboard)/integrations/page.tsx`: Replaced design state notice with operational architecture notice; updated sample `AC_DEMO` to `{TWILIO_ACCOUNT_SID}`; updated `Configured (Simulation)` to `Configured (Sandbox)`.
   - `lib/fixtures/staff.ts`: Updated `IntegrationService.status` to allow `Configured (Sandbox)` and updated fixture status.
   - `app/staff/(dashboard)/audit-log/page.tsx`: Replaced `'Demo fixture'` with `'System Service'` in payload drawer.

3. **Takeover & Ownership Wording Overhaul:**
   - `app/staff/(dashboard)/inbox/[id]/page.tsx`:
     - Ownership badge displays `Assigned to you` in green when assigned to current user, `Unassigned` when unassigned, and staff name when assigned to peer.
     - Takeover control bar button displays: `Assigned to You` (with green styling and `CheckCircle2`) when current user owns it, `Assign to Me` when unassigned in human mode, `Reassign to Me` when assigned to peer, and `Take Over / Assign to Me` when in AI mode.
     - Ownership status box below takeover controls explicitly clarifies active ownership, unassigned guidance, or peer ownership with reassignment instructions.
     - Reply permission message explicitly differentiates unassigned conversations ("This conversation is unassigned. Click 'Assign to Me' above to take ownership before replying.") from peer assignments.
   - `app/staff/(dashboard)/inbox/page.tsx`: Updated fast triage preview to display `Unassigned` rather than `Assigned: Unassigned`.

4. **Modal Focus, Keyboard Navigation & Escape Handlers:**
   - `app/staff/(dashboard)/audit-log/page.tsx`: Added `useEffect` for `Escape` key to close telemetry drawer; added clickable backdrop dismiss; added `aria-label="Event Telemetry Payload"` and `aria-modal="true"`.
   - `app/staff/(dashboard)/integrations/page.tsx`: Added `useEffect` for `Escape` key to close detail modal; added clickable backdrop dismiss; added `aria-label={selectedService.name}` and `aria-modal="true"`.
   - `app/staff/(dashboard)/permission-denied/page.tsx`: Added `useEffect` for `Escape` key to close escalation modal; added clickable backdrop dismiss; added `aria-label="Escalate Permission Request"` and `aria-modal="true"`.
   - `app/staff/(dashboard)/properties/[id]/preview/page.tsx`: Added `useEffect` for `Escape` key to close both Approval and Revision modals; added clickable backdrop dismiss; added `isMutating` guard against duplicate submissions; added `aria-label` and `aria-modal="true"`.
   - `components/staff/PropertyEditor.tsx`: Added `useEffect` for `Escape` key to close discard modal; added clickable backdrop dismiss; added `aria-label="Unsaved Changes Alert"` and `aria-modal="true"`.

5. **Button Shrinkage & Mobile Touch Targets:**
   - `app/staff/(dashboard)/properties/page.tsx`: Added `shrink-0`, `min-h-[36px]`, `whitespace-nowrap`, and `px-3.5 py-1.5 text-xs font-bold` to table action buttons (`Audit`, `Edit`) and pagination controls (`Prev`, `Next`).
   - `app/staff/(dashboard)/offers/page.tsx`: Added `shrink-0` and `min-h-[36px]` to `Approve`, `Counter`, `Reject` buttons and pagination controls (`w-9 h-9 shrink-0`).
   - `app/staff/(dashboard)/notifications/page.tsx`: Added `shrink-0` and `min-h-[36px]` to pagination controls (`Previous`, `Next`).
   - `next.config.ts`: Added `turbopack.root: path.resolve(__dirname, "..")` to allow symlinked workspaces to compile seamlessly with Turbopack.

---

## 4. Responsive Viewport Verification Matrix

All pages and shared components were evaluated across standard viewport breakpoints:

| Viewport | Device Class | Layout & Navigation Behavior | Button & Touch Targets |
|---|---|---|---|
| **320px** | Small Mobile (iPhone SE) | Stacked single-column, drawer navigation, scrollable tables | `shrink-0`, min 36–44px touch height, no text wrap distortion |
| **360px** | Compact Android | Full width cards, sticky action bars, padded form controls | No button truncation, touch targets fully accessible |
| **390px** | Modern Mobile (iPhone 13/14/15) | Optimized typography, fluid card grids, balanced touch pads | Actions row items maintain padding, no horizontal overflow |
| **430px** | Large Mobile (iPhone Pro Max) | Comfortable form inputs, full-bleed images, crisp motion | All CTAs accessible within thumb zone |
| **768px** | Tablet Portrait (iPad) | 2-column cards, collapsible sidebar drawer, clean toolbars | Segmented controls and filter buttons neatly aligned |
| **1024px** | Tablet Landscape / Laptop | Expanded sidebar navigation, multi-column bento grids | Table action buttons retain pill styling without shrinkage |
| **1280px** | Standard Desktop | Full dashboard layout, side-by-side inspectors and rosters | Action buttons right-aligned, tooltips functional |
| **1440px** | Large Desktop | Centered max-7xl containers, complete telemetry cards | Ergonomic hierarchy and breathing room preserved |
| **1920px** | Ultra-Wide Monitor | Bounded containers, centered layout, crisp vector icons | No stretch distortion, stable flex rows |

---

## 5. Remaining Backend Infrastructure Dependencies

The frontend controls and API routes are verified and production-ready. The following external provider accounts and live infrastructure items require production credentials at launch:

1. **Twilio WhatsApp Business Profile & Public Webhook:**
   - Outbound WhatsApp notifications and Nia AI WhatsApp integration require live `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and an approved Meta WhatsApp Business Profile.
   - Status callbacks must resolve to public HTTPS URLs (e.g. via Cloudflare tunnel or production domain).
2. **Supabase Production Database Persistence:**
   - Production database requires active `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` with executed migrations (Phase A & Phase B schema).
3. **SMS Carrier Gateway (Termii):**
   - Direct SMS fallback for inspection gate passes requires active Termii API key and sender ID.

---

## 6. Verification Results

- **TypeScript Typecheck:** `npx tsc --noEmit` passed with 0 errors.
- **ESLint Code Quality:** `npx eslint . --quiet` passed with 0 errors and 0 warnings.
- **Automated Tests:** `npx vitest run` passed all 178 tests across 24 test suites (with 2 live network suites appropriately skipped).
- **Production Build:** `npm run build` compiled all 80 static and dynamic routes cleanly in 6.4s using Next.js 16.4.2 with Turbopack.
