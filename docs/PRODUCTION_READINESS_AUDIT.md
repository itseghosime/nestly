# PR #3 Production-Readiness Review Evidence

**Review date:** 2026-10-18
**Branch under review:** `feature/production-readiness-audit`
**Base reviewed:** PR head `eb858103213b1c35047f55d9aaaa13c34fb98d9d`; local corrections are in the isolated worktree and are not yet pushed.
**Environment:** Isolated local worktree. No production data, provider, n8n workflow, migration, or hosting configuration was changed during this review.
**Status:** Local review corrections and checks are complete; this is not a production-readiness certification.

## Scope and evidence limits

The former route matrix and blanket verification claims have been removed. A route inventory, wired API call, passing unit test, local build, or rendered page does not by itself prove production behavior. Only checks recorded below count as evidence. Unlisted routes, roles, viewports, and external integrations remain unverified.

No public form was submitted. No staff mutation, provider message, webhook replay, or n8n operation was performed.

## Findings addressed in this worktree

- Contact and landlord submissions reuse an idempotency key for unchanged retries, rotate it when the payload changes, and show receipt only for the exact API response `{ requestReceived: true, confirmed: false }`. The key is page-session scoped; refresh persistence is not implemented.
- Annual-rent parsing preserves decimal values up to two places and rejects malformed input.
- Public landlord submissions no longer present sample imagery as uploaded photos; the interface says that public photo upload is unavailable.
- The landlord form starts without fictional property, location, room, utility, or title-document selections. City is entered explicitly instead of inferred from state; required details are checked before submission. Bathrooms are included in the submitted description because the current API has no structured bathroom field. Utility/title selections are optional and labeled as owner-reported; the page states that the submission does not verify the details. The form still has no photo-upload control.
- Property API responses no longer default unknown verification to “Direct Instruction” or unknown inspection availability to “Slots Available.” Public unknown states are labeled “Verification status not provided” and “Availability not listed.” The property detail renders bedroom count without asserting ensuite status and shows supplied power/water text instead of deriving daily hours or a specific water source.
- Integration health and audit history no longer use fabricated telemetry or records. Unavailable data is represented as unavailable, not as a successful check.
- The permission-denied page no longer claims that an escalation was sent. The staff header no longer reports unsupported online/unread status.
- New property fields no longer start with fictional listing values. The editor collects the selected type and explicit city/state, and reports that entered utilities are unverified.
- Property preview no longer asserts GPS, title, power, water, inspector, or inspection-date checks. An empty gallery shows an empty state instead of a generic property photo. The review action is labeled for its actual effect: setting publication state to review; it does not claim to create or send revision work.
- The parent-directory Turbopack root override was removed. Portability is determined by a clean dependency install and build inside the project worktree, not by the earlier symlinked-dependency failure.
- The mobile navigation button now changes its accessible name to “Close mobile navigation” while open.

## Verification evidence

| Check | Status | Evidence / limitation |
|---|---|---|
| Focused public-form unit tests | Pass | 12/12 focused tests pass for idempotency, receipt validation, and annual-rent parsing. |
| Public property status regression | Pass | Verifies missing API status does not become a verified/direct-instruction claim or an available inspection slot. |
| Full unit suite | Pass with skips | 198 passed; 16 skipped across 26 passing and 2 skipped files. Skipped live tests are not passes. |
| Application and test typechecks | Pass | `npm run typecheck` and `npm run typecheck:tests` completed after the final build. |
| Changed-path lint | Pass with warnings | ESLint found 0 errors and 26 warnings, primarily raw `<img>` warnings. |
| Production build and Turbopack root | Pass | Next.js 16.4.2 built from the worktree project root and generated 80/80 routes without the parent-directory root override. |
| Browser rendering and responsive behavior | Pass, scoped local check | Fresh local production server: 8 public routes at 320, 390, and 1280 CSS-pixel viewports (24 combinations), with headings present and no horizontal overflow or app-error indicator. A dynamic demo property detail showed the unconfirmed-fee warning and “Availability not listed”; landlord form defaults were blank, city was explicit, and no file input was present. Mobile navigation opened and updated its accessible name. No form was submitted. |
| Preview deployment | Not yet verified | Local fixes have not yet been pushed during this review pass. |
| Production behavior | Not tested | No production deployment or mutation was requested or performed. |

## Remaining risks and blockers

- Idempotency keys are retained only in the current page session. A browser reload starts a new key; cross-reload retry identity is not guaranteed.
- No authenticated browser test of the property editor or preview has been completed. Server-side authorization remains authoritative and is not inferred from the UI.
- No landlord/contact submission was made, so live receipt and idempotent retry behavior remain unverified beyond unit tests. The idempotency key remains page-session scoped; a browser reload starts a new key.
- Provider health, external verification (including GPS/title/power/water checks), notification delivery, and audit-log completeness require real operational evidence. This UI does not claim those checks occurred.
- `npm ci` previously reported five high-severity dependency advisories. No dependency manifest or lockfile change was made in this review; the advisory status should be triaged separately.

## Release state

PR #3 remains a draft and unmerged. The review worktree is isolated from Antigravity's worktree. No deploy, form submission, provider send, n8n change, or migration was performed. Browser rendering used the locally built app and existing local environment configuration; secret values were not printed.
