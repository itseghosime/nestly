# Staff operations acceptance — 21 October 2026

## Release decision

PR #25 is merged at fd9881fdaa2483fd1bd919d1041e6c2e6d25452e after explicit user approval and successful application of the reviewed migration. Supabase recorded version 20261021113608; repository filename matches. Production deployment/read-only acceptance is recorded below. Preview points to Production: keep it read-only. A successful build does not verify the complete mutation journey.

## Pre-application linked database inspection (read-only)

The existing Nestly project `jluraewjdvsmsisfskld` reports 25 applied migration versions. The repository has 26. Every predecessor of `20261021055142_staff_workspace_operating_defaults.sql` is present in the linked history; the new migration is missing. The older report of four applied versions referred to different local tracking and is not the linked project's history.

The linked `workspace_settings` lacks the new workspace-name and duration columns and the new settings RPC. This accounts for the observed settings GET 503. No reset, seed, migration or business-record mutation was performed against the linked project during this pass.

## Implemented correction

Workspace GET and successful PATCH responses now include `canManage` and private/no-store caching. Operations Leads and Field Vetting Agents can read the allowed settings but cannot edit or save them in the page. Platform Admins retain the existing save operation. API authorization remains authoritative. Two API regressions cover read-only roles.

## Reproduce local checks

```sh
npm ci
npm test
npm run typecheck
npm run typecheck:tests
npm run lint
npm run build
npm run test:staff:db
npx playwright install chromium
npm run test:staff:browser
```

When Chromium is supplied by the environment, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. The browser harness starts Next.js on loopback port 3029 and its synthetic transport on loopback port 54329. Neither port should already be in use.

### Isolated PostgreSQL acceptance

`@electric-sql/pglite` 0.5.10 runs actual PostgreSQL in memory. The fixture applies all 26 repository migrations to a fresh database with minimal Auth functions and Storage metadata tables. It uses synthetic UUIDs and records only; no external service requests are made.

**26 acceptance checks passed**, covering settings and atomic audit, retry no-ops, invalid settings, anonymous/non-admin denials, lead revision conflicts, zone restrictions, private media receipt reservations and confirmation, private draft conversion with decimal rent, conversion retry deduplication, anonymous evidence isolation, audited coverage changes and authorized latest-message previews.

These are database-engine checks, not a complete Supabase environment. Auth HTTP, JWT signature verification, Storage object bytes, signed URLs, upload/download HTTP, realtime, connection-pool concurrency and production performance are not established by these checks. Storage tests cover metadata and policies only. The single in-memory connection does not prove concurrent race behavior.

### Local browser acceptance

The actual Next.js handlers and page run against the in-memory SQL through a minimal synthetic Auth/PostgREST transport. The browser uses synthetic admin/field sessions; provider dispatch is disabled. External browser HTTPS requests are blocked.

Checks cover admin save and reload, an audit written by the SQL function, coverage toggle persistence, sound preference persistence and AudioContext activation, 390px/1440px overflow, and field-role read-only UI plus API 403. AudioContext activation is not a claim of audible hardware playback or notification delivery. These checks are Local only; they do not verify hosted Auth or Production roles.

### Application checks

- Full suite: 366 passed, 16 skipped live tests.
- Application and test TypeScript checks: passed.
- Full lint: zero errors, 33 existing warnings.
- Local production build: passed, 85/85 generated pages.
- Reviewed code revision: `dfa346b29b60ce3b77b7efb3af82ddc7d42d0cb9`. Exact Preview build status is tracked on PR #25; no hosted mutation acceptance is implied.

## WF03 dependency cutover

Before any private-column migration, inspected the published workflow and the saved draft. The old published version `59e27f7e-dd11-48fc-b274-e60cbd2f096d` queried the raw `properties` table. The saved version `bf64542e-b215-417e-9878-0f6150915bf4` queries the existing `public_properties` view and maps an explicit 30-field public projection.

The view already exists in the linked project and excludes private contact/source columns. Synthetic checks of the saved Code node passed positive, empty-result, private-field exclusion and unpublished-state cases. Published that exact saved version of WF03 (`rj6M7r9YLI0jZudK`) and confirmed the active version. Credentials, node identities, connections, search inputs and `{count,matches,message}` response shape were preserved. No workflow execution or provider message was initiated. WF01 and WF02 were unchanged.

Rollback before any private schema change is the previous published version above. After private columns exist, **do not restore the raw-table query**; fix forward while retaining the public projection. This is structural and synthetic-code verification, not a live search execution result.

## Historical migration approval gate (resolved below)

Exact prepared file: `supabase/migrations/20261021055142_staff_workspace_operating_defaults.sql` (798 lines). It adds workspace/default fields and source links, a private submission-media metadata table, indexes, guarded mutation/read RPCs, coverage enforcement and the public inspection-slot projection. It changes privileges/policies and trigger/function behavior. It does not reset the database or delete customer records.

Automatic approval review rejected applying this migration because the broad finalize request does not override the earlier prohibition on Production migrations. No migration was applied and no alternative SQL path was used. Obtain approval for this exact migration before proceeding. Preserve the old schema/data; do not use db reset or blindly push the entire migration directory.

After approval: recheck migration history and predecessor compatibility, apply the single migration transactionally, confirm functions/columns and advisor changes read-only, then merge the exact reviewed PR revision and verify the Production deployment. If application checks fail, revert the application deployment; do not drop new columns/tables or delete evidence as an automatic rollback. Database-backed mutations require an isolated hosted environment or separately approved synthetic Production test scope.

## Remaining honest release limits

- Full hosted Supabase Auth/Storage integration and non-admin session acceptance remain pending.
- The complete Telegram search → handoff → staff reply → Return to AI sequence, and evidence attributing each answer to n8n versus fallback, remain pending. No messages were sent or replayed.
- Invitation/recovery email testing remains paused.
- Escalation and digest controls intentionally stay unavailable until a real scheduler/delivery path exists. This work does not implement those deferred services.
- No screenshots, recordings, PDF, customer-data deletion or hosting configuration change was made.

## 2026-10-21 — Approved Production migration applied

The user explicitly approved applying the reviewed staff migration. Rechecked PR #25 head 84546adb78b24de84e35a8216ee378b922496372 and exact SQL contents against GitHub; all 25 predecessors were present. Applied only that migration through Supabase. The tool recorded version **20261021113608_staff_workspace_operating_defaults**, so the repository filename is aligned to that recorded version (formerly prepared as 20261021055142). SQL contents are unchanged. Do not apply the old version a second time.

Production read-only acceptance: workspace_name/default_inspection_duration_mins now exist; seven guarded RPCs exist with fixed search paths; anonymous EXECUTE denied on those RPCs; media reservation/confirmation remain service-role-only. landlord_submission_media has RLS and no SELECT grant for anonymous or authenticated clients. public_properties remains 30 columns with zero tested private columns. Base property count remains 34; public projection remains 26. No reset, seed, message replay, email, or synthetic Production mutation was performed. This establishes schema/privilege acceptance, not the complete hosted mutation journey.

Security advisors still report two SECURITY DEFINER public views, role-executable definer functions, service-only RLS/no-policy tables and disabled leaked-password protection. Public views/receipt/role guards require their documented access checks; no blanket clean-security claim is made. Full hosted non-admin/Auth/Storage acceptance and Telegram lifecycle/source-delay evidence remain pending. Merge/deployment status follows in the release PR. Earlier blocker entries above are historical; the exact migration approval and application blocker is now resolved.

## 2026-10-21 — PR #25 merged and Production read-only acceptance

- PR #25 merged at **fd9881fdaa2483fd1bd919d1041e6c2e6d25452e**, after exact head 3c89a75941eb51cde8529189705bcfd7e9df71d6 passed Vercel Preview. The application code tested locally remains dfa346b29b60ce3b77b7efb3af82ddc7d42d0cb9; subsequent changes only align migration history and document evidence.
- Vercel Production deployment **dpl_FWZB1es23m15qtQnQz7CtWyTJ8GB** reached READY for that merge revision with nestly-sigma.vercel.app assigned. This is the deployed application revision, distinct from this later documentation update.
- **Production/browser, read-only:** Existing Platform Admin session reloaded the settings page. The actual saved name and inspection defaults loaded; Save became enabled; all four linked coverage areas appeared. Earlier unavailable-settings/503 UI no longer appeared. Calendar and conversation inbox each finished loading without error alerts or loading/unavailable messages. No customer records or message contents were copied into this log. No Save, coverage mutation, notification toggle or record action was submitted.
- **Production/public HTTP smoke:** homepage, properties GET and neighborhoods GET each returned 200; unauthenticated workspace GET returned 401. These are read/access checks, not creation/upload/handoff acceptance.
- **Local after filename reconciliation:** all 26 migrations applied and 26/26 database acceptance checks passed again. Earlier application results remain 366 passed, 16 live skipped, typechecks/lint/build passed. No application changes since those checks.
- **Remaining release limitations:** full hosted non-admin/Auth/Storage byte-upload/mutation acceptance and deliberate Telegram search → handoff → staff reply → Return to AI journey remain pending. No provider messages/replays or emails were sent; email tests remain paused. Escalation/digest services remain intentionally deferred. Existing security advisor findings remain documented. No screenshots, recordings or PDF were created.
