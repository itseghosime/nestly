# Nestly Public Release Audit & Hardening Report

**Audit Date:** 2026-10-18  
**Target Environment:** Public Frontend Pre-release Audit  
**Git Worktree:** `/Users/mac/Documents/Tech4Youth/Nestly-public-release`  
**Active Branch:** `feature/public-release-polish`  
**Pull Request:** Draft PR #2 (`https://github.com/itseghosime/nestly/pull/2`)  
**Base Commit / Upstream Merge:** Refreshed and cleanly merged `origin/main` (`2a1ba6ed`, including admin Telegram webhook registration) into `feature/public-release-polish` with 0 conflicts.  
**Mergeability:** Verified cleanly mergeable with `origin/main`; GitHub status reports `Checks passing`.  
**Parallel Checkout Isolation:** Copilot's active work on `feature/telegram-integration` has been merged upstream into `main`. Primary checkout (`/Users/mac/Documents/Tech4Youth/Nestly`) on `main` was kept completely untouched. Shared `docs/BUILD_LOG.md` was preserved without local edits to prevent merge collisions.

---

## 1. Executive Summary & Verification Methodology

This hardening audit reviewed all public-facing pages, shared public layout components, and customer interaction flows in the Nestly platform. All approved Stitch V2 design specifications, warm white / charcoal / persimmon design tokens, Manrope typography, soft pill ergonomics, GSAP motion timelines, card-to-detail hero transitions, and automatic photo gallery cycling were maintained.

To maintain strict truthfulness, verification results are partitioned strictly into three distinct evidence categories:
1. **Static Code Inspection:** Structural review of TypeScript types, component logic, accessibility attributes, error boundaries, and API integration contracts.
2. **Local Automated Tests:** Automated typechecking (`tsc`), linting (`eslint`), unit test suites (`vitest`), and Next.js production compilation (`next build`).
3. **Browser Verification:** Visual inspection of desktop layouts in Google Chrome, component rendering, navigation links, and local UI state transitions.

> [!IMPORTANT]
> **Boundary Declarations:**
> - **Simulated Form Submissions:** Form submissions on `/inspection-request`, `/submit-property`, and `/contact` operate entirely on local client state and mock timers. They do not persist to a live database or deliver live emails/SMS, and remain prototype demonstration functionality pending production backend integration.
> - **Unverified Release Claims:** No assertions are made regarding live mobile touch gestures, cross-device contrast compliance (WCAG AA), or synthetic HTTP 503 network resilience without empirical evidence from specialized automated test runners. These remain explicitly marked **Unverified**.

---

## 2. Evidence Classification & Quality Gates

### A. Local Automated Tests (Empirical Results)

| Test Category | Command | Target / Scope | Result | Details |
|---|---|---|---|---|
| **TypeScript Strict Check** | `npx tsc --noEmit` | Full workspace (80 routes + shared modules) | **PASSED (Exit 0)** | 0 type errors across all routes, components, and libraries. |
| **ESLint Static Analysis** | `npx eslint . --quiet` | React 19 compiler rules & Next.js standards | **PASSED (Exit 0)** | 0 warnings, 0 errors. Preserved manual memoization & eliminated cascading renders (`react-hooks/set-state-in-effect`). |
| **Unit Test Suite** | `npx vitest run` | 22 test files (156 passed tests, 16 skipped) | **PASSED (Exit 0)** | 156 passed, 16 skipped (live Supabase/Twilio tests skipped due to unconfigured cloud credentials). Includes deterministic tests in `tests/unit/public-release-hardening.test.ts`. |
| **Next.js Production Build** | `npm run build` | Next.js 16.4.2 (Turbopack engine) | **PASSED (Exit 0)** | Successfully compiled and emitted 80/80 static and dynamic routes. |

### B. Static Code Inspection (Inspected Artifacts)

- `lib/types.ts`: Verified `Property` schema includes `fees?: FeeRow[]`, `computedTotal?: number | null`, and `unconfirmedFeeCount?: number`.
- `lib/price.ts`: Verified `computeTotal` contract and `computeFeeBreakdown` helper. Intermediate subtotal accumulations maintain full precision; displayed values are rounded only upon presentation. Confirmed missing or unconfirmed required fees (`confirmed_at === null`) return `null`.
- `lib/properties.ts`: Inspected `mapApiRow`, `fetchProperties`, `fetchPropertyById`, and `syncRelatedProperties`. Confirmed HTTP 404 returns `null` cleanly without falling back to demo fixtures in connected mode. Confirmed HTTP 500 throws recoverable errors. Correct API envelope `{ data: [...] }` used throughout.
- `lib/neighborhoods.ts`: Inspected `fetchNeighborhoods` and `fetchNeighborhoodBySlug`. Confirmed 404 returns `null` and network errors throw recoverable exceptions in connected mode.
- `components/public/PropertyCard.tsx`: Inspected spec line rendering to ensure absence of `powerRating` omits the metric rather than fabricating "24/7" or "Standard Daily".
- `app/property/[id]/page.tsx`: Verified route param resets (`resolvedParams.id !== currentId`), fee ledger mapping without regex stripping, absence of hardcoded 10% legal/agency fees or ₦200k/₦300k fallbacks, and immediate clearing of related properties via `syncRelatedProperties` on route change, failure, or empty API array `{ data: [] }`.
- `app/neighborhoods/[slug]/page.tsx`: Verified route slug resets (`resolvedParams.slug !== currentSlug`), 404 vs 500 separation, power reliability truthfulness, and clearing of related listings on empty array or network failure.
- `app/browse/page.tsx`: Verified fixture initialization gated behind `IS_DEMO_MODE`, empty state handling on network errors, and accessible labels on all dismiss controls.
- `app/cookies/page.tsx`: Verified accessible label on cookie update dismiss button.

### C. Browser Verification (Desktop Scope)

- **Layout & Tokens:** Verified warm white (`#FCFBF8`), charcoal (`#202320`), and persimmon (`#ED572E`) tokens render accurately on desktop viewport (1440px).
- **Navigation:** Confirmed desktop header navigation links, footer directory, and back breadcrumbs navigate accurately between `/browse`, `/property/[id]`, `/neighborhoods`, and `/saved`.
- **Card-to-Detail & Gallery:** Confirmed GSAP transitions execute smoothly and image fallbacks handle broken asset paths gracefully.
- **Unverified Checks (Explicitly Marked):** Live mobile touch gestures, mobile swipe interactions, screen reader voiceover audits, and automated color contrast scoring were not executed in this pass and are **UNVERIFIED**.

---

## 3. Public Route Matrix & Status

| Route Path | Route Type | Verification Category | Interactive Behavior | Fallback / Error Handling | Release Status |
|---|---|---|---|---|---|
| `/` | Static (`○`) | Static Inspection + Build | Hero search query redirect to `/browse`, category chips | Static fallback | Ready for review |
| `/browse` | Static (`○`) | Static Inspection + Build + Unit Tests | Multi-filter bar (location, beds, type, price slider, sort) | Gated behind `IS_DEMO_MODE`; shows recoverable error on API failure; accessible dismiss labels | Ready for review |
| `/property/[id]` | Dynamic (`ƒ`) | Static Inspection + Build + Unit Tests | Save shortlist, copy share link, image gallery, modal | 404 view for invalid ID; recoverable error for network failure; confirmed fee ledger; truthful power metric; running subtotal display; cleared related listings on empty/failure | Ready for review |
| `/neighborhoods` | Static (`○`) | Static Inspection + Build | State filter pills (Edo vs Delta), search filter | Empty search state; truthful power display | Ready for review |
| `/neighborhoods/[slug]` | Dynamic (`ƒ`) | Static Inspection + Build + Unit Tests | Breadcrumbs, related property card links | 404 view for invalid slug; recoverable error on network failure; truthful power display; cleared related listings on empty/failure | Ready for review |
| `/saved` | Static (`○`) | Static Inspection + Build | LocalStorage bookmark toggles, copy reference codes, share modal | Empty state with browse CTA | Ready for review |
| `/inspection-request` | Static (`○`) | Static Inspection + Build | Date/time slot selector, input validation, client submit | Client-side validation; **Prototype demonstration only** | Unfinished release functionality (Needs live backend) |
| `/inspection-request/received` | Static (`○`) | Static Inspection + Build | Copy reference code, download .ics calendar event | Query param token sanitize | Prototype demonstration only |
| `/about` | Static (`○`) | Static Inspection + Build | Information layout, team overview | Static content | Ready for review |
| `/how-it-works` | Static (`○`) | Static Inspection + Build | 4-step process guide, verification pillar cards | Static content | Ready for review |
| `/submit-property` | Static (`○`) | Static Inspection + Build | Multi-step property submission form, mock photo upload | Client-side validation; **Prototype demonstration only** | Unfinished release functionality (Needs live backend) |
| `/faq` | Static (`○`) | Static Inspection + Build | Category filter chips, keyword search, accordion expand/collapse | ARIA expanded attributes; clear search button | Ready for review |
| `/contact` | Static (`○`) | Static Inspection + Build | Inquiry type selector, message input, mock submit | Client-side validation; **Prototype demonstration only** | Unfinished release functionality (Needs live backend) |
| `/terms` | Static (`○`) | Static Inspection + Build | Statutory Edo/Delta tenancy terms, dispute mechanisms | Static prose | Ready for review |
| `/privacy` | Static (`○`) | Static Inspection + Build | NDPA 2023 compliance layout, demonstration disclosures | Static prose with demonstration notice | Ready for review |
| `/cookies` | Static (`○`) | Static Inspection + Build | Cookie preference toggles, local persistence, dismiss button | ARIA live notification; accessible dismiss label | Ready for review |
| `/accessibility` | Static (`○`) | Static Inspection + Build | Accessibility commitments and contact details | Static prose | Ready for review |
| `/404` | Static (`○`) | Static Inspection + Build | Custom 404 illustration, return home CTA | Next.js not-found boundary | Ready for review |
| `/service-unavailable` | Static (`○`) | Static Inspection + Build | 503 maintenance notice, retry button | Static demonstration page | Ready for review |

---

## 4. Issues Identified & Code Fixes

### Issue 1: Invented Fees & Unsafe Money Parsing
- **Location:** `app/property/[id]/page.tsx`
- **Root Cause:** Property detail assumed a 10% legal fee and 10% agency fee, stripped punctuation from formatted caution/service strings using regex `replace(/[^0-9]/g, '')`, and defaulted missing fees to ₦200,000 and ₦300,000.
- **Fix:** Removed all invented fee constants and regex text stripping. Integrated the confirmed per-property fee ledger (`property.fees: FeeRow[]`) and canonical `computeTotal(rentAnnual, fees)` contract from `lib/price.ts`. If required fees are unconfirmed (`confirmed_at === null`) or missing, `computeTotal` returns `null` and the UI explicitly renders `"Total unavailable — pending fee confirmation"`.

### Issue 2: Fabricated Power Reliability Claims
- **Location:** `components/public/PropertyCard.tsx:170`, `app/property/[id]/page.tsx:277`, `app/neighborhoods/[slug]/page.tsx:175`, `app/neighborhoods/page.tsx:183`
- **Root Cause:** When `powerRating` or `powerReliability` was missing or empty, code defaulted to `'24/7'` or `'Standard Daily'` and displayed `'Priority Feeder'` badges.
- **Fix:** Replaced fabricated fallbacks with truthful handling:
  - In `PropertyCard.tsx`: Omitted the power metric segment entirely when `property.powerRating` is empty.
  - In `app/property/[id]/page.tsx`: Displays `"Not provided"` when `property.powerRating` is absent.
  - In `app/neighborhoods/[slug]/page.tsx`: Displays `"Not provided"` and suppresses the "Priority Feeder" tag when `neighborhood.powerReliability` is absent.
  - In `app/neighborhoods/page.tsx`: Displays `"Not provided"` when `n.powerReliability` is absent.

### Issue 3: Fixture Initialization in Connected Mode & 404 Distinction
- **Location:** `lib/properties.ts`, `lib/neighborhoods.ts`, `app/browse/page.tsx`, `app/property/[id]/page.tsx`, `app/neighborhoods/[slug]/page.tsx`
- **Root Cause:** Browse, property detail, neighborhood detail, and related listings initialized state with static demo fixtures even when running in connected mode (`NEXT_PUBLIC_DEMO_MODE !== 'true'`). Furthermore, network errors and 404 responses were conflated.
- **Fix:** 
  - Gated all fixture initializations behind explicit `IS_DEMO_MODE` checks. In connected mode, initial state is empty (`[]` or `null`).
  - Updated `fetchPropertyById` and `fetchNeighborhoodBySlug` to return `null` on HTTP 404, while throwing exceptions on HTTP 500 or network failure.
  - Added dedicated recoverable error views with retry buttons on `/browse`, `/property/[id]`, and `/neighborhoods/[slug]`. True 404 responses render on-brand "Not Found" cards.

### Issue 4: State Resets on Route ID Changes & Accessible Dismiss Controls
- **Location:** `app/property/[id]/page.tsx`, `app/neighborhoods/[slug]/page.tsx`, `app/browse/page.tsx`, `app/cookies/page.tsx`
- **Root Cause:** Navigating between dynamic IDs or slugs retained the previous entity's state while loading. Several icon/glyph buttons (`✕` and `<X>`) lacked accessible `aria-label` attributes for assistive technology.
- **Fix:**
  - Implemented state adjustment during render (`if (resolvedParams.id !== currentId)` and `if (resolvedParams.slug !== currentSlug)`) to instantly reset state, loading flags, and related properties when navigating between properties or neighborhood pockets.
  - Added accessible labels: `aria-label="Dismiss listing notice"`, `aria-label="Close filters"`, `aria-label="Dismiss cookie notice"`, and specific labels on all active filter chips.

### Issue 5: Alignment of Fee Breakdown with ComputeTotal Precision
- **Location:** `lib/price.ts`, `app/property/[id]/page.tsx`
- **Root Cause:** `computeFeeBreakdown` previously rounded the intermediate subtotal after each step, producing cumulative rounding drift against `computeTotal` (e.g. 177.77 vs 177.78 on rent 100 with two 33.333% fees).
- **Fix:**
  - Updated `computeFeeBreakdown` to preserve full floating-point precision during subtotal accumulation, rounding displayed amounts (`calculatedAmount` and `runningSubtotal`) only.
  - Verified regression reproduction: rent 100 + 33.333% rent fee + 33.333% subtotal fee displays breakdown subtotal 177.78 matching `computeTotal` exactly.

### Issue 6: Stale Related Listings Component Behavior & Correct API Envelope
- **Location:** `lib/properties.ts`, `app/property/[id]/page.tsx`, `app/neighborhoods/[slug]/page.tsx`
- **Root Cause:** Unit tests previously tested local array assignment rather than actual component lifecycle behavior, and used an incorrect `{ properties: [] }` envelope rather than the actual `{ data: [] }` envelope.
- **Fix:**
  - Implemented and exported `syncRelatedProperties` in `lib/properties.ts`, integrating it directly into `app/property/[id]/page.tsx`.
  - Added unit regression tests exercising component behavior using `{ data: [] }` and `{ data: [...] }` envelopes.
  - Verified route changes, empty array responses, network failures, and late responses arriving from previous routes (discarded via cancellation flag).

### Issue 7: Deterministic Connected-Mode Tests
- **Location:** `tests/unit/public-release-hardening.test.ts`
- **Root Cause:** Connected-mode test cases previously checked `if (IS_DEMO_MODE) return;`, silently skipping execution when the static module evaluation defaulted to demo mode.
- **Fix:**
  - Configured `vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false')` in `beforeEach`.
  - Added `vi.resetModules()` and dynamic module imports (`await import('@/lib/properties')`) to enforce deterministic connected-mode test execution on every run.

---

## 5. Remaining Blockers & External Backend Dependencies

The public frontend polish for PR #2 is complete and verified against local typecheck, lint, unit test, and production build gates. Upstream Telegram channel integration from `origin/main` has been refreshed and merged into this branch with zero conflicts. The following capabilities require live infrastructure, credentials, and backend completion before platform launch:

1. **Production Backend Services:**
   - Real property inspection booking requires live endpoints connected to Postgres/Supabase and SMS dispatch.
   - Landlord property submissions require authenticated upload endpoints and cloud storage buckets (`property-media`, `property-drafts`).
2. **Third-Party Provider Credentials:**
   - WhatsApp Cloud API / Twilio SMS webhooks (`WHATSAPP_APP_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`).
   - Transactional email gateway (`RESEND_API_KEY`).
   - HMAC signing secret for verifiable inspection receipts (`PUBLIC_RECEIPT_HMAC_SECRET`).
3. **Deployment Gate:**
   - Verification of live Telegram bot webhook secret (`TELEGRAM_WEBHOOK_SECRET`) and cron secret (`CRON_SECRET`) in Vercel production environment.
