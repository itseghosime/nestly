# Nestly Backend Checklist — Current Status (2026-10-20)

> At the 2026-10-18 linked-migration verification checkpoint, the six reviewed Twilio migrations had been applied after an exact linked dry run and verified in linked history; no hosting configuration was changed at that checkpoint. Later environment-specific changes are recorded in the dated deltas below.

## 2026-10-18 delta — WhatsApp deferred from the active website release

- Public Nia contact actions now distinguish website chat from Telegram at `https://t.me/nestly_nia_bot`; phone fields no longer instruct customers to use WhatsApp. Website chat, visual layouts, motion, and existing routes are preserved.
- WhatsApp is not a current release requirement. Historical conversations keep the `whatsapp` channel identity, messages, audit records, and signed callback handling; no customer is converted or matched to Telegram by phone number.
- The app-side Twilio staff sender is controlled only by `TWILIO_OUTBOUND_ENABLED`. The flag does not disable Twilio inbound callbacks or WF01's synchronous TwiML responses. The user previously reported WF01 active at version `41d0a037-4706-4899-b18c-5756be24fb7b`; WF01/WF03 were not changed, and external webhook registration was not rechecked for this task.
- In Vercel Production, `TWILIO_OUTBOUND_ENABLED` is now `false`; redeployment of current `main` completed Ready. This gates only app-side Twilio REST staff replies and does not stop external WF01/TwiML or callbacks.
- See the current environment-specific verification and exact deployment revision in Build Log §66. WhatsApp remains deferred until a separate reactivation is approved.

## 2026-10-18 delta — Accurate staff takeover ownership labels

- The staff inbox now labels an unassigned `HUMAN_ACTIVE` handoff **“Assign to me”**. Once assigned, it shows **“Assigned to you”** for the current owner or the assigned staff member's name; another staff member sees **“Reassign to me”** through the existing authorized takeover action. AI-owned and closed states remain distinct, and the unassigned composer explains that ownership must be assigned before replying.
- No backend authorization, assignment, takeover, or Return to AI rules changed. The existing staff PATCH/RPC paths remain authoritative; the inbox labels and status presentation reflect the API's current `assignedStaffId` and `isAssignedToCurrentStaff`.
- Regression tests cover unassigned handoff, current owner, another owner, AI ownership, and closed state. Combined focused Telegram/search/ownership tests passed **48/48**; application and test typechecks, targeted ESLint, and production build passed (80/80 routes).
- **Production code revision:** `caa405569d1758ce73b4563eb49467af958ba42f` completed its Vercel Production deployment successfully. The UI was not exercised against a live handoff, and no Telegram or WhatsApp message was sent or replayed.
- **Audit overlap:** Draft PR #3 also changed this inbox detail page. Its ownership display was compared and reconciled with this fix in an isolated worktree by merging current `main` into the PR branch and preserving its other audit changes. PR #3 remains open and draft; the original `Nestly-production-audit` worktree was not edited. Its Vercel Preview was still deploying at this checkpoint.

## 2026-10-18 delta — Telegram property-search reply details

- Telegram search replies now render the grounded public search results as numbered listings with the public title, location, formatted rent, and a canonical property-page link. The handler uses the existing `public_properties` search response; the persisted dispatch content and `sendMessage` payload are the same, preserving idempotency and conversation context. Private fields are not passed to the formatter, and the final text is bounded to Telegram's 4096-character limit.
- Focused local tests passed **32/32**. Application and test typechecks, targeted ESLint, and production build passed (80/80 routes). These are local checks, not a hosted acceptance test.
- Production deployment for `aca4c882582d0327aa8b21e7e7a84468032c0d29` completed successfully. No inbound update was replayed and no provider message was sent by the operator. Actual delivery/rendering in Telegram remains pending a deliberate user test.
- The separate “Human Active” takeover wording follow-up remains open pending coordination with the owner of the active production-readiness audit worktree.

## 2026-10-18 delta — Telegram recovery and fresh-migration verification

- Webhook duplicates still in active `processing` now receive retryable HTTP 503 instead of a false HTTP 200 acknowledgement. Completed/ignored/human-owned updates and safely tracked dispatch outcomes remain acknowledged without resending. Redelivery after an expired pre-dispatch lease reclaims the update; route and fresh-database regressions assert one inbound row and at most one dispatch claim.
- Added a daily Vercel Cron at `/api/cron/telegram-dispatch-recovery`, protected by server-only `CRON_SECRET`. It invokes the service-only sweep; expired dispatches become `unknown`, never automatically resent. The Production deployment and secret are now configured; Vercel's manual Cron trigger returned HTTP 200.
- Assigned staff now have an audited explicit acknowledgement path for unknown Telegram Nia/staff sends. The original stays unknown; a separate new staff reply remains subject to the outbound flag/configuration. System handoff uncertainty is explained without blocking staff follow-up.
- Recreated a fresh, seed-disabled local Supabase stack and applied the full ordered 21-migration history, including the Telegram migration after all 20 predecessors. Local/remote history matched with no pending migrations. The database regression suite passed website anonymous handoff/staff reply compatibility, grants/RLS, identity and update isolation, takeover race, explicit review/audit/idempotency, overlapping recovery, expired-lease crash recovery, late provider acceptance, and no automatic resend.
- Applied `20261019120000_nestly_telegram_channel.sql` to the existing linked project after the sole-pending dry-run; all 21 migration versions now align. Read-only checks verified Telegram table RLS/grants, restricted RPC execution and safe search paths, preserved website/WhatsApp triggers, and unchanged existing conversation channels.
- PR #1 is merged to `main` at `f182464b8007832430be263ab0d7ddaddd7d247c`; the admin webhook setup action is deployed at `d0eb22a22da5d9f7c812f7219baacc7a34407b92`. Production has `TELEGRAM_BOT_TOKEN`, Secret variables `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET`, and `TELEGRAM_OUTBOUND_ENABLED=true` for the user-controlled live-test window. Secret values were not revealed or changed. Missing/wrong webhook headers returned 403; missing/wrong cron authorization returned 401; Vercel's authorized manual Cron invocation returned 200. The bot webhook is registered to the fixed endpoint and verified with `getWebhookInfo`. The first live exchange had two completed updates with Telegram API-accepted dispatches and persisted context; handset receipt is unverified. Follow-up samples exposed bedroom and conversational-filler parsing defects, now fixed at `f9cc070136e59d46cd0c21172a7c3f54e8ee811f` (Vercel Production Ready). PR #2 has not been merged. See [Telegram integration](./integrations/telegram.md) and Build Log §59.

## 2026-10-18 delta — Telegram implementation prepared locally (initial state)

- Added Telegram as an additional channel through `supabase/migrations/20261019120000_nestly_telegram_channel.sql`. At this initial implementation checkpoint it was local-only; its later linked application is recorded in the current delta above.
- Next.js handles secret-header-validated private-chat webhook ingress, durable bot/user/chat identity and update deduplication, persisted grounded Nia context/replies, handoff/audit, assigned-staff replies, and server-only `sendMessage`. Staff takeover is checked at AI dispatch; unsupported updates and duplicates cannot produce duplicate replies. Website/WhatsApp paths and WF01/WF03 are unchanged.
- `TELEGRAM_OUTBOUND_ENABLED` defaults off unless exactly `true`; Production is explicitly `false`. Telegram API acceptance is not delivery/read confirmation. Ambiguous sends stay `unknown` and are never automatically retried. Webhook registration is complete; controlled inbound verification in an approved chat remains pending.
- Local evidence and ordered cutover instructions are in [Telegram integration](./integrations/telegram.md) and Build Log §52. No external messages were sent and no hosting, linked schema, callbacks, or workflows were changed.

## 2026-10-18 delta — WF01 execution evidence and staff status accuracy

- The user reports live WF01 executions **81** and **86** produced normal AI replies, **84** performed handoff with notification/audit, and **85** suppressed AI in human mode. These are user-reported observations, not independently retrieved execution records.
- The user reports staff REST sends still fail with HTTP **400**, Twilio **21654**, “ContentSid Required.” The cause remains **unconfirmed**; no message was sent or retried in this pass. Signed delivery callbacks remain unverified.
- Staff identity and WhatsApp notices now use the authenticated profile and server-derived send-configuration, feature-flag, and callback-URL state. A configured callback URL is not represented as a verified callback. Queued WhatsApp messages are labeled accepted only when a provider MessageSid is present.

## 2026-10-18 delta — Twilio staff replies and linked migrations

- Staff-initiated WhatsApp replies now use the existing authorized conversation/message models, a transactional assigned-staff takeover claim, official Twilio SDK dispatch, and a separate signed delivery-status callback route. Website replies remain on their existing direct Next.js RPC path.
- Six additive migrations (`20261019101500`, `20261019103000`, `20261019104000`, `20261019105000`, `20261019110000`, `20261019111000`) and the synthetic SQL regression runner were applied/run against disposable container `supabase_db_nestly-supabase-isolated-xtlsfp`; the same six migrations were applied to the linked project on 2026-10-18. The runner passed takeover/claim concurrency, authorization, Nia suppression, callback ordering/SID association, evidence-based stale-send reconciliation, audit logging, and anonymous-isolation checks. Fixtures are synthetic and retained; no existing rows were deleted. The two invalid local migration-history labels were corrected after confirming they were absent remotely.
- The outbound API and callback tests mock Twilio. No external message, workflow change, hosting change, or live Twilio callback was made. `.env.local` contains no configured Twilio account/token/sender/status-callback variables.
- A staff operator path for stale `dispatching`/`unknown` attempts is implemented locally: after 15 minutes it fetches the exact Twilio MessageSid and applies only verified provider status, without auto-resending or marking delivery from operator input. The authenticated audit records are locally tested. Migration application is complete; public HTTPS reachability, server-side configuration, WF01/Sandbox changes, and approved-recipient tests remain pending. See Build Log §§37–40 and `docs/n8n-contracts.md`.

## Current verified state

- Post-apply read-only linked history check on 2026-10-18 shows all 20 migrations aligned through `20261019111000`. The six Twilio migrations were applied with `--skip-vault`; no seeds or roles were included.
- Current migration files include `20261016163412_nestly_core_schema_and_security.sql`, `20261016172514_add_explicit_property_price_and_fee_periods.sql`, `20261016222817_nestly_handoff_notifications_and_staff_resume.sql`, `20261017183000_nestly_wf03_safe_public_view.sql`, `20261017184500_nestly_staff_authority_compat.sql`, `20261017190000_nestly_live_schema_extensions.sql`, `20261017200934_nestly_staff_inbox_compat.sql`, `20261018120000_nestly_handoff_notification_permissions.sql`, `20261018123000_nestly_staff_alerts_and_audit_access.sql`, `20261018130000_nestly_website_conversation_context_and_replies.sql`, `20261018133000_nestly_public_rate_limit_dependency.sql`, `20261018140000_nestly_staff_workspace_operations.sql`, `20261018150000_nestly_staff_media_soft_delete_policy.sql`, plus Twilio migrations `20261019101500_nestly_twilio_staff_replies_and_status.sql`, `20261019103000_nestly_twilio_delivery_status_ordering_fix.sql`, `20261019104000_nestly_twilio_assignment_race_guard.sql`, `20261019105000_nestly_twilio_status_sid_association_guard.sql`, `20261019110000_nestly_twilio_status_event_privileges.sql`, and `20261019111000_nestly_twilio_operator_reconciliation.sql` (applied in disposable and linked Supabase).
- At the previous linked deployment, the media-policy dry-run showed only `20261018150000_nestly_staff_media_soft_delete_policy.sql` pending; it was applied with `supabase db push --linked --include-all --skip-vault`, and the then-current 13 versions were in sync. That is historical evidence only. In the current task the six Twilio migrations were applied with Vault, seed, and custom-role updates excluded; no workflow or callback change was made.
- The original six remote property rows and their related WF01 data were retained. One explicitly labeled synthetic media-QA property was added and archived after the test; it has two synthetic media rows, one soft-deleted and one active. The row is excluded from public results. Both `property-media` and `property-drafts` buckets remain private (`public=false`); four Storage object policies are installed. The original preflight found no duplicate customer emails or current 30-minute slot overlaps.
- The user supplied a fresh export at `docs/integrations/WF03.current-export.json`. It was sanitized into `docs/integrations/WF03.published.redacted.json`: workflow/version metadata, node IDs, connections, filters, and complete Code-node source were preserved; credential references and pinned data were removed. The export metadata marks the workflow active. There is still no n8n API/CLI to compare this version against the live instance independently.
- Verified the sanitized export's query targets `public_properties` with no `status` filter, its Code node checks publication/rental/verification states and projects 30 fields, and its output matches the linked view's 30 public columns. Executed that exact Code-node source against the linked view: empty filters **4**, a compound positive filter **1**, impossible location **0** with `matches: []` and the expected no-match message. The editor's baseline 4-match result is user-reported; filtered/no-match were validated against the current export locally, not executed in the n8n editor. Do not invoke WF01 or send customer/provider messages.
- No existing property rows were changed or deleted. Migrations backfilled canonical property lifecycle/fee fields and inbox compatibility columns from existing fields. The only new property row is the archived synthetic QA record described below; no fictional seed, reset, or workflow mutation was performed.
- At the earlier Phase A local-stack checkpoint, the then-existing six timestamped migrations were applied to the separate disposable stack with `supabase migration up --local`; `supabase db lint --local --fail-on warning` reported no schema errors. Fictional seed data was not applied. Subsequent migrations and the linked media-policy change are tracked separately above.
- Local isolated database/Auth suite: `npm run test:supabase:local -- /tmp/nestly-supabase-isolated-xtlsfp` — **12 passed, 1 expiry case skipped** with the standard one-hour local OTP setting; with the isolated setting temporarily reduced to five seconds, **13/13 passed**, including genuine expiry rejection. The Auth browser checks used generated local action links and synthetic accounts; no email was sent. Latest default suite: **41 passed, 13 skipped**; skipped live tests remain blocked and are not counted as passing.
- Twilio relay/integration local-only status: inbound relay, staff-initiated dispatch, signed status callbacks, and provider-evidence reconciliation passed mocked tests; disposable Supabase tests cover MessageSid arbitration, assigned-staff claims, status ordering, reconciliation, and audit rows. Export review found that WF01's current initial AI mode check is insufficient during AI generation and its inbound `logged` CTE does not gate duplicate messages. Exact manual fixes are documented but not applied. No callback was changed, no external send occurred, WF01/WF03 remain unchanged, and live Twilio/n8n has not been verified. See Build Log §§35–38 and `docs/n8n-contracts.md`.
- The public view and compatible schema migrations are applied remotely. The isolated local database suite recorded earlier passed 8/8 on its disposable stack; later linked migrations are separately validated in the linked project. Anonymous view access and private-column denial were verified remotely.
- Application and test TypeScript checks passed. The production build passed and generated 72 static pages plus dynamic routes. Full ESLint completed with **0 errors and 44 warnings** (image/unused-variable warning classes); no rules were disabled.
- Inbox authority root cause: `GET /api/staff/conversations` calls `requireStaff`, which reads `profiles.role`. The linked database originally lacked `public.profiles`; the Supabase response was `PGRST205` (“Could not find the table 'public.profiles' in the schema cache”). `20261017184500` supplied only the compatible profile table, trusted legacy role mapping, and authenticated self-read RLS, without client role/capability/zone writes.
- Inbox queue root cause and current verification are recorded in Build Log §16. The exact query failure was PostgreSQL `42703` because customer and conversation columns were absent. `20261017200934` isolated those columns; after reload the authenticated queue API returned 200. The user identity and queue remained available after the full migrations too. No account promotion or role change was made.
- The active profile has empty capabilities and no assigned zone; no user ID or email is recorded here. Anonymous REST access to `profiles` was denied (HTTP 401, `42501`). `caller_role()` remains absent pending the full feature migration; it was not the cause of this inbox route failure. The real browser session and reload are verified for the inbox read path. Invitation, recovery, callback exchange, sign-in/out, role restrictions, expired/reused links, and password setup are verified against isolated local Auth; linked-project email delivery and account mutation remain unverified.
- Latest sign-in troubleshooting: in the shared **local app + linked Supabase** browser, reload preserved the existing staff session; `GET /api/auth/me` returned HTTP 200 with a `Platform Admin` profile. Live-mode sign-in errors are now visible instead of appearing to bounce. The newly invited synthetic test account had not completed password setup; after explicit approval, one recovery request returned HTTP 200 from the linked app/API. Mailbox delivery and callback/password completion remain unverified. No existing password/account was changed. The recovery UI no longer shows a false demo-delivery preview; its accepted state and duplicate-submit guard passed a mocked browser check. Linked fresh-password and invitation callback completion remain unverified (R14 stays Implemented but unverified).
- Subsequent approved restart: only the synthetic Customer Care test Auth identity and its linked profile rows were deleted after confirming no referencing business records. The distinct Platform Admin session remained accessible after deletion (`/api/auth/me` 200; staff team 200). A fresh invitation attempt returned HTTP 400; a later authorized replacement-invitation attempt identified Supabase Auth email rate limiting as the cause. Read-only post-check found no replacement Auth identity/profile. Do not retry until the provider limit resets; WF01/WF03 and existing properties were untouched.
- The user later reported that they were able to log in. This is user-reported; the agent did not handle credentials or independently observe a fresh password attempt. The shared browser continues to show the existing authenticated profile; no admin password was changed and no recovery email was sent. Linked invitation/recovery callback and fresh-password verification remain distinct from that report.
- Profile & Security is now wired to real Auth/profile operations. In the **local app + linked Supabase** browser, the profile page loaded the signed-in profile without mutation. Only display name is editable; email, staff role, and assigned zone are read-only. Phone is marked unconfigured, sample device/IP rows are removed, and the only session action is the supported “sign out other sessions” control; it was not invoked. Password changes require current-password reauthentication and use Supabase Auth `updateUser`. Linked profile/password mutation and session revocation were not tested.
- **Current Auth state supersedes historical §26:** Read-only linked Auth inspection found the sole Platform Admin profile still linked to an Auth user whose email is now confirmed. The shared browser session remains authenticated; fresh password sign-in has not been tested because no password was handled.
- The previously approved replacement mailbox has no Auth identity. Its one authorized Platform Admin invitation attempt was rejected with `email rate limit exceeded` before profile provisioning. Do not delete the current Admin or retry email until the Auth provider limit resets; doing so would remove the only verified staff session without a usable replacement. No password, role, existing account, Auth setting, or live workflow was changed.
- The user confirms they are attempting to sign in with the existing Admin address. The sign-in API now logs a bounded, redacted Supabase error code/status/message in local development only; the client response remains generic to avoid account enumeration. Actual credential failure details remain pending the user's next sign-in attempt; do not request or record their password.
- Phase B inspection/offer pages and Phase C staff inbox/conversation work are API-backed. The public Nia widget uses deterministic search against `public_properties`; positive/no-match/clarification cases passed against the staged remote view. Durable website conversations, messages and context, changed preferences, “second one” references, grounded fee answers (unconfirmed fees are not quoted), browser reload, customer handoff, staff replies, and Return to AI were verified with isolated local data. Local database coverage includes property create/upload/fees/publish/public edit reflection, authorization/zone rules, offers, inspection capacity/expiry/approval, website conversation idempotency/isolation, handoff/return, queued AI suppression, notifications, audit visibility, and sign-out.
- **Inspection journey verified locally:** The public request and receipt, staff calendar/detail, approval, WAT reschedule, re-approval, cancellation/capacity release, and recorded synthetic completion outcome were exercised in the browser against the disposable local Supabase stack. Public receipts remained PII-free and showed no gate details before approval; completed receipts survived reload and explicitly did not imply a tenancy. The isolated suite's anonymous/ordinary/staff authorization, concurrent capacity, overlap, idempotency, expiry, and release checks passed. Full steps, failures, fixes, and test counts are in Build Log §28. This is not linked-project verification; the shared browser was authenticated during the public UI flow, with anonymous isolation verified separately by test clients.
- Staff operations now read live, permission-scoped data: `GET /api/staff/team`, `GET /api/staff/workspace`, and `GET /api/staff/dashboard` all returned 200 in the authenticated shared browser; team identity and dashboard data remained after reload. The dashboard uses RLS-scoped counts and real handoff/slot summaries; fake customer rows, fabricated health metrics, and fake offline-inspection success were removed. Unauthenticated requests to all three APIs returned 401. Workspace settings were read-only verified against linked values; no live setting was changed. The workspace PATCH and invitation email/token flow were not exercised against the linked project.
- Read-only `supabase config diff` confirms the linked project's Site URL is `http://localhost:3000` and its remote additional Redirect URLs contain the two exact callbacks: `http://localhost:3000/auth/callback?next=%2Fstaff%2Faccept-invitation` and `http://localhost:3000/auth/callback?next=%2Fstaff%2Freset-password`. The shared local app sets `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. No configuration push was run because the diff includes unrelated Auth, pooler, and Storage drift. After checking that the approved address had no existing Auth account, one authorized invite was accepted by Supabase (HTTP 201) for a synthetic `Customer Care` profile in `Benin City`; authorized `GET /api/staff/team` then returned 200 and showed the profile. No existing account was changed. The linked browser callback is pending the recipient opening the message, and actual inbox delivery is not independently verified. No other email was sent. `PUBLIC_RECEIPT_HMAC_SECRET`, `N8N_WEBHOOK_URL`, and `WHATSAPP_APP_SECRET` remain unconfigured; the database password is configured locally and was not recorded.
- `docs/integrations/WF01.redacted.json` and the current sanitized WF03 export were inspected; no workflow was modified. WF01's export is Twilio-named and has no declared authentication/raw-body setting, explicit Meta signature verification, Meta send node, or delivery callback. Its message inserts include `provider_message_id` with `ON CONFLICT`; Meta ID mapping/callback idempotency are unverified. WF03's current export targets the restricted view and returns only its public-field allowlist.
- WF03's elevated service-role access is **user-confirmed, not locally credential-verified**. The n8n Cloud trial has no public API access. The supplied export's active flag, structure, filters, and projection were verified; direct n8n API/version comparison and editor-side filtered/no-match executions remain unavailable. WF03 no longer blocks the applied property migrations. Other n8n blockers remain: actual Meta raw-body signature-validation boundary, inbound ID mapping, outbound dispatch/retry/idempotency, delivery callback, and WF01's inspection-subworkflow contract. User-reported staff REST sends still fail with HTTP 400/Twilio 21654 (“ContentSid Required”); the underlying cause is unconfirmed, and signed status callbacks remain unverified.
- **Media flow verified in the linked project:** the synthetic draft's two-photo upload, persisted reorder, anonymous draft/API/Storage/signing denial, authorized publication, anonymous listing/gallery visibility, soft-delete isolation, and authorized staff access to an archived record passed through the running app. The synthetic property remains archived, with one active and one soft-deleted media row. Full steps, observed failures, and migration rationale are in Build Log §21.
- Still outstanding or externally blocked: generative Nia and direct WF03 execution, staff outbound provider dispatch, Meta callbacks and delivery health, scheduled expiry/retention/pruning, notification read-state/delivery recovery, permission-request workflows, linked workspace writes, and Auth invitation/recovery callback exchange. Keep WF01/Meta verification blocked until the exact webhook/provider configuration is available; no external customer message was sent.

## Local repeatability

1. Start the disposable local Supabase stack for the selected test workspace.
2. Apply pending local migrations with `npm exec --yes --package supabase -- supabase migration up --local --workdir <workspace>`.
3. Run `npm run test:supabase:local -- <workspace>`. The runner rejects non-loopback URLs and passes local test keys directly to Vitest without printing them.
4. Run `npm exec --yes --package supabase -- supabase db lint --local --fail-on warning --workdir <workspace>`.
5. Do not use `supabase db reset`, apply fictional seed data to the linked project, or use service-role success as proof of RLS.
6. For a read-only linked schema review, load `.env.local` into the CLI child process through `@next/env` without printing `SUPABASE_DB_PASSWORD`, then run `supabase db dump --linked --schema public --file /tmp/nestly-linked-public-schema.sql` and repeat with `--schema storage`. Use `supabase db push --linked --dry-run --skip-vault` to enumerate pending migration files; do not omit `--dry-run` until the compatibility gate above is cleared.

## Historical implementation inventory

## MCP / connector availability (historical checkpoint)
- Supabase MCP remains **Unavailable**. Supabase CLI 2.121.0 is authenticated and linked; current migration/schema state is recorded above. `.env.local` Supabase values were checked for presence only, without printing values.
- Supabase app setup: `NEXT_PUBLIC_SITE_URL` and `PUBLIC_RECEIPT_HMAC_SECRET` are empty in `.env.local`. Auth callback flows and offer/inspection intake remain unavailable until configured. No secrets or values were written to this document.
- n8n MCP: **Unavailable** — no tool registered, no workflow JSON locally, `N8N_WEBHOOK_URL` empty. Existing WF01 was not changed.
- Determination via tool inventory + env + filesystem, not filesystem alone.

## Environment & clients
- [x] `.env.example` — names + explanations, no secrets; added `NEXT_PUBLIC_DEMO_MODE` (explicit only; never silent fallback — when unset, failures surface as recoverable errors, not stale fixtures)
- [x] `lib/supabase/client.ts` — createBrowserClient
- [x] `lib/supabase/server.ts` — createServerClient with getAll/setAll (Next 16 `proxy.ts`)
- [x] `lib/supabase/admin.ts` — service_role (server-only)
- [x] `lib/price.ts` — formatPrice/parseFormattedPrice + FeeRow/computeTotal/formatMoveInTotal (fixed, percent/rent, percent/subtotal, sort_order, rounding half-up to 2dp, null when required unconfirmed)
- [x] `proxy.ts` — Next 16 `proxy` convention (not legacy `middleware.ts`), Supabase SSR refresh, redirect unauthenticated `/staff/*` to `/staff/signin` (except signin/forgot/reset/accept/session-expired)

## Historical migration plan (not the current timestamped file inventory)
- `supabase/migrations/0001_profiles.sql` — profiles(id FK auth.users, role, capabilities[], assigned_zone), fixture_id_map; RLS least-privilege
- `supabase/migrations/0002_properties_core.sql` — properties (four states publication/rental/verification, rent_annual numeric(12,2)+currency, format_price derived), property_fees (kind/base/required/confirmed_at, sort_order), property_media (ordered, deleted_at soft-delete), verification_events; view public_properties (published+available+vetted|verified only); RLS anon vs staff
- `supabase/migrations/0003_neighborhoods_storage.sql` — neighborhoods (active), bucket `property-media` creation (originally public=true — corrected by 0006)
- `supabase/migrations/0004_security_hardening.sql` — trigger `prevent_privileged_self_edit()` (only Platform Admin/Operations Lead may change role/capabilities/assigned_zone, block self-promotion), helper `is_property_publicly_readable`, Storage policies narrowed to editor roles
- `supabase/migrations/0005_public_fees_media_gate.sql` — recreate `public_properties` with `security_invoker=true`, never expose `landlord_contact`; document fee/media gates
- `supabase/migrations/0006_storage_private_split.sql` — **correction:** forces both buckets `public=false` (actual bucket flag, not just policy name), creates private `property-drafts` (evidence never public), replaces storage SELECT with `property-media select if published` + `property-media staff read draft` (editor roles only), write policies narrowed to editor roles + mime 5MB; direct public URL no longer works — access via signed URL only
- `supabase/migrations/0007_role_hierarchy_no_recursive_rls.sql` — fixes recursive RLS via `caller_role()`/`is_platform_admin()`/`is_lead_or_admin()` security definer helpers; `profiles_insert_hierarchy` (Platform Admin only by Platform Admin, others only by lead/admin), trigger extended: Operations Lead cannot create/promote to Platform Admin, cannot self-promote, cannot grant `platform:%`/`*` caps, Platform Admin rows only modifiable by Platform Admin
- `supabase/migrations/0008_security_and_media_scope.sql` — prepared locally, not applied; resolves app role from trusted `profiles`, tightens definer grants and role/zone scope, separates publication/availability/verification, and gates media by database row/property/bucket/path/public state
- `supabase/migrations/0009_leads_offers_inspections.sql` — prepared locally, not applied or SQL/database-validated; adds persistent lead/customer/note data, human offer decisions, inspection slots/bookings, idempotent receipts, buffered overlap exclusions, capacity tracking, and rate limits
- `supabase/seed.sql` — 6 properties (prop-gra-01..prop-benin-06, published+available+vetted|verified), 4 neighborhoods, fees per property (caution fixed + legal/agency 10% rent + service fixed, all confirmed — marked fictional examples only), media rows, fixture_id_map

## Route handlers (all via supported Supabase Auth/SSR APIs, no direct auth.users writes)
- `app/api/auth/signin` POST (`signInWithPassword`), `signout` POST (`signOut`), `me` GET (`getUser` + profiles)
- `app/api/auth/recover` POST (`resetPasswordForEmail`), `reset` POST (`updateUser`), `accept-invitation` POST (`verifyOtp` + `updateUser` + `profiles.display_name`), `invite` POST (`admin.inviteUserByEmail` with hierarchy: Platform Admin only by Platform Admin, others only by lead/admin)
- `app/api/properties` GET (filter, sort, pagination page/limit, fees/media join, computedTotal via `computeTotal`) + POST (staff roles)
- `app/api/properties/[id]` GET (public gate, anon strips `landlord_contact`) + PATCH/DELETE (staff role check)
- `app/api/properties/[id]/media` GET/POST/PATCH + `app/api/properties/[id]/media/upload` POST (multipart, 5MB+mime, routes to `property-media` if published else `property-drafts`, writes `property_media` row) + `app/api/properties/[id]/media/signed-url` POST (`createSignedUrl(3600)`, draft requires auth)
- `app/api/properties/[id]/fees` GET/POST/PATCH
- `app/api/neighborhoods` GET + `app/api/neighborhoods/[slug]` GET

## Frontend wiring (preserve design/motion/gallery/WF01)
- [x] `lib/properties.ts`, `lib/neighborhoods.ts` — `ALLOW_FIXTURE_FALLBACK = NEXT_PUBLIC_DEMO_MODE==='true'`; when unset, throw instead of silently returning FIXTURES; callers show recoverable error banner with retry
- [x] `app/browse/page.tsx` — param-aware `fetchProperties`, `propertiesError` recoverable banner, pagination scaffold
- [x] `app/page.tsx` — `homePropertiesError` with retry
- [x] `app/property/[id]/page.tsx`, `app/neighborhoods/[slug]/page.tsx` — respect DEMO_MODE gate via lib (already wired)
- [x] `components/staff/PropertyEditor.tsx` — `handleSave` now `POST /api/properties` or `PATCH /api/properties/[id]` with `publication_state`/`rental_availability`/`verification_state` mapping, `saveError` + `saving` disabled, no silent `setTimeout` success; added media upload/reorder/delete panel (private bucket flow via `/media/upload`) and per-listing fee ledger panel (`computeTotal` null when required unconfirmed, seed fees marked fictional)
- [x] `app/staff/(dashboard)/properties/page.tsx` — `fetch('/api/properties?page=&limit=&keyword=')` with `page`/`pageSize`, `totalCount`, `listError` recoverable banner
- [x] `app/staff/(dashboard)/properties/[id]/edit/page.tsx` + `[id]/preview/page.tsx` — `fetchPropertyById` with `loadError`; preview `Approve & Publish` / `Request Revisions` now `PATCH publication_state` `published`/`review`
- [x] `app/staff/(auth)/forgot-password/page.tsx` → `POST /api/auth/recover`, `reset-password/page.tsx` → `POST /api/auth/reset`, `accept-invitation/page.tsx` → `POST /api/auth/accept-invitation` (verifyOtp), all with `formError`
- [x] `components/staff/StaffSidebar.tsx` — sign-out is `POST /api/auth/signout` + redirect

## Fees (fictional examples only)
- Seed fees are examples; `property_fees` comment documents this. `computeTotal` verified: 3,500,000+200k+10%+10%+300k=4,700,000; unconfirmed required→null; subtotal 7.5%→5,052,500; 33.333% rounding→133.33. Unit tests in `tests/api/phase-a.test.ts` pass.

## Remote schema inspection (historical checkpoint; current state above)
- The linked project's actual migration history is now inspected read-only. Three timestamped migrations match remote; three later local migrations are pending. Review the exact remote schema/policy/storage differences before any remote apply. Never create a replacement project, blindly push, seed remote data, or run `supabase db reset`.

## Tests (historical checkpoint; current results above)
- Latest current results are in **Current verified state**. Unit coverage includes fee totals, authorization rules, receipt token derivation, idempotency-key validation, and origin checks.
- `vitest.config.ts` loads only the `SUPABASE_TEST_*` prefix from test env files; app Supabase variables are not reused as test credentials.
- `npm run typecheck` and `npm run typecheck:tests` passed. `npm run build` passed (Next 16 production build, 61 static pages and the listed API routes).
- Targeted ESLint for changed app/test paths passed. Full `npm run lint` remains red on **26 errors / 49 warnings** in pre-existing unrelated files; no changed-path lint errors were reported.
- No live database test or migration application has passed. Use a disposable test project with separate `SUPABASE_TEST_*` values; never use service-role success as RLS evidence or point destructive fixtures at production.

## Build
- `npx tsc --noEmit` 0 errors, `npm run build` 48 routes + proxy, `vitest` 3/3 unit passed.

## Blockers (external setup)
- Existing remote schema/history must be inspected and reconciled before applying any migration. The remote `properties` endpoint is already populated; no seed has been run.
- Configure `NEXT_PUBLIC_SITE_URL` and a strong local `PUBLIC_RECEIPT_HMAC_SECRET` (generate locally, e.g. `openssl rand -hex 32`) before exercising same-origin Auth callbacks and offer/inspection receipts.
- Live DB authorization, storage flags, capacity contention, approval/expiry, and end-to-end flows remain **Blocked** until remote history is inspected and migrations are reconciled on a disposable test project.

## Phase B — Leads, offers, inspections (historical checkpoint; local workflow now database-tested)
- [x] Persistent contact enquiries and landlord submissions; public inserts do not return PII and associate a customer record via a scoped trigger.
- [x] Staff-only customer/lead queues and scoped staff notes; note access uses exact property/zone authorization.
- [x] Public offer intake with idempotency and opaque receipt token; staff queue and human-only approve/reject/counter decision.
- [x] Inspection availability and staff slot management; property/agent overlap exclusions include configurable transit buffers.
- [x] Booking request receipt is explicitly pending, reserves capacity for 15 minutes, and exposes gate details only after human approval; staff transitions support reschedule/cancel/outcome and retain events.
- [x] Same-origin checks on state-changing API routes, server-side hashed-IP rate limits on public intake/recovery/receipt calls, bounded request schemas.
- [ ] Apply/validate migration `0009` against a disposable Supabase project; test anon/customer/staff clients, concurrent capacity, idempotency, expiry release, and private-data redaction.
- [ ] Staff-facing offers/inspection UI, delivery notifications, audit/export surfaces, and scheduled maintenance are not implemented. `expire_pending_inspection_bookings()` is service-role-only; schedule it only after remote schema reconciliation.

## Phase C / D status (historical checkpoint; current status above)
- Existing WF01/Meta ingress was not available for inspection and was not changed. Durable conversations, outbox, takeover/return-to-AI, Nia grounding, provider callbacks, persistent notifications, integration health, audit export, retention redaction/pruning, and permission requests remain **Not implemented** or externally blocked; do not report them as complete.

## PR #3 production-readiness review evidence (2026-10-18)
- **Local tests:** 198 passed, 16 skipped (26 passing test files, 2 skipped files); skipped hosted/live tests remain blocked, not passed. Application and test TypeScript checks passed. Changed-path ESLint completed with 0 errors and 26 warnings. Next.js 16.4.2 production build generated 80/80 routes from the project root without a parent-directory Turbopack root override.
- **Local browser:** A fresh local production server rendered `/`, `/browse`, `/contact`, `/submit-property`, `/faq`, `/terms`, `/privacy`, and `/service-unavailable` at 320, 390, and 1280px with no observed horizontal overflow or app-error indicator. A dynamic demo property detail rendered the unconfirmed-fee warning and did not claim inspection availability. The landlord form showed blank required values, an explicit city field, no file input, and a photo-upload-unavailable disclosure. Mobile navigation opened and its accessible label reflected the open state. No forms were submitted.
- **Vercel Preview:** Deployment `49NjUxSuu3yR9RSxxJ3W9Jf6koTH` for head `8bed5e0c6695fdb6b33c9e4e86a89fc51defa4de` reached Ready. The same eight public routes and three viewports were checked read-only in Preview with no observed horizontal overflow or application-error indicator.
- **Not verified:** No authenticated staff browser flow, Production behavior, or public form receipt/retry was exercised. No production mutation, provider message, n8n action, or migration occurred. `npm ci` previously reported five high-severity dependency advisories; they were not changed or re-assessed here.

## PR #3 latest readiness status — 2026-10-19

- **Main integration:** PR #3 includes `origin/main` at `6e8be4b204a1b9806557afbdb133ef8dd3a28468` through merge commit `b63f03a98c046b1313378aadb0f31ee950175764`, including PR #6's gallery repair. Neighbourhood guide content, editorial assets, motion, Telegram, gallery behavior, prices, n8n/WF01/WF03, and unrelated worktrees were preserved.
- **Truthful staff data:** Customer fixtures, fake identity-verification claims, and local-only notes are confined to explicit demo mode and clearly labeled. With demo mode off, customer directory/detail report live data unavailable rather than showing sample records. Historical WhatsApp conversations remain readable in their original channel; replies remain unavailable. Property status requires independent publication and rental-availability fields; unknown states are not inferred from inspection status. Static inventory, inspection-capacity, and portfolio-value claims were removed. Staff property API queries do not inherit the public rent ceiling unless a rent filter is explicitly requested.
- **Retry idempotency:** Contact and landlord forms keep only a key and SHA-256 payload digest in `sessionStorage`, allowing unchanged retries after refresh to reuse the same key and changed payloads to receive a new one. Storage errors prevent submission and are surfaced. Receipt cleanup is visible if the browser cannot clear retry state. Unit tests cover recreated form state, changed payload, malformed storage, and storage failures. No live submission was made.
- **Local verification:** Vitest 212 passed, 16 skipped (30 passing files; 2 skipped files). Application and test typechecks passed; production build generated 80/80 routes. Full ESLint returned 0 errors and 36 warnings. The local Playwright production-browser check passed 24 public route/viewport combinations at 320/390/1280px with no detected horizontal overflow or app-error text; Telegram links, disabled landlord photo-upload state, blank form defaults, and mobile navigation were checked without submitting a form.
- **Environment limitations:** Local unauthenticated staff property/customer pages returned HTTP 500 because usable Supabase URL/key configuration is absent in this isolated worktree. No authenticated staff browser verification is claimed. Vercel reports the implementation Preview deployment Ready and Preview Comments passed, but direct public route requests redirect with HTTP 302 to Vercel deployment protection; Preview app behavior and authenticated staff flows remain blocked. Production behavior was not tested.
- **Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities. The full audit reports 5 high development-toolchain findings in the `braces` dependency chain (GHSA-vfj7-8cjw-p6xm). The forced fix downgrades `eslint-config-next` to 14.2.35 and is incompatible with Next 16; no dependency files were changed pending a compatible upstream fix.
- **Release boundary:** PR #3 remains open and draft. No production changes, database migrations, provider messages, webhook replays, customer writes, n8n/WF01/WF03 edits, recordings, screenshots, or PDFs were made.

## Nia conversational AI integration — 2026-10-19
- [x] Authenticated WF02/Gemini response path added and synthetic manual executions passed.
- [x] Telegram bridge, bounded same-conversation history, grounded fact preservation and safe fallback prepared; 65 focused local tests passed.
- [x] Detailed personality, truthfulness, privacy and action boundaries documented.
- [ ] Vercel revision build/merge/deployment verification (pending at preparation checkpoint).
- [ ] New deliberate Telegram inbound confirms deployed backend→n8n→Telegram path; no automatic replay/send.

- [x] Returning-user detection and greeting behavior added; 68 focused local tests passed; n8n synthetic returning visitor execution 91 passed. Final deployed roundtrip pending.

- [x] PR #7 merged; final Preview and Production deployment checks succeeded for a26177d.
- [x] Expanded source-only regression harness: 92/92 passed, including enabled n8n→single mocked Telegram send and return-visitor handling.
- [x] Retained legacy n8n chat trigger disabled; authenticated response endpoint rejects unauthenticated requests (403).
- [ ] Real Production backend→authenticated n8n→Telegram reply on a fresh deliberate user inbound remains pending; deployment success is not handset verification.

## PR #3 final review state after latest main — 2026-10-19

- **Integrated main:** `f463e4a075eac5d2af4c1c7094d58b4667d9cd90` merged as `9bbe4793d341a6270373c7dd02d2cb24f81d47b9`. The new main-side Nia/n8n/Gemini integration and compact composer updates are retained. WF01/WF03 and external n8n configuration were not changed in this review.
- **Nia context:** Unsupported conversational input clarifies that preferences are unchanged; it does not query listings or mutate context. Preference recall, context, social-reply, and n8n response regressions passed 64/64.
- **Local checks:** Full suite 256 passed, 16 skipped; application/test typechecks passed; ESLint 0 errors/36 warnings; Next.js build 80/80 routes. The local public-route matrix passed 24/24 combinations at 320/390/1280px. No active WhatsApp links were found on checked public pages; Telegram contact, blank landlord defaults, disabled photo upload, and mobile navigation were checked without submitting forms.
- **Blocked checks:** Authenticated staff routes returned HTTP 500 because the isolated worktree lacks usable Supabase URL/key configuration. The final Preview deployment reached Ready and Preview Comments passed, but public Preview routes redirected HTTP 302 to Vercel deployment protection. Thus authenticated staff and Preview UI behavior are not verified. Production remains untested.
- **Release status:** PR #3 remains draft and unmerged; its current merge state is `CLEAN`. The documentation-follow-up commit's Vercel deployment completed and Preview Comments passed, but the checked public Preview routes still redirect HTTP 302 to deployment protection. Production data, provider settings, migrations, Telegram/webhooks, n8n workflows, and customer records were not changed.

## 2026-10-19 — Nia website/n8n follow-up
- [x] PR #9: AI planner interprets Nigerian locations and preserves explicit solar/location requirements; no inventory yields a location-specific no-match.
- [x] PR #10: n8n uses the existing relay secret; Telegram ingress keeps its separate secret. No key values changed or exposed.
- [x] 96 focused source-only tests; scoped strict TypeScript; Vercel Preview/Production builds passed.
- [x] Production isolated website test: Enugu no-match, refusal, and contextual welcome-back all HTTP 200. Real n8n webhook executions observed, no Telegram sends.
- [x] Website chat messages and input visual 14px; mobile composer remains 36px and pinch zoom unrestricted.
- [ ] Physical iPhone Safari focus-zoom check; no physical-device verification claimed.
- [ ] Nationwide geography remains model-based; ask for state/city when ambiguous. No exhaustive location coverage claim.
See BUILD_LOG.md for the initial failed fallback test, relay correction, exact evidence and scope limits.

## 2026-10-20 — PR #3 continuation (historical pre-merge checkpoint)
- [x] Integrated the current `origin/main` into the isolated PR #3 worktree and preserved current website/Telegram Nia, n8n, gallery, pricing, motion, staff ownership, and compact composer behavior.
- [x] Corrected contact and landlord public POST routes to use the existing receipt-backed database RPCs. The migration grants function execution to anonymous/authenticated callers while revoking direct table inserts; the RPCs create the customer/lead and dashboard notification atomically. Corrected staff GET queries to read name/contact details from the linked customer relation. No schema migration or outbound email path was added.
- [x] Local full suite: 279 passed, 16 skipped; application/test typechecks passed; production build generated 80/80 routes; full ESLint 0 errors/34 warnings.
- [x] Local intercepted contact, landlord, and inspection submissions each retained their idempotency key after refresh across a mocked 503 → 202 retry. No database request/write occurred. Contact and landlord success states remain receipt-only; inspection remains pending until staff action.
- [x] Landlord form has no file input and explicitly discloses that photo upload is unavailable. Local public route matrix: 18 route/viewport combinations at 320/390/1280px, HTTP 200 and no detected horizontal overflow.
- [ ] Production contact/landlord records and staff visibility, inspection approval/reschedule/cancel/capacity, staff sign-in/out/role restrictions, permission-scoped actions, and audit records are not yet verified. The lead GET APIs are not wired to a staff page. No production form submissions or records were created in this continuation.
- [ ] The current notifications feed reports persisted delivery status only; per-user read/unread state and mark-read actions are not implemented or verified.
- [ ] Staff invitation and password-recovery delivery requires explicit approval before sending any email. No invitation/recovery email was sent.
- [ ] End-to-end Telegram flow requires safe identification of the existing approved synthetic test chat. No message was sent or replayed.
- [ ] PR #3 remains subject to the current preview checks and production deployment verification; a successful build/deployment alone does not close the hosted behavior checks.

See BUILD_LOG.md, “PR #3 release continuation — 2026-10-20,” for exact local evidence and limits.

## 2026-10-20 — Post-merge Production revision check

- [x] PR #3 merged normally as `4b0cd78bc9755c2c73ca5b44c264b08b6b3f645c`; merged source head `155d610e1ac9d1d058260ad1c29d679ffb2b448a`.
- [x] GitHub reports Vercel status `success` for the merge SHA (deployment identifier `8E81qn2B1QK91DYyR6yWNqr9j2zp`).
- [x] Source comparison found those claims were already present in the PR #3 merge commit and current main; their appearance on the public page did not prove a stale alias.
- [ ] Vercel's unauthenticated deployment page does not expose the deployment environment/domain assignment, so the exact Production deployment and domain mapping remain unconfirmed.
- [ ] Production form receipts/staff visibility, inspection lifecycle/capacity, staff auth/roles/permissions/audit, and notification read state remain unverified. The staff lead APIs are not yet wired to a staff page; per-user notification read/unread state is not implemented.
- [ ] Telegram end-to-end remains blocked until the existing approved synthetic test chat is safely identified. No new or replayed Telegram message was sent. No invitation or recovery email was sent.

See BUILD_LOG.md, “Post-merge production revision check — 2026-10-20,” for exact browser and HTTP evidence.

## 2026-10-20 — Follow-up Production sign-in check

- [x] PR #11 documentation update merged as `921f7efacbe0ec7e9d64aba165ee3fdff803bd47`; Vercel status reported success for that revision.
- [x] Read-only Production pages returned HTTP 200: sign-in, contact, and landlord submission. Contact showed two Telegram links and no WhatsApp links; landlord showed no file input and disclosed photo upload unavailability.
- [x] PR #12 merged as `6321aa4d1b1aae4e3d5a22c44b2b3e6fcbe8428f`; its Vercel status also reported success.
- [x] The sign-in page showed the same unsupported copy as the merged source; this is a content defect, not proof of a deployment mismatch.
- [ ] Exact Production environment/domain mapping remains unverified because Vercel deployment details require an authenticated dashboard session.
- [ ] No Production forms, staff actions, or database mutations were exercised. Staff access and the existing approved Telegram test chat remain unavailable for safe end-to-end verification.

See BUILD_LOG.md, “Follow-up Production alias check — 2026-10-20,” for the exact observations.

## 2026-10-20 — Staff sign-in truthfulness correction

- [x] Replaced unsupported inspection metrics and physical-vetting claims with neutral staff-access copy; preserved the sign-in layout, image, and motion.
- [x] PR #14 merged as `63df9193562dacf9c84e549a89cbbbb816e8a4c0`; Vercel reported deployment success and the public sign-in page showed the corrected copy without the unsupported claims.
- [ ] Vercel's authenticated deployment environment/domain assignment remains unavailable for independent inspection; no internal alias reassignment was made.
- [x] Compared the pre-fix Production page to both the PR #3 merge source and main commit `9a4897a`; the matching unsupported copy was in source, so no deployment mismatch was established.

## 2026-10-20 — Approved Telegram test preflight

- [x] User identified the approved private test conversation by the marker `NESTLY-TEST-OSI-20261020`; a read-only lookup matched one inbound row in a Telegram conversation with a linked identity.
- [x] Read-only Telegram webhook metadata confirms the configured production URL is the Nestly webhook and there are zero pending updates. No updates were consumed or replayed.
- [ ] Full synthetic conversation remains blocked: the local environment lacks the webhook ingress and n8n relay secrets. A Vercel dashboard session was available, but no safe variable-specific read was completed. No message was sent.

## 2026-10-20 — Production public-form verification

- [x] Contact form blank-submit validation returned visible errors without a network POST. One marked synthetic Production enquiry received a single HTTP 202 receipt; the UI correctly said receipt does not confirm assignment or response time.
- [x] Landlord form blank-submit validation returned a visible error without a network POST. One marked synthetic Production submission received a single HTTP 202 receipt; the UI correctly said it was not acceptance, vetting, or publication.
- [x] Landlord submission accepted an annual rent input of `1000000.50`. The exact stored database value and staff-facing visibility were not independently read back.
- [x] Production landlord form has no file input and explicitly says photo upload is unavailable; no photos were attached.
- [x] Focused local public-lead idempotency/receipt tests passed 19/19. The mocked local retry test is not evidence of Production retry behavior.
- [ ] Staff visibility, persisted decimal rent readback, inspection lifecycle/capacity, staff sign-in/out and roles, invitations/recovery, audit records, and permission-scoped actions remain unverified. An existing staff session was confirmed, but these workflows have not been exercised. The authorized synthetic inspection property/slot is available; the property-detail API failure below blocks booking.
- [ ] Telegram end-to-end remains blocked pending authenticated Production configuration access. No webhook secret or relay secret was revealed or requested; no message was sent or replayed.
- Production records use the marker `NESTLY-RELEASE-20261020` and are intentionally left in place; no destructive cleanup was performed. No invitation/recovery email or real-property edit occurred.

See BUILD_LOG.md, “Production public-form verification — 2026-10-20,” for exact Production and local evidence.

## 2026-10-20 — Historical pre-deployment inspection blockers

- **Production inspection detail:** The authorized synthetic property's `GET /api/properties/{id}` returned HTTP 500 with an empty body and no content type. The public listing response established that `rent_annual` is null; a local regression test reproduced the resulting `formatPrice(null)` TypeError. A local fix and regression coverage now pass, but the Production route has not yet been redeployed or rechecked. Do not book until the deployed detail route succeeds and the existing slot is rechecked for capacity.
- **Production availability:** The existing synthetic slot is active with capacity one and had zero reservations at the last read-only check. This does not verify booking, receipt, staff approval, rescheduling, cancellation, or notification behavior.
- **Staff/Vercel access:** An existing staff session and read-only staff API access were confirmed. A Vercel dashboard session was also available, but the Production `TWILIO_OUTBOUND_ENABLED` value was not safely read; do not infer its value.
- **Telegram:** The approved private test chat is identified, but no new message or reply was sent. The local environment lacks the Telegram ingress and n8n relay secret values; neither value was requested or displayed.
- During the earlier log-access investigation, no fixture, slot, booking, account, or customer record was changed; the later local route fix is recorded below. No migration, workflow change, invitation, or recovery email occurred.

See BUILD_LOG.md, “Production inspection detail API failure,” for the exact endpoint and evidence limits.

The local null-rent fix and its validation are recorded in BUILD_LOG.md, “Property detail null-rent root cause and local fix.”

## 2026-10-20 — Post-deployment synthetic inspection verification

This status supersedes the pre-deployment blocker above; its historical evidence is retained.

- [x] PR #18 merged as `e23a5dfe24baab73e7d1ed0fc33f07f5ff15c89a`; Vercel reported the Production deployment successful at `2026-10-20T18:00:12Z`.
- [x] Production property detail returned HTTP 200 JSON for the authorized synthetic property with nullable rent, absent media/fees, and optional fields. The page rendered safely; no move-in total was invented for unconfirmed fees.
- [x] One synthetic inspection request returned HTTP 202 as pending; the initial receipt showed the hold rather than claiming confirmation. Staff visibility and one authorized Platform Admin approval were verified; the public receipt then showed staff confirmation for the expected appointment.
- [x] The Production staff audit page showed the matching redacted `inspection.status_changed` record for the synthetic booking, attributed to the Platform Admin.
- [x] Read-only staff slot verification returned capacity 1, reserved count 1, active status, and no assigned field agent. Two linked notification rows persisted on the dashboard channel (`inspection.pending` and `inspection.confirmed`); queued dashboard status does not imply external delivery.
- [ ] Notification read/unread state is unavailable in the current notifications API/UI; no read-state behavior was verified.
- [ ] Invitation and password-recovery email workflows require explicit approval before sending. No email was sent.
- [ ] Sign-out/re-authentication, non-admin role restrictions, callback routing, additional permission-scoped staff actions, and duplicate-click/network-failure retry behavior remain unverified. No other synthetic accounts or bookings were created.
- [ ] Reschedule/cancel was not attempted because the sole capacity-one slot is occupied and no replacement exists. The synthetic appointment was not marked physically completed.
- [ ] Telegram end-to-end and Production `TWILIO_OUTBOUND_ENABLED` remain unverified; no Telegram message or workflow change occurred.

See BUILD_LOG.md, “Production property-detail fix and synthetic inspection,” for the exact Production functional evidence, limits, and safety boundaries.

## 2026-10-20 delta — Release follow-up checks

This dated status supersedes the stale “unverified” items above only where explicitly marked complete. See BUILD_LOG.md, “Release follow-up: staff notifications, inspection slots, and retries,” for evidence and boundaries.

- [x] **Production staff API visibility:** Exactly one existing contact enquiry and one landlord submission matched `NESTLY-RELEASE-20261020`; the landlord record's stored annual rent was `1000000.5`. This does not claim a staff lead queue page is wired.
- [x] **Production WhatsApp outbound control:** The read-only staff conversation response returned `whatsappOutboundEnabled: false` and `canSendWhatsApp: false`. No outbound message was sent, and no secret was inspected or exposed.
- [x] **Production notification read-state:** The current Platform Admin's read/unread state for the synthetic inspection notification was changed and restored; both states survived a browser reload. The migration is applied and the Production UI/API returned HTTP 200.
- [x] **Local retry regression coverage:** Concurrent duplicate clicks and ambiguous network-failure retries passed in isolated tests for contact and landlord submissions; no Production form was repeated.
- [x] **Inspection replacement slot and reschedule:** Created slot `93ce848f-24ca-4b14-801f-f313c19913e6` on the clearly synthetic QA property for 21 October, 11:30–13:00 WAT, capacity 1, unassigned, 30-minute transit buffer. The existing booking was rescheduled once and is now pending at that slot with gate details cleared.
- [ ] **Inspection cancellation:** Production UI did not expose cancellation after rescheduling changed the booking to pending. The backend transition supports cancellation; a focused staff UI fix is pending deployment. Do not mark the physical visit completed.
- [ ] **Telegram lifecycle:** Blocked pending a fresh actual inbound message in the previously approved test chat. Do not replay old updates, fabricate webhook events, or change n8n workflows.
- [ ] **Production access lifecycle:** Sign-out/re-authentication and non-admin role restrictions remain unverified without an existing safe second account/session. Invitation and recovery emails remain paused and unsent.
- [ ] **Release:** PR #20 merged as `e4c19dd69c82551a4ee98e221441e86980308158` and the notification/availability UI is being served in Production; its Vercel merge-commit check was pending at last read. The additive migration is applied and recorded. The cancellation UI fix and final lifecycle readback remain pending.

## 2026-10-20 delta — Inspection lifecycle complete; lead queue UI pending

This dated status supersedes the immediately preceding pending inspection items.

- [x] **Notification read/unread persistence:** Production read and unread states for the synthetic inspection notification both survived reload; the original unread state was restored.
- [x] **Synthetic inspection lifecycle:** Existing booking `3c2e7c64-6438-448d-b22f-878f3fc0b05e` was rescheduled to the unassigned 11:30–13:00 WAT QA slot and cancelled through the deployed staff UI. It is `CANCELLED`; no physical completion or customer/gatehouse message occurred.
- [x] **Slot capacity and audit:** Original and replacement synthetic slots each show zero reservations after cancellation; redacted audit log shows the approval, reschedule, and cancellation transitions.
- [x] **Landlord photo behavior:** Production form clearly states that photo upload is unavailable and no photos are attached; no submission was made during this check.
- [ ] **Staff lead queue UI:** Production staff GET APIs exposed the existing synthetic contact and landlord records and exact rent `1000000.5`. A read-only staff page and navigation link are implemented locally but await PR review/deployment; no fixture data is used.
- [x] **Retry behavior:** Isolated full-suite tests cover duplicate clicks and ambiguous same-key network retries for contact and landlord submissions; no Production form was resubmitted.
- [x] **WhatsApp outbound control:** Read-only Production response reported outbound disabled and staff sending unavailable. No message or secret was touched.
- [ ] **Telegram end-to-end:** Awaiting a fresh search request from the previously approved test chat. Do not replay updates or alter n8n workflows.
- [ ] **Staff authentication roles:** Sign-out/re-authentication and non-admin restrictions remain unverified without a safe existing non-admin session. Invitation and recovery emails remain paused and unsent.
- [ ] **Release:** PR #21 merged as `3eca78cc98a7721ea377837a2633fb8dcfb92782`; Vercel reported deployment success. The new lead queue page remains local pending PR review.
