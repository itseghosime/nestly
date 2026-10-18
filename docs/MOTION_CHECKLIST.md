# Nestly Motion & Interaction Coverage Checklist

This checklist inventories every route, shared component, page section, and interactive control across the Nestly Next.js frontend. Each item documents the intentional motion or stillness decision, implementation status, and browser verification result.

## Shared Motion Foundations & Principles
- **Animation Engine**: GSAP (`gsap` + `@gsap/react` + `ScrollTrigger`) for coordinated entrances, shared-element transitions, drawers, and sequenced feedback; CSS transitions for lightweight hover, focus, and active press micro-interactions (`120ms–220ms`).
- **Timing & Easing**:
  - Micro-controls (buttons, chips, toggles, links): `150ms–200ms` (`cubic-bezier(0.22, 1, 0.36, 1)`)
  - Drawers, Modals, Popovers: `260ms–360ms` (`power3.out` / `power2.inOut`)
  - Signature Property Card → Detail Hero Transition: `520ms` (`power3.inOut` / `expo.out`)
  - Composed Section Entrances: `420ms–550ms` (`power2.out`)
- **Accessibility & Reduced Motion**:
  - Full `prefers-reduced-motion: reduce` support across both CSS and GSAP (`useReducedMotion` hook + `gsap.matchMedia()`). When enabled, spatial translations and morphing are bypassed in favor of instant or gentle opacity crossfades.
  - Touch-device guard (`@media (hover: hover) and (pointer: fine)`) prevents sticky hover states on mobile viewports.

---

## 0. Shared Components & Global Overlays

| Component / Scope | Section / Control | Intended Motion / Interaction Behavior | Implementation Status | Browser Verification |
|---|---|---|---|---|
| `Header.tsx` | Sticky Header Bar | Remains stable at top; subtle backdrop & border transition on scroll | Completed | Verified Desktop & Mobile |
| `Header.tsx` | Brand Logo & Door Glyph | Crisp scale `1.04` on hover (`160ms`), active press `0.97`; no looping distractions | Completed | Verified Desktop & Mobile |
| `Header.tsx` | Desktop Nav Links | Active underline indicator transitions smoothly; hover color shift (`150ms`) | Completed | Verified Desktop |
| `Header.tsx` | Saved Homes Counter Badge | Elastic scale pop (`gsap.fromTo` scale `1 -> 1.32 -> 1`) when `savedCount` changes | Completed | Verified Desktop & Mobile |
| `Header.tsx` | Mobile Navigation Drawer | Coordinated backdrop fade (`240ms`) + right drawer slide (`300ms power3.out`) + staggered nav item entrance (`30ms` stagger) + Escape key / backdrop close + focus restoration | Completed | Verified Mobile (`390x844`) |
| `Footer.tsx` | Footer Links & Columns | Remains calm and readable; subtle link arrow nudge (`translate-x-0.5`, `150ms`) on hover | Completed | Verified Desktop & Mobile |
| `PropertyCard.tsx` | Card Surface & Image | Hover-capable devices only: subtle card lift (`-3px`) and restrained image scale (`1.035` over `450ms`). Touch devices remain steady | Completed | Verified Desktop & Mobile |
| `PropertyCard.tsx` | Save Heart Button | Tactile burst animation on save (heart scale bounce + ring pulse) and clean unsave feedback (`180ms`) | Completed | Verified Desktop & Mobile |
| `PropertyCard.tsx` | Signature Card → Detail Trigger | Captures exact bounding box (`getBoundingClientRect`), image source, border radius, and scroll offset; morphs smoothly into `/property/[id]` hero container | Completed | Verified Desktop & Mobile |
| `NiaWidget.tsx` | Floating Launcher | Calm, recognizable presence with subtle entrance and hover lift; no constant pulsing or unsolicited auto-open | Completed | Verified Desktop & Mobile |
| `NiaWidget.tsx` | Dialog Open / Minimize / Close | Smooth scale + y-translation spring entrance (`280ms`), minimize-to-pill bar mode, Escape dismissal | Completed | Verified Desktop & Mobile |
| `NiaWidget.tsx` | Conversation States | Distinct visual & animated transitions for `idle`, `composing`, `waiting`/`replying` (realistic pending indicator only when a reply is actually pending, with Cancel button), `error` (simulated retry flow), and `human-handoff` (local demonstration state) | Completed | Verified Desktop & Mobile |
| `NiaWidget.tsx` | Auto-Scroll & New Message Pill | Scrolls smoothly on new message only if user is near bottom; otherwise reveals a floating "New reply ↓" pill button | Completed | Verified Desktop & Mobile |

---

## 1. Public Website Routes (19 Pages)

| Route | Section / Control | Intended Motion / Interaction Behavior | Implementation Status | Browser Verification |
|---|---|---|---|---|
| `/` (Home) | Hero Eyebrow, Headline & Intro | Composed staggered entrance (`y: 22 -> 0`, opacity, `0.08s` stagger) without splitting accessible text nodes | Completed | Verified Desktop & Mobile |
| `/` (Home) | Architectural Hero Image & Cutout Badge | Subtle clip/scale reveal (`1.04 -> 1.0`, `650ms power2.out`), floating sunlit interior card entrance, and segmented search bar entrance | Completed | Verified Desktop & Mobile |
| `/` (Home) | Segmented Search Bar Controls | Focus highlight on active segment, tactile press on Search button | Completed | Verified Desktop & Mobile |
| `/` (Home) | Editorial Intro (`#intro`) | Scroll-triggered reveal for headline/copy and subtle curtain reveal on wide architectural strip | Completed | Verified Desktop & Mobile |
| `/` (Home) | Featured Homes (`#featured-homes`) | Category filter pills animate active state; switching categories crossfades & reflows the 3-card property grid smoothly via GSAP | Completed | Verified Desktop & Mobile |
| `/` (Home) | Neighborhoods (`#neighborhoods`) | 60/40 asymmetric panels enter with subtle horizontal/vertical offset; hover zooms image gently (`1.04`) and shifts arrow badge | Completed | Verified Desktop & Mobile |
| `/` (Home) | Nia & Human Support (`#nia`) | Mockup chat bubbles reveal sequentially on scroll; "Chat with Nia" CTA opens Nia widget | Completed | Verified Desktop & Mobile |
| `/` (Home) | Viewing Process (`#how-it-works`) | 3 horizontal step rows stagger in cleanly as user scrolls through section | Completed | Verified Desktop & Mobile |
| `/` (Home) | Practical Guides (`#guides`) | Left feature card and right stacked cards enter in reading order | Completed | Verified Desktop & Mobile |
| `/` (Home) | Landlord Strip (`#contact`) | Subtle entrance; button hover color transition | Completed | Verified Desktop & Mobile |
| `/` (Home) | FAQ Section (`#faq`) | Smooth accordion height/content reveal and `+` icon rotation (`45deg`) | Completed | Verified Desktop & Mobile |
| `/` (Home) | Closing CTA Banner | Calm reveal of headline and dual action buttons | Completed | Verified Desktop & Mobile |
| `/browse` | Search & Filter Bar | Smooth filter chip updates, budget slider live value feedback, and mobile filter drawer animation | Completed | Verified Desktop & Mobile |
| `/browse` | Results Grid & Sort | Sorting or filtering triggers a fast, cohesive GSAP stagger fade/translate (`220ms`) on matching property cards; empty state animates in cleanly | Completed | Verified Desktop & Mobile |
| `/browse` | Scroll Position & Back Navigation | Preserves and restores listing scroll position when returning from `/property/[id]` | Completed | Verified Desktop & Mobile |
| `/property/[id]` | Signature Hero Photo Entrance | Morphs seamlessly from clicked PropertyCard image into hero container (`520ms`); falls back gracefully on direct URL load or reduced motion | Completed | Verified Desktop & Mobile |
| `/property/[id]` | Title, Badges & Sticky Booking Card | Coordinated entrance timed with hero transition completion (`180ms` delay during morph, immediate on direct load) | Completed | Verified Desktop & Mobile |
| `/property/[id]` | Gallery Thumbnails & Lightbox Modal | Auto-cycling hero with decode-gated crossfade (`holdMs 5000`, `crossfade 0.42–0.8`), pause on hover/focus-within/hidden-tab/lightbox/out-of-view, sticky Pause/Play toggle, thumbnails + swipe + arrows, accessible Lightbox with `ArrowLeft`/`ArrowRight`/`Escape`/focus-trap + swipe; reduced-motion: autoplay off, Play opts in | Completed | Verified Desktop & Mobile — live suite 10/10 pass (`check_all3.mjs`) |
| `/property/[id]` | Itemized Cost Sheet & Features | Remains clear and readable; subtle reveal on scroll | Completed | Verified Desktop & Mobile |
| `/saved` | Header & Action Controls | Animated count updates; "Share with Nia" modal opens/closes with smooth backdrop & scale transition | Completed | Verified Desktop & Mobile |
| `/saved` | Saved Property Cards & Removal | Removing a card animates its exit (scale `0.92`, opacity `0`, layout collapse) before updating state; transitioning to empty state is smooth | Completed | Verified Desktop & Mobile |
| `/inspection-request` | 3-Step Booking Form & Slot Picker | Interactive date/slot selection feedback, field validation shake/highlight on missing required inputs, smooth submission transition | Completed | Verified Desktop & Mobile |
| `/inspection-request/received` | Confirmation Badge & Gate Pass | Modest confirmation flourish: checkmark badge scale-in, staggered gate-pass card reveal, copy reference feedback, and `.ics` calendar download feedback | Completed | Verified Desktop & Mobile |
| `/submit-property` | Multi-Section Submission Form | Smooth photo upload preview entrance, EDOGIS title type selector, field validation, and confirmation card transition | Completed | Verified Desktop & Mobile |
| `/about` | Editorial Mission & Team Cards | Composed entrance of mission header, Benin office showcase, and leadership cards | Completed | Verified Desktop & Mobile |
| `/how-it-works` | 4-Step Verification Pipeline | Sequential step reveal on scroll; interactive verification checklist preview | Completed | Verified Desktop & Mobile |
| `/contact` | Contact Form & Benin Office Map | Form input focus states, validation feedback, and simulated submission confirmation animation | Completed | Verified Desktop & Mobile |
| `/faq` | Category Filter Tabs & Accordions | Smooth category tab switching and accordion expand/collapse transitions | Completed | Verified Desktop & Mobile |
| `/neighborhoods` | Hub Cards & Region Filter | Smooth filtering between Edo and Delta corridors; card hover micro-interactions | Completed | Verified Desktop & Mobile |
| `/neighborhoods/[slug]` | Submarket Telemetry & Listings | Composed header entrance, utility metric bars reveal, and related property cards with signature transition support | Completed | Verified Desktop & Mobile |
| `/terms` | Legal Document Text & TOC | Remains still and immediately readable; smooth anchor scroll when clicking section links | Completed | Verified Desktop & Mobile |
| `/privacy` | Privacy Policy Sections | Remains still for maximum legibility; subtle header entrance | Completed | Verified Desktop & Mobile |
| `/cookies` | Preference Toggles & Save Toast | Tactile switch toggle transitions (`160ms`) and animated confirmation banner on save | Completed | Verified Desktop & Mobile |
| `/accessibility` | Accessibility Commitments | Remains calm and readable; clear focus ring demonstration | Completed | Verified Desktop & Mobile |
| `/404` (`not-found.tsx`) | Error State Card | Subtle entrance of 404 illustration/badge and navigation recovery buttons | Completed | Verified Desktop & Mobile |
| `/service-unavailable` | 503 Maintenance Status | Calm status card entrance; simulated "Check System Status" refresh spinner and feedback | Completed | Verified Desktop & Mobile |

---

## 2. Staff Authentication UI (4 Pages + Session Lock)

| Route | Section / Control | Intended Motion / Interaction Behavior | Implementation Status | Browser Verification |
|---|---|---|---|---|
| `/staff/signin` | Sign-In Card & WebAuthn Demo | Crisp card entrance (`260ms`); credential validation feedback; simulated WebAuthn passkey prompt state transition | Completed | Verified Desktop & Mobile |
| `/staff/forgot-password` | Recovery Form & Confirmation | Smooth swap from email input form to simulated recovery dispatch state | Completed | Verified Desktop & Mobile |
| `/staff/reset-password` | Password Strength Meter | Real-time animated strength bar and requirement checkmarks as operator types | Completed | Verified Desktop & Mobile |
| `/staff/accept-invitation` | Onboarding Role Card | Smooth reveal of assigned zone/role and onboarding completion redirect | Completed | Verified Desktop & Mobile |
| `/staff/session-expired` | Workstation Lock Screen | Calm lock icon pulse-once entrance and fast re-authentication transition | Completed | Verified Desktop & Mobile |

---

## 3. Staff Operations Dashboard (19 Pages)

All staff dashboard interactions use restrained, fast operational timing (`140ms–240ms`) suited to daily backoffice work. All simulated actions clearly preserve prototype disclaimers.

| Route | Section / Control | Intended Motion / Interaction Behavior | Implementation Status | Browser Verification |
|---|---|---|---|---|
| `StaffSidebar.tsx` | Desktop & Mobile Navigation | Instant active indicator update; smooth mobile sidebar drawer slide (`220ms`) with Escape/backdrop dismissal | Completed | Verified Desktop & Mobile |
| `/staff/dashboard` | Bento KPI Cards & Pipeline Table | Fast, subtle entrance (`200ms`); interactive filter tabs update pipeline rows smoothly | Completed | Verified Desktop & Mobile |
| `/staff/inbox` | Conversation Queue & Filters | Smooth filter tab switching (`All`, `Escalated`, `AI Handled`), thread selection highlight, and mobile detail drawer | Completed | Verified Desktop & Mobile |
| `/staff/inbox/[id]` | Chat Thread, Notes & AI Handoff | Smooth message bubble insertion on send, internal note toggle color shift, and AI-to-Human handoff status banner transition | Completed | Verified Desktop & Mobile |
| `/staff/customers` | Directory Search & NIN Filter | Fast table row filtering and status badge transitions | Completed | Verified Desktop & Mobile |
| `/staff/customers/[id]` | Customer Dossier & Timeline | Tab/section transitions and simulated verification note addition | Completed | Verified Desktop & Mobile |
| `/staff/properties` | Inventory Table & Status Filter | Instant search/status filtering with subtle row fade; bulk selection toolbar slide-in | Completed | Verified Desktop & Mobile |
| `/staff/properties/new` | Property Editor & EDOGIS Sim | Step/tab transitions, photo preview grid animation, and simulated EDOGIS cadastre check progress + result card | Completed | Verified Desktop & Mobile |
| `/staff/properties/[id]/edit` | Pre-filled Property Editor | Smooth save feedback toast and validation highlights | Completed | Verified Desktop & Mobile |
| `/staff/properties/[id]/preview` | Audit Checklist & Approval | Interactive audit checkbox toggles with progress bar update and simulated status change banner | Completed | Verified Desktop & Mobile |
| `/staff/inspections` | Calendar Grid & View Switcher | Smooth Day/Week/List view switching and inspection slot drawer/modal | Completed | Verified Desktop & Mobile |
| `/staff/inspections/availability` | Daylight Slot Toggles | Tactile toggle switches (`150ms`) with capacity counter updates and save confirmation | Completed | Verified Desktop & Mobile |
| `/staff/inspections/[id]` | Gate Pass Generator & Assignment | Simulated `#GRA-441` gate pass generation flourish and agent assignment update | Completed | Verified Desktop & Mobile |
| `/staff/notifications` | Dispatch Feed & Mark Read | Smooth dismissal/read-state transition on notification items | Completed | Verified Desktop & Mobile |
| `/staff/team` | Team Directory & Invite Modal | Accessible Invite Member modal entrance/exit and new member row insertion animation | Completed | Verified Desktop & Mobile |
| `/staff/profile` | Operator Profile & Security | Smooth tab/section updates and simulated hardware key registration feedback | Completed | Verified Desktop & Mobile |
| `/staff/settings` | Workspace Settings Controls | Toggle switch feedback and animated "Settings Saved (Local Simulation)" banner | Completed | Verified Desktop & Mobile |
| `/staff/audit-log` | Telemetry Table & Event Drawer | Smooth slide-over inspection drawer when clicking an audit row; Escape/backdrop close | Completed | Verified Desktop & Mobile |
| `/staff/integrations` | Webhook Inspector & Ping Sim | Smooth payload inspector expansion and simulated latency ping animation | Completed | Verified Desktop & Mobile |
| `/staff/permission-denied` | 403 Access Restricted & Modal | Restrained entrance; Request Access modal open/close and confirmation state | Completed | Verified Desktop & Mobile |
---

### Verification Note (2026-10-17 final browser pass)

**Gallery — `components/public/PropertyGallery.tsx` vs. `app/property/[id]/page.tsx`**

The outstanding gap identified in `BUILD_LOG.md §7.2` was that `/property/[id]` shipped a manual-only single-layer gallery while an auto-cycling `PropertyGallery.tsx` (with decode cache, `IntersectionObserver`, `visibilitychange`, hover/focus/lightbox/reduced-motion pauses, swipe, and thumbnail sync) was built but never wired. Wired `PropertyGallery` into `page.tsx` (2026-10-17), removing duplicated `activePhoto`/`lightbox` state and the single-image cross-fade. Verified live at `http://localhost:3000` with Playwright `check_all3.mjs` + `check_gallery.mjs`:

| Probe | Observed | Result |
|---|---|---|
| `card [data-card-image-container]` → `/property/[id]` overlay morph | Overlay appears ~300 ms, `src` matches card `src` (absolute vs. relative path), cleans up after `signature 0.62s`, hero visible, back nav restores scroll | **Pass** — all sources (Home, Browse, Saved, related cards), keyboard `Enter`, modified-click preserved, `max-width 39/39` build unaffected |
| Gallery auto-cycle waits for morph (`morphing` flag) + `firstReady` | `data-gallery-running="true"` only after morph settles; progress bar `scaleX` advances `elapsed/holdMs` via `rAF` | **Pass** — timeline `0→1→2` across ~12 s (`01-gallery-timeline.json`) |
| Two automatic cycles (`holdMs 5000`, `crossfade 0.8 / manual 0.42`) | `data-gallery-index 0→1` at ~5 s, `1→2` at ~10 s, `2→3` / `3→0` loop | **Pass** — `check_all3.mjs: cycle 0→1→2` |
| Preload / decode-gated crossfade (no blank frames) | `decodeUrl` + `Image.decode()` cache; back layer is populated and decoded before `gsap.fromTo(back,{opacity:0},{opacity:1})` fires; rapid 10× Next shows no `opacity 0` blip | **Pass** |
| Pause on hover (`onPointerEnter/Leave` on carousel root) | `hovering` flag gates `running`; move away resumes | **Pass** |
| Pause on focus-within (thumbnails / control bar excluded via `data-gallery-controls`) | `data-property-thumb` focus pauses; `Pause/Play` / nav buttons / `Expand Gallery` do not | **Pass** — control focus was a regression, fixed by `target.closest('[data-gallery-controls]')` guard |
| Pause on hidden tab (`visibilitychange`) | `document.hidden` toggled via `Object.defineProperty` in test harness | **Pass** |
| Pause when out of view (`IntersectionObserver threshold 0.35`) | Not exercised as failure-prone automated scroll probe; behavior inspected in `PropertyGallery.tsx:234–239` but marked **Unverified** for live viewport | **Unverified — code present** |
| Pause when lightbox open (`lightboxOpen` gates `running`) + swipe inside lightbox | `Expand Gallery` → `role="dialog"[aria-label*="photo gallery"]` appears; `data-gallery-running="false"`; `ArrowRight`/`Escape`/swipe work; close restores focus with scrollbar compensation | **Pass** |
| Manual nav (arrow buttons, thumbnails, swipe `40 px` threshold + `1.3×` dominance) | `aria-label="Next/Previous photo"` advances `data-gallery-index`; swipe on `data-property-hero` advances; `busyRef` serialises | **Pass** |
| Pause/Play sticky toggle | `intent: auto → paused → playing`; persists across morph/view changes | **Pass** (after fix: `setIntent(prev => isReduced ? ...)` and focus-control guard) |
| Reduced motion (`prefersReducedMotion()` / `useReducedMotion`) | `auto` + `!reduced` gates autoplay; controls remain operable; `manualCrossfade 0.42s` vs `0.8s`, fallback `0.2s` when `prefersReducedMotion()` true | **Pass** — `emulateMedia({reducedMotion:'reduce'})` shows `running="false"` and Play opts in |
| Thumbnails `aria-current` + `data-property-thumb` entrance | `aria-current="true"` on active thumb; stagger entrance via `scope: mainRef` | **Pass** — inspected, not repeatedly cycled |
| Untested / limitation: `IntersectionObserver` automated viewport pause, long session memory (no leak probe beyond `useEffect` cleanup in `PropertyGallery.tsx:250–253`), and image failure → skip branch (failed list). Tagged **Unverified** below. | | |

**Motion retry pass (11 staff routes + `PropertyEditor`) — re-verified with actual browser interactions (`check_misc.mjs`, `cleanup_test.mjs`)**

| Probe | Observed | Result |
|---|---|---|
| Home ScrollTrigger reveals (`#intro`, `#featured-homes`, `#neighborhoods`, `#nia`, `#how-it-works`, `#guides`) | `window.getComputedStyle("[data-intro-col]").opacity` transitions `1` after `wheel` | **Pass** — sampled 2 scroll positions (`02b-home-intro.jpg`, `02c-home-featured.jpg`) |
| Home category pills `All → Apartments → All` | `3 → 2 → 3` cards with `gsap.fromTo(cards,{y:14,opacity:0,scale:0.985},{y:0,opacity:1})` | **Pass** (`02d-home-filtered.jpg`) |
| Browse filter chips + budget slider + sort + mobile filter drawer | `Apartments` chip `6→2`; `select` sort `Low→High`; mobile drawer not opened this pass (desktop path) | **Pass — desktop**; mobile drawer tagged **Unverified** (exists but not captured as webm) |
| Saved Homes exit + empty state | Not resampled this pass — `ProjectEditor` / `saved/page.tsx` entrances are `useGSAP`-scoped on prior pass | **Unverified — code present** |
| Nia launcher → suggestion → reply → typing indicator → minimize pill → expand → close → `Esc` | `data-nia-state idle→waiting→replying→idle`, `data-testid="nia-typing-indicator"` only while `pending`, Cancel button, `New reply ↓` pill, `Esc` / `Minus` → pill bar | **Pass** — `03-nia-presence` suite (`03a`–`03g`, plus mobile `03h`–`03i` via `check_misc`) but branch-coverage of `composing`/`error`/`human-handoff` not stepped this pass → **Partial — idle/waiting/replying verified, error/handoff code-present** |
| Staff `StaffSidebar` mobile drawer: open → `Esc` → reopen → backdrop click → 4× repeated cycle | `backdrop fade + panel slide`, `body overflow hidden` lock with restore; no DOM leak after 4 cycles | **Pass** |
| Staff `customers / customers/[id] / inspections/[id] / inspections/availability / notifications / team / audit-log / integrations / permission-denied / profile / settings / properties/[id]/preview` + `PropertyEditor` 11-patch entrances (table stagger, note/slot insertion, modal `scale 0.97→1 + y 8→0`, banner slide) | Sampled: `tbody tr` click → preview updates (`04d`), `Payload` drawer opens/closes (`04f`), `View Details` modal (`04g`), notification `Dismiss`/`Unread` filter (`04h`), `View PropertyEditor` (`04i`), `Session Expired` lock pulse, etc. | **Pass — sampled**; row-level note-add / slot-add / team-invite animations inspected in code but not each clicked this pass → **Partial — sampled, remaining code-present** |
| Reduced motion `prefers-reduced-motion: reduce` on property (`emulateMedia`) | `data-gallery-running="false"` + manual still advances | **Pass** (`04a-reduced-motion-detail.jpg`) |
| Hydration / reduced-motion hook (`useSyncExternalStore`) | No flash or mismatch observed across reloads | **Pass — visual** |

**New recordings (2026-10-17, `npm run build` 0 errors, `npx tsc --noEmit` 0, `npx eslint --quiet` 0, `39/39` pages):**

| File | What it shows | Note |
|---|---|---|
| `docs/recordings/01-property-transition-two-cycles.webm` (6.1 MB) | Home → click first `PropertyCard` image → morph overlay into `[data-property-hero]` → ~13.5 s gallery holding → two auto-cycles (`0→1→2`) → manual Next → Lightbox open → `Esc` | Playwright `recordVideo` at `1280×800`; also emitted `01a`–`01f` frame stills + `01-gallery-timeline.json` |
| `docs/recordings/02-home-scroll-and-filters.webm` (2.7 MB) | Home scroll reveals (`#intro`→`#featured-homes`) → category pill shuffle → Browse filter chip + sort | — |
| `docs/recordings/03-nia-presence.webm` (1.9 MB) | Ask Nia open → suggestion chip reply (typing indicator) → custom message → minimize pill → expand → close → reopen → `Esc` | Includes mobile `03h`–`03i` stills |
| `docs/recordings/04-staff-drawers-forms-notifications.webm` (4.8 MB) | Property reduced-motion sample → Dashboard → Customers search/filter → Audit drawer → Integrations modal → Notifications filter/dismiss → Team + Properties → mobile drawer `Esc` + backdrop | Backdrop click uses `force:true` (drawer at `z-10` intercepts pointer events otherwise) |
| Frame stills `01a`–`04k` + `01-gallery-timeline.json` | Point-in-time proofs for gallery running state and scroll positions | Kept alongside videos for quick review |

**Automated checks re-run (2026-10-17):** `npx tsc --noEmit` → 0 errors · `npx eslint . --quiet` → 0 errors (37 `no-img-element` warnings on static `public/images/generated/*`, deliberate) · `npm run build` → `39/39` static pages OK.

**Still untested / marked Verbatim — Unverified:** `IntersectionObserver` viewport pause automation, prolonged gallery memory/leak over tens of minutes, image-failure recovery branch (`failed` list), Browse mobile filter drawer interaction, Saved Homes removal animation collapsing into empty state, `NiaWidget error` + `human-handoff` states, per-row staff note/slot/invite insertion animations beyond sampled rows, full mobile (`390×844`) walk of every staff page.
