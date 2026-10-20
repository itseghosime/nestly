# Release completion ownership — 20 October 2026

Base: origin/main bc940c7b353ec58eb37ab478cbeb5577bc1b7b77. User requested two workstreams, one for ChatGPT and one for Antigravity. Preserve uncommitted work and merged PR #22/#23/#24.

## ChatGPT: staff operations and backend
Branch: feature/staff-operations-completion.
Owned paths: app/api/**, lib/backend/**, lib/lead-management.ts, supabase/**, app/staff/(dashboard)/settings/page.tsx, app/staff/(dashboard)/leads/page.tsx, backend tests and authoritative backend/build-log summaries.

### First implementation slice, prepared for review
- Connect lead queue status controls to existing staff-session PATCH endpoints. The customer-contact action records workflow status only; it never sends a message. Landlord acceptance does not publish a property.
- Align landlord GET/PATCH roles with the current linked SELECT/UPDATE policies: read Admin/Operations/Customer Care; update Admin/Operations. RLS still decides zone and row access. Contact Operations Lead can manage only property-linked accessible enquiries; a general enquiry remains read-only under current policy.
- Require the revision loaded by the staff member and compare again in the atomic UPDATE. Reject stale writes, block duplicate button submissions, and return an already-applied desired status without another write after an ambiguous network response.
- Add Nia response evidence: a one-way request fingerprint, n8n/fallback outcome, fixed fallback reason and elapsed duration. No queries, histories, generated replies, provider URLs, identities or secrets are logged. This is future observability; it does not reconstruct the earlier delayed exchange.
- Tests are added for role gates, invalid input, stale writes, read/write races, retries and diagnostic privacy. Execution is blocked in this ChatGPT session; no passing claim.

### Still assigned to ChatGPT, not completed by this slice
1. Workspace name/default inspection duration persistence and downstream scheduling behavior; existing fixed NGN/WAT defaults must not be presented as switchable currencies/timezones.
2. Sound preferences with browser-gesture permission; real escalation scheduling/routing and daily digest with appropriate delivery configuration. No email/provider send is authorized by this plan.
3. Coverage-zone administration and use by property/booking/role scoping. Do not change existing zone authorization while implementing a UI.
4. Landlord submission to a private staff draft, with explicit field mapping, deduplication, source linkage, normal verification and publish gates; acceptance alone must not publish.
5. Atomic audit events for lead/settings mutations, and lifecycle acceptance tests.
6. Public landlord photo uploads with private storage, limits, permissions and retention; staff editor uploads do not complete this flow.
7. Calendar pagination, inbox preview boundary and backend role tests.
8. Full Telegram search/preferences/fee/handoff/staff reply/Return to AI/follow-up test, only on new approved synthetic interactions. Physical receipt/read is not inferred from API acceptance.
9. Invitation/recovery callbacks and browser non-admin behavior when a safe existing session is available; emails remain paused.
10. Consolidate current release status without erasing historical evidence. Keep deferred backup codes/device inventory explicit.

### Read-only findings
- Linked schema inspected: workspace_settings currently has transit/daylight/retention and AI metadata, not workspace name, duration or dispatch preference columns. No schema change or migration was applied.
- Current lead tables permit contact new/in_review/responded/closed and landlord new/in_review/accepted/rejected.
- No non-internal trigger was registered on contact_enquiries, landlord_submissions or workspace_settings at inspection. Atomic mutation audit coverage remains work, not assumed present.
- Nia WF02 CFeb2L0Pd9uOQkVK is active; execution retention is none for both success and error and progress saving false. Search for 20 October executions returned zero. This does not prove no invocation occurred. No workflow altered.
- WF01 is still active in n8n. WhatsApp is deferred in the application, not asserted fully disconnected externally.

## Antigravity: presentation and browser validation
Branch: feature/release-ui-completion.
Own responsive layout, CSS, shared navigation/dialog interaction, accessibility and frontend presentation; do not edit the two ChatGPT-owned staff pages or backend contracts. Report their presentation findings for integration.

- All public/staff routes at 320/390/768/1280/1440px: gaps, clipping, overflow, table/calendar width and nonshrinking buttons/icons.
- Mobile/public/staff drawers and dialogs: focus containment/return, Escape/backdrop and scroll restoration.
- Buttons, links and honest loading/empty/error/retry states; no simulated success.
- Website Nia chat latest-message opening/scroll, 14px text, compact mobile composer and keyboard. Preserve routing/persistence/zoom and avoid unsolicited font increases.
- Accessible labels, focus, contrast and touch targets; validation without production form submissions.
- Existing-session non-admin navigation checks only. No accounts/role changes/emails.
- Product copy without implementation jargon or unsupported operational claims.
- Evidence: docs/UI_RELEASE_COMPLETION.md and docs/BUILD_LOG_UI_COMPLETION.md, with local/Preview/Production labels.
- Tests/typechecks/lint/build; draft PR only, no Production merge/deployment.

## Shared safeguards
No provider messages, replays, production form submissions, destructive data changes, account/role/password changes, screenshots, recordings, PDFs or hosting configuration changes. Preserve Telegram, n8n workflows, data, prices, fees, images, GSAP/gallery contracts, sidebar counts and select spacing. Verify each branch before integration; no blanket completion claim.
