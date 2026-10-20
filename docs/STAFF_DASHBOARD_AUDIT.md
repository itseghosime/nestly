# Staff dashboard audit — 20 October 2026

Status: corrections implemented; local and linked-database checks passed. Deployment/browser verification is recorded separately below when complete.

## Findings and changes

| Area | Confirmed issue | Correction / present boundary |
|---|---|---|
| Shared sidebar | Literal conversation badge 2 and notification badge 3 | Authenticated, RLS-scoped activity RPC. Conversations count human handoffs unassigned or assigned to the current staff member, explicitly labelled as attention rather than new messages. Notifications count unread alerts for the current staff profile. Zero and unavailable counts do not show invented badges. Refresh on navigation, focus, visible-tab activation, read-state changes and every 15 seconds while visible. |
| Notifications | Read state initially absent; Copilot PR #20 merged during audit | Preserve PR #20's notification_reads table and {id,isRead} API. Sidebar uses that same table. Dashboard alerts are saved workspace alerts, not proof of external delivery. Event summaries no longer imply every inspection alert is still pending. Re-selecting an active filter no longer leaves loading stuck. |
| Integrations | Static unavailable directory; Telegram absent; overview referenced unconfigured WF01/Meta | Read-only, authenticated Admin/Operations Lead endpoint: staff-session database query, Telegram getMe/getWebhookInfo, outbound flag state, Nia/n8n configuration. Only passing the specific bot/webhook check is labelled verified. Nia configuration is never labelled model health. No provider send, webhook update or AI invocation. WhatsApp remains deferred; external inbound webhook state is not inferred. |
| Customer directory/profile | Only fixture content or an unavailable panel; no connected source | Staff-session/RLS-scoped customer list with server search and pagination; profile links to visible conversations/inspections and lists visible contact/landlord submissions. No invented KYC status, budget or preferences. Up to 20 recent records per profile section, with total counts. |
| Property management | Status applied after pagination; search missed reference/city despite UI promise | Staff-only status filters run before database pagination/count. Reference/city/state search included. CSV explicitly covers displayed page. Existing media, fees, prices and lifecycle preserved. |
| Availability | Any reserved place labelled a slot Booked | Booked only when reserved count reaches capacity. Copilot PR #20's retry/idempotency fixes retained. |
| Navigation/modal UX | No focus containment or body scroll lock; signout ignored server failure | Mobile drawer and integration modal contain keyboard focus, restore focus and scroll; failed signout stays visible with retry feedback. Existing GSAP motion retained. |
| All native selects | Browser arrow too close to edge | Shared native-select CSS: 16px trailing inset, 44px text reserve, one arrow, unchanged fonts/heights, native keyboard/picker behavior, RTL and forced-color fallback. All 27 current select occurrences covered. |
| Private workflow memory | n8n_chat_histories had anonymous and ordinary authenticated table privileges | Revoke public/anon/authenticated table privileges. Preserve data, owner and service-role privileges. WF01 inspected read-only: memory uses a native Postgres credential. No workflow changed or executed. RLS behavior is intentionally unchanged; the linter's RLS flag is not claimed cleared. |

## Route coverage and remaining work

- Overview, inbox/list/detail, customer/list/detail, property/list/editor/preview, inspection/calendar/detail/availability, offers, notifications, team, settings, profile, audit log, integrations and permission-denied routes were reviewed in source. The signed-in Production UI was read for overview, inbox, customers, properties/editor, inspections/availability, offers, notifications, team, settings, profile, audit log and integrations before deployment.
- Working inbox ownership, notes, Telegram dispatch/recovery, Return to AI, inspection transitions, property fees/uploads and audit exports were preserved. Read-only review does not prove their full mutation lifecycle in this pass.
- Settings still explicitly lack workspace-name/currency changes, notification sound/digest/escalation controls and editable coverage zones. Do not silently enable these or report successful saves for them.
- Profile backup codes, individual device telemetry/revocation and administrator access-request submission are not completed by this audit.
- Calendar currently loads the first 100 booking records; inbox previews use a bounded 500-message query. Large-data pagination/preview work remains; current small-workspace counts were checked without claiming scale coverage.
- Customer enquiry/submission display is now connected; changing their operational status is not introduced.
- Only an existing Platform Admin session was available. No extra staff account, role promotion, invitation, recovery email or password change was created. Other-role browser flows remain unverified; existing RLS and API checks remain enforced.
- Telegram end-to-end sends, final inspection cancellation/readback, email callbacks and the release lifecycle remain separate pending checks. Do not replay messages or mark visits physically completed.

## Evidence by environment

**Local source harness:** complete current source copied from GitHub; isolated dependency install; 309 tests passed, 16 skipped; application/test TypeScript checks passed; focused ESLint has no errors (existing property img optimization warning); production build passed, generating 82 static page units. No local test result is described as a deployed result.

**Linked Supabase:** additive activity/read migrations applied; shared notification read count decrements once, duplicate reads are idempotent, cross-profile insert is denied, read markers are isolated, non-staff RPC returns no row and anonymous table/RPC access is denied. All read-state test changes rolled back. Private memory SELECT is denied for anon/authenticated while PostgreSQL owner/service read and insert privileges remain. No customer or message contents were retrieved.

**Concurrent work:** PR #20 read-state/retry work and PR #21 cancellation UI are retained. A short-lived empty audit read-state table was never exposed by a deployed app; reconciliation removed it only after an empty-table assertion. Canonical migrations 20261020190138, 20261020193000 (Copilot), 20261020193100 and 20261020193200 are ordered so a fresh replay creates the shared table before the activity RPC switches to it. Only the two audit-owned reconciliation/memory history versions were aligned to those canonical filenames; other history was untouched.

**Preservation:** no n8n edits, provider sends, webhook replays, account creation, recordings, screenshots, PDF, image replacement, rent/fee edits, customer deletion or hosting configuration changes.
