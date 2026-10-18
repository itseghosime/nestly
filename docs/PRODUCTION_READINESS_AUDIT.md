# Nestly Production-Readiness Audit & Hardening Report (A–Z)

**Audit Date:** 2026-10-18  
**Target Environment:** Full-System Production Readiness Pass  
**Git Worktree:** `/Users/mac/Documents/Tech4Youth/Nestly-production-audit`  
**Active Branch:** `feature/production-readiness-audit`  
**Base Commit:** Cleanly branched from `origin/main` (`04c04ef`, which incorporates PR #2 merge and Telegram live results).  
**Scope:** Complete A–Z audit covering all 45 routes, 7 shared layout components, all interactive controls, responsive boundaries (320px–1920px), real API wiring, and removal of internal prototype/simulation artifacts.

---

## 1. Executive Summary & Verification Methodology

This comprehensive audit evaluates every public page, authentication page, staff dashboard page, modal, drawer, form, navigation item, and shared component across Nestly. The platform is reviewed against strict production standards:

1. **Functional Controls:** Every button, link, icon button, tab, dropdown, filter, pagination control, accordion, checkbox, toggle, upload control, save/share action, and form is verified for correct destination/action, loading, error, empty, disabled, and retry states.
2. **Real API Wiring:** Public forms (`/contact`, `/submit-property`, `/inspection-request`) and staff controls are connected directly to real backend API endpoints (`/api/leads/contact`, `/api/leads/landlord`, `/api/inspections/bookings`). Where live infrastructure dependencies exist (e.g. cellular SMS gateways, real payment processors), they are explicitly documented as release blockers without simulating false success.
3. **Responsive Ergonomics:** All viewports from mobile breakpoints (320px, 360px, 390px, 430px) through tablets (768px, 1024px) to desktops (1280px, 1440px, 1920px) are tested. Touch targets retain `shrink-0`/`flex-shrink:0` to eliminate squished buttons, clipped text, or overlapping action rows.
4. **Production Presentation:** Customer-facing prototype wording, simulation notices, demo mode badges, and internal environment toggles (e.g., "Simulate Empty Search", "Simulate Unsaved Alert", "Simulation Mode") are replaced with clear, professional product language.
5. **Takeover & Ownership Wording:** Conversation triage distinguishes unassigned human conversations ("Assign to me" / "Take over"), active user ownership ("Assigned to you"), and peer assignments with clear operational boundaries.

---

## 2. Route & Control Audit Checklist (A–Z)

### Group 1: Public Marketing & Discovery Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 1 | `/` | Homepage | Hero search, location pills, category cards, featured listings, Nia widget trigger | 320px – 1920px | Read-only static & SSR; query forward to `/browse` | In Progress |
| 2 | `/browse` | Property Discovery | Filter drawer, price slider, bed counters, sort dropdown, card clicks, pagination/infinite scroll | 320px – 1920px | `/api/properties` (filtered query); empty state retry | In Progress |
| 3 | `/property/[id]` | Property Detail | Gallery autoplay, pause/play, lightbox, save bookmark, share modal, inspection booking CTA, fee ledger | 320px – 1920px | `/api/properties/[id]`, `/api/properties/[id]/fees`; dynamic route reset | In Progress |
| 4 | `/neighborhoods` | Neighborhood Directory | State filter pills (Edo vs Delta), search filter, pocket cards | 320px – 1920px | `/api/neighborhoods`; truthful power metrics | In Progress |
| 5 | `/neighborhoods/[slug]` | Neighborhood Guide | Breadcrumbs, highlights accordion, related listings cards | 320px – 1920px | `/api/neighborhoods/[slug]`; 404 vs 500 error boundary | In Progress |
| 6 | `/saved` | Saved Shortlist | Remove bookmark, clear all, share shortlist modal, browse listings CTA | 320px – 1920px | Client-local `localStorage` + clipboard share | In Progress |
| 7 | `/about` | About Nestly | Regional mission tabs, verification pillar cards, leadership team cards | 320px – 1920px | Static editorial prose | In Progress |
| 8 | `/how-it-works` | How It Works | 4-step process guide, vetting criteria, FAQ deep links | 320px – 1920px | Static editorial prose | In Progress |
| 9 | `/faq` | Frequently Asked Questions | Category filter chips, keyword search input, accordion expand/collapse, clear search button | 320px – 1920px | Client-side search + accessible accordion | In Progress |
| 10 | `/terms` | Terms of Service | Legal sections, statutory tenancy rights, printable view | 320px – 1920px | Static legal prose (prototype terms removed) | In Progress |
| 11 | `/privacy` | Privacy Policy | NDPA 2023 disclosures, consent notice, rights requests | 320px – 1920px | Static legal prose (prototype notices removed) | In Progress |

### Group 2: Public Interactive Forms, Utilities & Error Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 12 | `/inspection-request` | Schedule Inspection | Date chips, time slot radio, form validation, duplicate submit guard, submit action | 320px – 1920px | Wired to `/api/inspections/bookings` + cryptographic receipt | In Progress |
| 13 | `/inspection-request/received` | Inspection Receipt | Copy reference code, download `.ics` calendar file, return home CTA | 320px – 1920px | Wired to `/api/inspections/receipt` via token | In Progress |
| 14 | `/submit-property` | Landlord Submission | 3-step form stepper, image upload preview, fee estimates, submit action | 320px – 1920px | Wired to `/api/leads/landlord` + Idempotency-Key | In Progress |
| 15 | `/contact` | Support & Inquiries | Category pill selector, name/phone/email inputs, submit inquiry action | 320px – 1920px | Wired to `/api/leads/contact` + Idempotency-Key | In Progress |
| 16 | `/cookies` | Cookie Preferences | Essential/Analytics/Marketing toggles, save preferences button, banner dismiss | 320px – 1920px | Local storage preference persistence | In Progress |
| 17 | `/accessibility` | Accessibility Statement | Standard compliance commitment, contact methods | 320px – 1920px | Static editorial prose | In Progress |
| 18 | `/404` | Not Found Boundary | Return to home CTA, browse listings CTA | 320px – 1920px | Next.js not-found boundary | In Progress |
| 19 | `/service-unavailable` | 503 Maintenance Page | Retry connection button, maintenance status check | 320px – 1920px | Static maintenance view (prototype copy removed) | In Progress |

### Group 3: Staff Authentication Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 20 | `/auth/callback` | OAuth / Magic Link | Hash fragment parser, session exchange, redirector | 320px – 1920px | Supabase Auth session exchange | In Progress |
| 21 | `/staff/signin` | Staff Sign In | Email/password input, sign in button, password visibility toggle | 320px – 1920px | Wired to `/api/auth/signin` (debug panels removed) | In Progress |
| 22 | `/staff/forgot-password` | Password Recovery | Email input, dispatch recovery link action, return to signin | 320px – 1920px | Wired to `/api/auth/recover` | In Progress |
| 23 | `/staff/reset-password` | Set New Password | Password strength meter, confirm password, submit action | 320px – 1920px | Wired to `/api/auth/reset` (simulated links removed) | In Progress |
| 24 | `/staff/accept-invitation` | Staff Invitation Onboarding | Password creation, full name confirmation, submit onboarding | 320px – 1920px | Wired to `/api/auth/accept-invitation` | In Progress |
| 25 | `/staff/session-expired` | Session Expiry Notice | Re-authenticate CTA button | 320px – 1920px | Redirects to `/staff/signin` | In Progress |

### Group 4: Staff Operations Workspace Routes

| # | Route | Purpose | Key Controls & Scenarios | Responsive Scope | API Wiring & Backend State | Audit Status |
|---|---|---|---|---|---|---|
| 26 | `/staff/dashboard` | Ops Command Center | Triage shortcut, metrics tiles, upcoming inspections list | 320px – 1920px | Wired to `/api/staff/dashboard` | In Progress |
| 27 | `/staff/inbox` | Customer Inquiries | Channel filters (WhatsApp, Telegram, Web), search, triage button | 320px – 1920px | Wired to `/api/staff/conversations` | In Progress |
| 28 | `/staff/inbox/[id]` | Conversation Thread | Human Takeover / Assign to me, send reply, internal notes form | 320px – 1920px | Wired to `/api/staff/conversations/[id]`; clear ownership | In Progress |
| 29 | `/staff/inspections` | Inspection Roster | Status filter tabs, date picker, inspection detail link | 320px – 1920px | Wired to `/api/inspections/bookings` | In Progress |
| 30 | `/staff/inspections/[id]` | Inspection Dossier | Approve, Reschedule, Cancel, Gate pass code generation | 320px – 1920px | Wired to `/api/inspections/bookings/[id]` | In Progress |
| 31 | `/staff/inspections/availability` | Availability Calendar | Create slot modal, capacity input, agent assignment, delete slot | 320px – 1920px | Wired to `/api/inspections/slots` | In Progress |
| 32 | `/staff/properties` | Property Management | Status filter, search, Add Property CTA, edit/preview actions | 320px – 1920px | Wired to `/api/properties` | In Progress |
| 33 | `/staff/properties/new` | Create Property | Multi-tab editor, fee ledger table, image upload, save draft | 320px – 1920px | Wired to `/api/properties` | In Progress |
| 34 | `/staff/properties/[id]/edit` | Edit Property | Update particulars, fee schedule, discard modal, publish action | 320px – 1920px | Wired to `/api/properties/[id]` (discard simulation fixed) | In Progress |
| 35 | `/staff/properties/[id]/preview` | Listing QA Preview | Vetting checklist, approve listing, request revisions | 320px – 1920px | Read preview (simulated demo titles removed) | In Progress |
| 36 | `/staff/customers` | Customer Directory | Search input, location filters, view dossier link | 320px – 1920px | Customer table (debug simulate empty removed) | In Progress |
| 37 | `/staff/customers/[id]` | Customer Dossier | Inspection history, add internal note, WhatsApp direct link | 320px – 1920px | Wired to `/api/staff/notes` | In Progress |
| 38 | `/staff/offers` | Tenancy Offers | Approve offer, counter offer, reject offer, decision notes | 320px – 1920px | Wired to `/api/offers/[id]/decision` | In Progress |
| 39 | `/staff/team` | Team Directory | Invite staff modal, role selector, corridor assignment | 320px – 1920px | Wired to `/api/staff/team` | In Progress |
| 40 | `/staff/integrations` | Infrastructure & Relays | Twilio, Telegram, Meta, Prembly status tiles | 320px – 1920px | System status display (simulation labels removed) | In Progress |
| 41 | `/staff/notifications` | Notification Center | Filter unread, mark all read, notification link routes | 320px – 1920px | Wired to `/api/staff/notifications` | In Progress |
| 42 | `/staff/audit-log` | Security Audit Trail | Event filter, actor filter, timestamp search | 320px – 1920px | Wired to `/api/staff/audit-logs` | In Progress |
| 43 | `/staff/settings` | Operational Settings | Working hours, default caution fee, service policy | 320px – 1920px | System operational settings | In Progress |
| 44 | `/staff/profile` | Staff Profile | Change password form, update display name, corridor view | 320px – 1920px | Wired to `/api/staff/profile`, `/api/auth/change-password` | In Progress |
| 45 | `/staff/permission-denied` | Escalation Boundary | Request role elevation modal, return to dashboard | 320px – 1920px | Role boundary (simulated dispatch copy removed) | In Progress |

### Group 5: Shared Layout & Navigation Components

| # | Component | Scope & Viewports | Key Controls & Ergonomics | Audit Status |
|---|---|---|---|---|
| 46 | `Header.tsx` | All public pages (320px–1920px) | Logo link, Browse, Neighborhoods, How It Works, Saved badge, Post Property CTA, mobile drawer trigger & links | In Progress |
| 47 | `Footer.tsx` | All public pages (320px–1920px) | Directory links, legal links, regional corridor badges, social triggers | In Progress |
| 48 | `NiaWidget.tsx` | All public pages (320px–1920px) | Floating trigger pill, chat drawer, prompt chips, send input, close drawer | In Progress |
| 49 | `PropertyCard.tsx` | Browse, Home, Neighborhoods (320px–1920px) | Card-to-hero link, save heart bookmark, spec icons, price tag | In Progress |
| 50 | `PropertyGallery.tsx` | Property Detail (320px–1920px) | Image crossfade, play/pause toggle, previous/next, thumbnails, lightbox trigger | In Progress |
| 51 | `StaffHeader.tsx` | All staff pages (320px–1920px) | Breadcrumb links, notifications bell, operational status badge | In Progress |
| 52 | `StaffSidebar.tsx` | All staff pages (320px–1920px) | Nav links (Dashboard, Inbox, Inspections, Properties, Customers, Team, etc.), sign out action | In Progress |

---

## 3. Findings, Fixes & Verification Ledger

*(Entries are recorded as each route and component is audited and hardened).*
