# PR #3 Production-Readiness Review Evidence

**Review date:** 2026-10-19
**Branch under review:** `feature/production-readiness-audit`
**Reviewed implementation commit:** `9bbe4793d341a6270373c7dd02d2cb24f81d47b9`
**Integrated main:** `f463e4a075eac5d2af4c1c7094d58b4667d9cd90` (includes PR #6 and current Nia integration)
**Environment:** Isolated PR worktree. Production data, provider, n8n workflow, migrations, and hosting configuration were not changed.
**Status:** Local tests/build passed on latest main; authenticated staff and Preview app behavior remain blocked. This is not a production-readiness certification.

## Scope and evidence limits

The former route matrix and blanket verification claims have been removed. A route inventory, wired API call, passing unit test, local build, or rendered page does not by itself prove production behavior. Only checks recorded below count as evidence. Unlisted routes, roles, viewports, and external integrations remain unverified.

No public form was submitted. No staff mutation, provider message, webhook replay, or n8n operation was performed.

## Findings addressed in this worktree

- Contact and landlord submissions reuse an idempotency key for unchanged retries, rotate it when the payload changes, and show receipt only for the exact API response `{ requestReceived: true, confirmed: false }`. The key and SHA-256 payload digest are persisted in `sessionStorage`, so same-payload retries after a refresh reuse the key; raw form values are not stored. Storage failures stop submission and surface an error.
- Annual-rent parsing preserves decimal values up to two places and rejects malformed input.
- Public landlord submissions no longer present sample imagery as uploaded photos; the interface says that public photo upload is unavailable.
- The landlord form starts without fictional property, location, room, utility, or title-document selections. City is entered explicitly instead of inferred from state; required details are checked before submission. Bathrooms are included in the submitted description because the current API has no structured bathroom field. Utility/title selections are optional and labeled as owner-reported; the page states that the submission does not verify the details. The form still has no photo-upload control.
- Property API responses no longer default unknown verification to “Direct Instruction” or unknown inspection availability to “Slots Available.” Public unknown states are labeled “Verification status not provided” and “Availability not listed.” The property detail renders bedroom count without asserting ensuite status and shows supplied power/water text instead of deriving daily hours or a specific water source.
- Integration health and audit history no longer use fabricated telemetry or records. Unavailable data is represented as unavailable, not as a successful check.
- The permission-denied page no longer claims that an escalation was sent. The staff header no longer reports unsupported online/unread status.
- New property fields no longer start with fictional listing values. The editor collects the selected type and explicit city/state, and reports that entered utilities are unverified.
- Property preview no longer asserts GPS, title, power, water, inspector, or inspection-date checks. An empty gallery shows an empty state instead of a generic property photo. The review action is labeled for its actual effect: setting publication state to review; it does not claim to create or send revision work.
- Live staff customer pages show an explicit unavailable state instead of fictional fixture records. Demo records are labeled, fabricated Prembly/NIN results and local-only note success were removed, and placeholder conversation IDs are no longer linked to customers. Historical WhatsApp conversations remain in their original channel and replies remain unavailable.
- The staff property list is fixture-gated by explicit demo mode, does not invent inventory/inspection/portfolio metrics, does not infer status from inspection state, and filters availability only when both publication and rental-availability states allow it. Staff property reads no longer inherit the public rent ceiling by default.
- Unsupported conversational messages now explicitly tell users saved preferences are unchanged; preference context remains intact without triggering a listing query.
- The parent-directory Turbopack root override was removed. Portability is determined by a clean dependency install and build inside the project worktree, not by the earlier symlinked-dependency failure.
- The mobile navigation button now changes its accessible name to “Close mobile navigation” while open.

## Verification evidence

| Check | Status | Evidence / limitation |
|---|---|---|
| Focused public-form/property/gallery tests | Pass | The focused suite passed 33 assertions across form retry, annual-rent parsing, fee rules, staff property status, rent filtering, and gallery-order tests. |
| Focused Nia regressions | Pass | 64 tests passed across preference recall/non-search handling, conversation context, social replies, and the current n8n response integration. Unsupported input explicitly leaves saved preferences unchanged without querying listings. |
| Full Vitest suite | Pass with skips | 256 passed; 16 skipped across 32 passing and 2 skipped files. Skipped live tests remain blocked, not passed. |
| Application and test typechecks | Pass | `npm run typecheck` and `npm run typecheck:tests` completed on the reviewed tree. |
| Full ESLint | Pass with warnings | 0 errors, 36 warnings. Warnings are mainly existing Next.js image/navigation advisories. |
| Production build and Turbopack root | Pass | Next.js 16.4.2 built from the project root and generated 80/80 routes without a parent-directory root override. |
| Browser rendering and responsive behavior | Pass, scoped local check | Local production build: 8 public routes at 320, 390, and 1280 CSS-pixel widths (24 combinations), all HTTP 200 with H1s, no detected horizontal overflow, app-error text, or WhatsApp links. Contact had Telegram links; landlord form had blank controls, no file input, and the photo-upload-unavailable disclosure. Mobile navigation opened with the accurate accessible label. No form was submitted. |
| Local authenticated staff behavior | Blocked | Staff property and customer routes returned HTTP 500 because usable Supabase URL/key configuration is absent in this isolated worktree. No authenticated staff flow was tested or claimed. |
| Vercel Preview | Deployment ready; app access blocked | Vercel deployment `CDjFtLHVJwryDBM2xwvvnTjzDv3F` completed for implementation commit `9bbe4793d341a6270373c7dd02d2cb24f81d47b9`; Preview Comments passed. Requests to five public routes redirected HTTP 302 to deployment protection. No Nestly page was observed; Preview route, responsive, gallery, and authenticated staff behavior remain unverified. |
| Dependency advisories | Blocked upstream fix | Production dependencies: 0 vulnerabilities. Full audit: 5 high findings in the dev-only `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces` chain (GHSA-vfj7-8cjw-p6xm). Forced remediation downgrades the lint config to Next 14.2.35, incompatible with Next 16; no compatible update was found. |
| Production behavior | Not tested | Production was not deployed or mutated for this review. |

## Remaining risks and blockers

- No authenticated browser test of the property editor, customer directory, inbox, or preview has been completed. Server-side authorization remains authoritative and is not inferred from UI rendering.
- No landlord/contact submission was made, so live receipt and retry behavior remain unverified beyond tests. `sessionStorage` retry state is scoped to the tab; browser privacy modes that block storage prevent a submission and surface an error.
- Vercel deployment protection blocked Preview app access. Deployment readiness is not treated as route or browser verification.
- Provider health, external verification (including GPS/title/power/water checks), notification delivery, and audit-log completeness require real operational evidence. This UI does not claim those checks occurred.
- Five high-severity dev-toolchain advisories remain pending a compatible upstream fix. Production dependency audit reports zero vulnerabilities; dependency files were not changed.

## Release state

PR #3 remains a draft and unmerged. The review worktree is isolated from Antigravity's worktree. No Production deploy, form submission, provider send, n8n change, or migration was performed. Local browser rendering used the isolated local build; Preview deployment was read-only but protected from unauthenticated route access. No secrets were printed.
