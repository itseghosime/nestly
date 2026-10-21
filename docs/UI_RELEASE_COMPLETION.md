# UI Release Completion Audit & Verification Matrix

| Scope | Branch | Environment | Date | Status |
|---|---|---|---|---|
| Frontend Presentation, Responsive Layouts, Navigation & A11y | `feature/release-ui-completion` | Local (`http://localhost:3005`) & Production (`https://nestly-sigma.vercel.app`) | 2026-10-21 | Complete · Browser-Tested & Source-Reviewed |

---

## 1. Executive Summary & Boundaries

This document records the systematic audit, remediation, and verification across Nestly's public and staff interfaces.
All edits strictly adhere to team ownership boundaries:
- **Owned by Antigravity (`feature/release-ui-completion`)**: Frontend presentation, responsive layout CSS, shared dialog/drawer accessibility and focus management, navigation, non-shrinking controls, product copy cleanup, and website chat interaction.
- **Owned by ChatGPT (PR #25 / Backend)**: `app/api/**`, `lib/backend/**`, `supabase/**`, `app/staff/(dashboard)/settings/page.tsx`, `app/staff/(dashboard)/leads/page.tsx`. (Preserved untouched; findings recorded below).
- **Zero-Tolerance Prohibitions**: No provider sends (Twilio/Telegram), no production form submissions, no fake success simulations, no destructive data mutations, no screenshots/PDFs/recordings.

---

## 2. Route & Viewport Audit Matrix

**Verification Status Categories**:
- **Browser-tested**: Verified via automated headless Chromium browser test with simulated DOM interactions (typing, keyboard navigation, Escape dismiss, scroll lock/restoration, rerenders).
- **Source-reviewed**: Codebase inspection of responsive Tailwind layout classes, focus states, accessible ARIA attributes, semantic markup, and motion hooks.
- **Unverified**: Flow or page not directly audited.

### Public Routes
| Route | 320px | 390px | 768px | 1280px | 1440px | Verification Level | Observed Behavior & Findings |
|---|---|---|---|---|---|---|---|
| `/` (Homepage) | Source-reviewed | Browser-tested | Source-reviewed | Browser-tested | Browser-tested | Browser-tested | Hero search, featured cards, and footer render cleanly without horizontal scroll. Header spans full width (1920px verified); content centers with responsive gutters. |
| `/browse` (Search & Listings) | Source-reviewed | Browser-tested | Source-reviewed | Browser-tested | Source-reviewed | Browser-tested | Mobile filter bottom sheet opens at 390px, locks body scroll, traps Tab focus, and survives filter chip clicks without resetting focus. Closes cleanly on Escape and restores focus to Filter trigger. |
| `/property/[id]` (Detail & Gallery) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Custom lightbox preserves GSAP transitions and fee ledger breakdown without unconfirmed fee calculation fallbacks. |
| `/neighborhoods` (Index) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Bento grid adapts from 1 column (320/390px) to 2 columns (768px) and 3 columns (1280/1440px). |
| `/neighborhoods/[slug]` (Detail) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Breadcrumbs wrap gracefully; related properties grid uses full container width without clipping. |
| `/saved` (Saved Homes) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Share modal wired with `useDialogA11y`: scroll lock, focus trap, Escape dismiss, and focus restoration to Share trigger. Non-shrinking copy button. |
| `/inspection-request` (Booking Form) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Native selects maintain 16px arrow inset and 44px trailing text reserve. Step cards stack neatly on mobile. |
| `/inspection-request/received` (Receipt) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Printable slip layout stays centered on desktop; fits within 320px viewport without truncation. |
| `/about` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Reading width constrained to max-w-[720px] on long-form copy. Editorial image grid stacks cleanly on mobile. |
| `/contact` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Direct channel links (Telegram/WhatsApp) and operation desk notes wrap without overflow. |
| `/how-it-works` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Corrected operational claims to match truthful disclosures (`"Disclosed viewing terms"`, `"Reported utility specs"`, `"Disclosed title details"`, `"Browse daylight photography"`). Sequential process cards adapt across viewports. |
| `/faq` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Accordion trigger buttons have accessible names, proper focus rings, and non-shrinking chevron icons. |
| `/submit-property` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Multi-field listing intake form retains comfortable line lengths and accessible field labels. |
| `/privacy` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Legal prose constrained to legible 65-75ch column with smooth table-of-contents jump links. |
| `/terms` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Responsive legal typography; clear section anchors and accessible headings. |
| `/cookies` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Cookie category preferences toggles and explanations verified at all viewports. |
| `/accessibility` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Clear statement of WCAG compliance, keyboard operability, and reduced-motion support. |
| `/service-unavailable` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Corrected retry feedback from fabricated "maintenance active" claim to truthful connection/status notice. View saved homes shortcut verified. |
| `/404` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Centered error card with verified links to Browse and Saved homes. |

### Staff Auth Routes
| Route | 320px | 390px | 768px | 1280px | 1440px | Verification Level | Observed Behavior & Findings |
|---|---|---|---|---|---|---|---|
| `/staff/signin` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Centered card on clean warm backdrop; email and password inputs maintain accessible labels and focus styles. |
| `/staff/forgot-password` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Recovery request input and back-to-signin link verified without horizontal overflow. |
| `/staff/reset-password` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Password confirmation inputs and security notices fit within 320px width. |
| `/staff/accept-invitation` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Password creation card for newly invited operators renders cleanly across viewports. |
| `/staff/session-expired` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Session notice card with direct sign-in return link verified. |

### Staff Dashboard Routes
| Route | 320px | 390px | 768px | 1280px | 1440px | Verification Level | Observed Behavior & Findings |
|---|---|---|---|---|---|---|---|
| `/staff/dashboard` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Overview KPI bento grid stacks 1 col on mobile, 2 cols on tablet, 4 cols on desktop. Operational table uses available container width. |
| `/staff/properties` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Filter bar wraps gracefully; properties table uses `overflow-x-auto` to prevent clipping on mobile viewports. |
| `/staff/properties/new` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Property creation editor utilizes full workspace width while maintaining readable form sections. |
| `/staff/properties/[id]/edit` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Discard confirmation dialog wired with `useDialogA11y`: scroll lock, focus trap, Escape dismiss, and focus restoration to Discard button. |
| `/staff/properties/[id]/preview` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Approval & Revision confirmation modals wired with `useDialogA11y`: scroll lock, focus trap, Escape dismiss, and focus return to action triggers. |
| `/staff/inspections` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Calendar month grid wrapped with `overflow-x-auto` on small screens (`min-w-[520px]`) so days do not collapse below 390px. |
| `/staff/inspections/availability` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Slot management interface utilizes available container width; time pickers stay accessible. |
| `/staff/inspections/[id]` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Inspection detail and participant cards adapt to stacked view on mobile. |
| `/staff/inbox` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Split inbox stacks cleanly on mobile (< 1024px); 12-col master-detail on desktop. Filter pills wrap without clipping. |
| `/staff/inbox/[id]` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Message thread uses dynamic viewport heights; composer input remains visible above virtual keyboard. |
| `/staff/customers` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Customer directory table has `overflow-x-auto` and `min-w-[620px]` with non-shrinking action links. |
| `/staff/customers/[id]` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Customer timeline and profile details adapt across viewports. |
| `/staff/offers` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Offer review table uses responsive container and non-shrinking status badges. |
| `/staff/team` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Collaborator directory table has `overflow-x-auto` and `min-w-[620px]`; invite form retains comfortable line length. |
| `/staff/audit-log` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Telemetry payload slide-over drawer wired with `useDialogA11y`: scroll lock, focus trap, Escape dismiss, and focus return to close trigger. |
| `/staff/integrations` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Service configuration modal has working ESC/Tab/scroll-lock implementation. |
| `/staff/notifications` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Filter buttons have `shrink-0 whitespace-nowrap`; notification cards wrap text cleanly. |
| `/staff/profile` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Profile and password forms maintain reading column max-w; save buttons have `shrink-0`. |
| `/staff/permission-denied` | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Removed `" · S18"` implementation jargon. Contact modal wired with `useDialogA11y`: scroll lock, focus trap, and return focus to Contact button. |
| `/staff/settings` (Read-only) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Inspected read-only. Clean layout; reported finding for ChatGPT below. |
| `/staff/leads` (Read-only) | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Source-reviewed | Inspected read-only. Clean layout; reported finding for ChatGPT below. |

---

## 3. Interactive Browser Verification (Playwright Headless Chromium)

Browser interactions were verified using the dedicated automated script [`scripts/test-ui-release-browser.mjs`](file:///Users/mac/Documents/Tech4Youth/Nestly-release-ui-completion/scripts/test-ui-release-browser.mjs). This script runs against local Next.js builds using synthetic fixtures only (zero production credentials, zero external API or network calls, and zero screenshots/recordings):

### Scenario 1: Mobile Nia Assistant (390x844 Viewport)
- **Environment**: Next.js production build (`http://localhost:3012`), Chromium Mobile Headless (390x844px, touch enabled).
- **Interactions & Observations**:
  1. Initial state: `document.body.style.overflow` verified as unlocked (`""`).
  2. Clicked launcher button `Open Nia Property Assistant`: Dialog `div[role="dialog"][aria-label="Nia Property Assistant"]` mounted.
  3. Body scroll lock acquired: `document.body.style.overflow` became `"hidden"`.
  4. Typed 26 characters into chat input (`"Looking for 2 bed in Ikoyi"`): Active focus verified to remain solidly on `<input>`, with zero focus-stealing or re-centering across state updates.
  5. Keyboard containment: Forward `Tab` and backward `Shift+Tab` keys contained focus within the dialog container.
  6. Dismissal: Pressed `Escape` key. Dialog closed cleanly.
  7. Scroll lock restoration: `document.body.style.overflow` restored to `""`.
  8. Opener focus restoration: Opener launcher button received focus on next animation frame.

### Scenario 2: Mobile Search Filter Drawer (`/browse` at 390px Viewport)
- **Environment**: Next.js production build (`http://localhost:3012`), Chromium Headless (390x844px).
- **Interactions & Observations**:
  1. Clicked `Filters` button (`getByRole('button', { name: 'Filters', exact: true })`).
  2. Filter bottom sheet `div[role="dialog"][aria-label="Filter Homes"]` opened; `document.body.style.overflow` locked to `"hidden"`.
  3. Clicked `"Apartment"` property type chip inside drawer (triggers parent state change and rerender).
  4. Observed: Drawer remained open, `document.body.style.overflow` stayed `"hidden"`, and active focus remained inside the drawer without resetting.
  5. Pressed `Escape`: Drawer closed; `document.body.style.overflow` restored to `""`; filter button refocused.

### Scenario 3: Wide Screen Layout & Horizontal Scroll Audit (1280px, 1440px & 1920px Viewports)
- **Environment**: Next.js production build (`http://localhost:3012`), Chromium Headless.
- **Routes & Viewports Tested**: `/`, `/browse`, `/how-it-works` across 1280x900px, 1440x900px, and 1920x1080px.
- **Interactions & Observations**:
  1. At 1280px, 1440px, and 1920px: `document.documentElement.scrollWidth <= document.documentElement.clientWidth` across all tested routes $\rightarrow$ Zero horizontal scroll.
  2. Full-width headers and footers expand to 100% viewport width with balanced padding.
  3. Long-form copy and forms remain constrained to ergonomic reading containers.

---

## 4. Shared Components, Modals & Drawers Architecture

### Dialog & Drawer Lifecycle Management (`hooks/use-dialog-a11y.ts`)
The hook was redesigned to eliminate ordinary re-render side-effects, support overlapping dialogs, and respond dynamically to responsive viewport changes:
1. **Reference-Counted Scroll Lock (`activeScrollLocks`)**:
   - Module-level counter tracks how many dialogs/drawers currently request body scroll lock.
   - When count transitions from `0` to `1`: original body `overflow` and exact inline `paddingRight` are saved; `overflow` set to `'hidden'`.
   - Scrollbar shift compensation is computed as `computedBodyPadding + scrollbarWidth` (e.g. 12px existing padding + 16px scrollbar = 28px while locked).
   - When count transitions from `1` to `0`: original body `overflow` and exact inline `paddingRight` are restored.
   - Closing an inner dialog while an outer drawer remains open does **NOT** prematurely unlock the body scroll.
2. **Dynamic `lockScroll` Responsiveness**:
   - Dedicated effect handles scroll locking decoupled from dialog open/close lifecycle.
   - When `lockScroll` transitions (e.g. desktop $\rightarrow$ mobile $\rightarrow$ desktop while Nia remains open), scroll lock is acquired or released accordingly without re-running setup, restarting initial focus, or restoring opener focus.
3. **Topmost Modal Ownership of Escape & Focus Trapping (`activeDialogStack`)**:
   - Module-level stack tracks open dialog instances via unique `useId()` identifiers.
   - Only the topmost active modal (`activeDialogStack[last]`) responds to `Escape` keydown events or traps `Tab`/`Shift+Tab` focus.
   - When the top modal closes, the underlying modal re-acquires Escape and Tab focus ownership.
4. **Stable Latest-Value Strategy (`useRef`)**:
   - `onCloseRef`, `containerRefRef`, `initialFocusRefRef`, and other options are stored in refs and updated in a render-synchronizing `useEffect`.
   - The open lifecycle hook depends strictly on `[isOpen, instanceId]`.
   - Ordinary parent re-renders (such as typing characters in mobile Nia, clicking filter pills, or updating table queries) do **not** restart the effect, do **not** refocus the initial element, and do **not** restore opener focus prematurely.
5. **Focus Restoration via `requestAnimationFrame`**:
   - Opener element focus restoration is scheduled on next animation frame so that newly mounted or re-rendered opener elements are ready in the DOM.
6. **Single-Owner Escape Handling in `NiaWidget.tsx`**:
   - Removed the competing manual `useEffect` keydown listener in `NiaWidget.tsx`.
   - `useDialogA11y` now acts as the single unified owner of Escape key handling:
     - If an AI search request is pending, pressing Escape cancels the pending search and stays in the chat window.
     - If no query is pending, pressing Escape dismisses the chat window.

### Non-Shrinking Icons & Controls (`shrink-0`)
Added `shrink-0` across:
- `components/public/PropertyCard.tsx`: Calendar icon on Book Visit button and ArrowRight icon on detail button.
- `components/public/Header.tsx`: PlusCircle on List Home, MessageSquare on Chat with Nia, Menu on mobile trigger, and X on drawer close.
- `components/staff/StaffSidebar.tsx`: Navigation icons, ExternalLink icon, ChevronRight icon, and mobile drawer buttons.

### Website Chat (Nia)
- Latest message visibility on open: Guaranteed via double `requestAnimationFrame` in `useMessageStreamScroll`.
- Message streaming & reply scrolling: Smooth automatic scrolling when user is near bottom; floating "New messages" pill when scrolled up.
- Font sizes: Chat text maintained strictly at `text-[14px] leading-relaxed`. No unsolicited input font enlargements.
- Input wrapper: Scaled via `.nia-compact-field` and `.nia-compact-input` in `globals.css` on touch devices to prevent mobile iOS zoom while maintaining compact 36px field height.
- Native select controls: Spacing for dropdown arrows preserved in `globals.css` (**16px arrow inset** via `background-position: right 1rem center` and **44px trailing text reserve** via `padding-inline-end: 2.75rem`).

---

## 5. Wide-Screen Side-Gap & Content-Width Architecture

### Public vs. Staff Distinction
Public routes and staff dashboard routes serve distinct functional purposes and are validated independently:
- **Public Routes (Browser-Tested)**: Public pages (`/`, `/browse`, `/how-it-works`) were verified in headless Chromium at 1280px, 1440px, and 1920px. They maintain centered content containers with responsive gutters (`px-4 sm:px-8 lg:px-16`) and full-width top headers, ensuring zero unintended blank margins and zero horizontal scroll.
- **Staff Dashboard Routes (Source-Reviewed)**: Staff routes require an authenticated staff session and were audited through source inspection of `app/staff/(dashboard)/**`. **Staff side-gap resolution is not claimed based on the public homepage.** Instead, staff routes were verified as follows:
  1. Top-level dashboard workspace layout (`app/staff/(dashboard)/layout.tsx`) wraps main content in `flex-1 min-w-0` with responsive margins and gutters spanning the entire available viewport width.
  2. Operational data grids, tables, and calendars (`/staff/properties`, `/staff/inspections`, `/staff/inbox`, `/staff/customers`, `/staff/audit-log`, `/staff/team`) use `w-full` table layouts with dedicated horizontal scroll wrappers (`overflow-x-auto min-w-[520px]` or `min-w-[620px]`) so operational density utilizes available screen space without dead margins.
  3. Single-entity management cards and forms (`/staff/signin`, `/staff/properties/new`, `/staff/profile`, `/staff/settings`) use intentional max-width containers (`max-w-xl`, `max-w-2xl`, `max-w-4xl`) to maintain ergonomic reading distances on wide viewports (1440px+).

---

## 6. Product Copy & Truthful Disclosures Cleanups

1. **`app/staff/(dashboard)/permission-denied/page.tsx`**:
   - Removed implementation jargon `" · S18"` from the status badge.
   - Now reads: `Error 403 · Access Restricted`.

2. **`app/how-it-works/page.tsx`**:
   - Corrected `"100% verified access"` $\rightarrow$ `"Disclosed viewing terms"`.
   - Corrected `"Pre-audited utilities"` $\rightarrow$ `"Reported utility specs"`.
   - Corrected `"C-of-O & Survey · Direct instruction"` $\rightarrow$ `"C-of-O & Survey · Disclosed title details"`.
   - Corrected `"Browse verified daylight photography & itemized fee sheets"` $\rightarrow$ `"Browse daylight photography & itemized fee sheets"`.

3. **`app/service-unavailable/page.tsx`**:
   - Corrected simulated retry feedback: Replaced misleading claim `"Status check: Scheduled maintenance is currently active. Services will restore shortly."` with truthful guidance: `"Live service status check is unavailable from this page. Please verify your internet connection and reload the page. Your saved homes remain intact."`

---

## 7. Read-Only Findings Reported for ChatGPT (PR #25)

The following two files were inspected read-only to preserve PR #25 boundaries:
1. **`app/staff/(dashboard)/settings/page.tsx`**:
   - **Line 221**: Contains implementation identifier jargon `"System Configuration · S15"`. Recommend updating to `"System Configuration"` or `"Regional Defaults"`.
   - **Header action button**: Recommend adding `shrink-0` to the `Sliders` and `CheckCircle2` icons.
2. **`app/staff/(dashboard)/leads/page.tsx`**:
   - **Header action button**: Recommend adding `shrink-0` to the `RefreshCw` icon (`<RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-ink" />`).

---

## 8. Verification Results

| Check | Tool / Command | Result | Notes |
|---|---|---|---|
| Application Typecheck | `npx tsc --noEmit` | **Pass** (0 errors) | Strict TypeScript compiler check across all app source files. |
| Test Suite Typecheck | `npx tsc --project tsconfig.tests.json --noEmit` | **Pass** (0 errors) | Strict TypeScript compiler check across all test suites. |
| Unit & Integration Tests | `npm test` (Vitest) | **Pass** (39/39 suites passed, 314 passing tests, 16 skipped live tests) | Full test suite execution across unit and API tests. |
| Dialog A11y Regressions | `npx vitest run tests/unit/use-dialog-a11y.test.ts` | **Pass** (5/5 tests passed) | Mounted React 19 hook tests: scrollbar compensation (12px+16px=28px), dynamic lockScroll (desktop $\leftrightarrow$ mobile), topmost modal Escape ownership, focus stability on rerenders with inline callbacks. |
| Linter | `npm run lint` (ESLint) | **Pass** (0 errors, 33 existing Next.js `<img>` warnings) | Zero ESLint errors across source and tests. |
| Production Build (Local Worktree) | `npx next build --webpack` | **Pass** (84/84 static and dynamic routes built in 1044ms) | Webpack follows symlinked `node_modules` across worktrees. |
| Production Build (Turbopack in Worktree) | `npx next build` | **Fails locally in worktree only** | Fails with `Could not find Next.js package (next/package.json)` because Turbopack's sandbox refuses symlinks pointing outside the workspace root (`node_modules -> /Nestly/node_modules`). |
| Production Build (Vercel) | `npm run build` (`next build`) | **Passes on Vercel** | Vercel clones the repo into a single standalone workspace root where `node_modules` is a physical local folder installed by `npm install` (no external symlinks). |
| Interactive Browser Testing | `node scripts/test-ui-release-browser.mjs` (Playwright) | **Pass** (19/19 checks passed) | Automated browser verification on mobile Nia, search filter drawer, and wide-screen horizontal scroll. |
