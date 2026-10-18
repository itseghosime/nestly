# n8n Integration Contracts

## Current provider decision (2026-10-18)

Twilio is the current WhatsApp provider while Meta verification is pending. Direct Meta integration is deferred and is not a prerequisite for continuing WF01. This is the user's provider decision; it does not independently verify the live n8n workflow or Twilio configuration.

## User-reported live execution and delivery evidence (2026-10-18)

- The user reports WF01 execution **81** and **86** produced normal AI replies, execution **84** performed handoff with notification/audit, and execution **85** suppressed AI while in human mode. These records were not independently fetched or inspected in this session.
- The user reports staff REST sends continue to fail with HTTP **400**, Twilio error **21654**, “ContentSid Required.” The cause is **unconfirmed** and no send was retried.
- Signed delivery-status callbacks remain unverified. A queued workflow/TwiML message is not evidence that Twilio accepted a REST send; the staff UI reports acceptance only when a provider MessageSid is associated with the message.

## WF01 export inspection

Source: the user-supplied redacted export at `docs/integrations/WF01.redacted.json`. This documents the export only; it does not verify the live workflow or credentials. The export was inspected without recording webhook paths, message bodies, or credential values. WF01 was not modified.

The export identifies `NESTLY — WF01 — Twilio WhatsApp Inbound` and marks it active. Its graph contains:

- A POST Webhook using response-node handling. It reads Twilio-style form fields from `body` (`From`, `WaId`, `ProfileName`, `Body`, and `MessageSid`). The export does not show request-signature validation or Webhook authentication; infrastructure-level access controls were not available to inspect.
- Supabase customer and conversation lookups/creation, Postgres inbound/reply persistence, and Postgres chat memory.
- A Gemini-backed AI Agent connected to WF03 property-search and inspection-request workflows.
- Human-handoff state handling and `Respond to Webhook` nodes that return XML/TwiML. The AI, handoff, human-mode, and fallback branches return TwiML; the AI and handoff XML contain `<Message>` elements, so these are synchronous outbound replies through Twilio's response-to-inbound mechanism, not a separate Twilio REST API send operation.

The export does not show a `X-Twilio-Signature` check, malformed-request gate, Twilio REST API send node, separate delivery-status callback route/handler, or callback-driven status updates. It also does not establish the exact live webhook URL, actual inbound payload/header sample, or any upstream proxy validation. The Webhook path and all configuration values are intentionally omitted here. Export metadata is not proof of the live workflow's current activation.

## Deferred Meta contract and observed gaps

The earlier target contract was that WF01 become the Meta WhatsApp ingress and delivery-callback processor; it would verify `X-Hub-Signature-256` over the raw request body, keep subscription verification separate, dispatch outbound messages through Meta, persist delivery callbacks to Supabase, and be called by Next.js only through authenticated server-side requests. This is deferred future work, not the current Twilio plan and not a prerequisite.

The supplied WF01 export does not implement that deferred Meta target in these concrete ways:

- Its name identifies a Twilio inbound workflow. Its POST Webhook has no exported authentication setting and no raw-body option. No explicit Meta signature-verification node appears in its graph. External proxy/gateway authentication was not available to inspect.
- The graph has no Meta Cloud API send node or Meta delivery-status callback handler. The TwiML replies documented above are the current Twilio response path, not Meta dispatch.
- Postgres message inserts include `provider_message_id` and `ON CONFLICT`, so there is evidence of database-level deduplication at those insert points. The export does not establish that the value is a Meta event ID, nor does it show callback idempotency or delivery-state transitions.
- No Next.js WhatsApp webhook route exists in this workspace. No second ingress was added.

The supplied WF03 export was sanitized and saved as `docs/integrations/WF03.redacted.json`. Before local preparation, its three-node graph accepted a `search_filters` object, used Supabase `getAll` against `properties` with `returnAll` and legacy `status = available`, then filtered by `verified_at`, location, bedrooms, maximum price, and property type. It returned raw matching rows and a count/message. No `{{...}}` expressions were present; existing JavaScript node references were preserved. Pinned/runtime data and credential identifiers were removed; the sanitized copy had no remaining phone/email/auth-token pattern matches.

The sanitized file is a **local-only prepared candidate**, not a copy to import over the live workflow: its Supabase node targets `public_properties` and canonical published/available fields, and its JavaScript output projects an explicit allowlist of the view's public fields. It retains the three nodes, two connections, input contract, search filters, and `count`/`matches`/`message` response envelope. Each `matches` entry is intentionally narrowed to the explicit public-field allowlist. Synthetic fixtures verified eligible-property filtering, existing search filters, no-match output, and exclusion of `landlord_contact` and an internal-evidence marker. It does not return property fee rows; fee answers must remain unavailable until a separate safe fee-data contract is added.

The user confirmed that WF03 uses an elevated Supabase Secret API key with service-role access. The key itself was not available through a local n8n CLI/MCP credential store or environment variable, and no JWT claim was decoded by this session. No key or credential identifier is recorded. Because service-role bypasses RLS, the previously captured live-source query against `properties` must be treated as able to read private columns; RLS alone cannot secure its output.

The current export's 30-field projection exactly matches the canonical `public_properties` view, including the existing search fields. The staged compatibility view (`20261017183000_nestly_wf03_safe_public_view.sql`) was applied before the canonical property migration. After the canonical view migration, anonymous REST returned four eligible rows and all 30 public columns; selecting `landlord_contact` was rejected, and no private/internal fields appeared. The exact Code-node source from the current export passed baseline, positive-filter, and no-match checks against that linked view. These checks verify the export and public view, not live n8n execution.

## WF03 published cutover verification (2026-10-17)

- The user supplied a current export at `docs/integrations/WF03.current-export.json`. Its sanitized review copy is `docs/integrations/WF03.published.redacted.json`; workflow/version metadata, node IDs, connections, filters, and complete Code-node source are retained, while credential references and pinned/runtime data are removed. The original export remains unmodified and must not be committed.
- The export metadata marks the workflow active and includes a version ID. Its node/connection identity matches the earlier workflow, the Supabase node queries `public_properties` without the obsolete `status` filter, and the Code node checks publication/rental/verification eligibility and projects exactly 30 public fields. No n8n API/CLI is available to independently compare this export with the live instance.
- The user reports that the empty-filter editor test returned four matches. The exact Code-node source from the sanitized current export was also executed against the linked anonymous `public_properties` view: empty filters returned **4**, a positive compound filter returned **1**, and an impossible location returned **0** with `matches: []` and `No matching verified properties found.` The result envelope is `count`, `matches`, `message`, and each match has exactly the view's 30 public columns. Filtered/no-match results were executed locally, not through the n8n editor.
- Before applying the full schema changes, a linked dry run listed only `20261017190000`, `20261018120000`, and `20261018123000`. Those migrations are now applied, without seeding, resetting, or modifying workflows; all repository migrations are in sync. The public view remains the query boundary and exposes no landlord contact data.
- Do not import the sanitized export, duplicate WF03, or change its live credentials, identity, node IDs, or connections. Do not invoke WF01 or send customer/provider messages during tests. If editor-side filtered/no-match tests are run later, report only counts and key names.

## Current Twilio safety gates and implementation sequence

### n8n Cloud credential limitation

Official n8n documentation states that Code nodes cannot access n8n's credential manager; on n8n Cloud, `crypto` is available but external npm packages are not. The built-in Twilio credential is documented for the Twilio and Twilio Trigger nodes, while the Twilio Trigger docs list SMS/call events and do not document request-signature validation. The supplied WF01 export also contains no Twilio credential reference. Therefore a Code node using `crypto` cannot securely read the existing n8n Twilio Auth Token, and passing that token through a field/credential expression or hardcoding it is not an acceptable solution. The Webhook node's `Only Run If` option is not a signature gate: official docs say expression failures log a warning and let the request through.

### Smallest compatible alternative — existing Next.js app as validation proxy

The local implementation exists in `app/api/twilio/whatsapp/inbound/route.ts` and uses the official Twilio Node helper library. It has **not been deployed or live-verified**. This adds no hosting: it uses the existing Nestly app and requires storing the Twilio Auth Token in that deployment's secret manager as a second protected copy because n8n Cloud does not expose its credential value to workflow code. If the token may not be copied to the app's secret manager, there is no deployable in-flow validator under the current n8n Cloud constraints; a purpose-built credential-aware custom node or a different supported hosting/runtime would be required.

1. Before cutover, add these secret/config entries to the existing deployment environment (never source control): `TWILIO_AUTH_TOKEN` (entered securely from Twilio), `TWILIO_PUBLIC_WEBHOOK_URL` (the exact complete URL registered in Twilio, including any query string), `NESTLY_WF01_WEBHOOK_URL` (the existing WF01 production webhook URL), and `NESTLY_WF01_RELAY_SECRET` (a newly generated random secret shared only with the new n8n Header Auth credential). The workspace `.env.local` has no relay configuration; no production hostname is inferred here.
2. In the existing WF01 `Webhook` node, retain its node ID, path, POST method, `responseMode: responseNode`, and the existing graph edge to `Find Customer`. Change only Authentication from `None` to `Header Auth`, selecting a **new** credential with header name `X-Nestly-Relay-Secret` and value equal to `NESTLY_WF01_RELAY_SECRET`. Do not change any current Supabase, Postgres, or other credentials. This rejects direct requests that bypass the validating proxy before workflow execution.
3. Set Twilio's inbound-message callback URL to the deployed route's exact URL, with HTTPS. Use the same exact string for `TWILIO_PUBLIC_WEBHOOK_URL`. The route checks the `X-Twilio-Signature` against the full configured URL and *all* received form fields; it does not trust request Host/forwarding headers. Invalid/missing signatures return HTTP 403 without calling n8n. Valid form requests are forwarded unchanged to the existing authenticated WF01 URL; the route returns n8n's original HTTP status, body, and `Content-Type`, preserving the existing valid-request TwiML.

The route accepts HTTPS callback configuration only, uses the SDK to validate the configured public URL and parsed form fields, checks `MessageSid`/`From`/`WaId`, forwards the raw form body with a separate relay header, refuses redirects, and relays the upstream status/body/content type. It fails closed and logs generic errors only; inspect the source for exact behavior rather than copying a second code listing into this contract.

The route intentionally does not log request bodies, phone numbers, signature headers, URLs, or secrets. In a real cutover, deploy and test the proxy first; then, in a coordinated window, add Header Auth to WF01 and point Twilio at the proxy. The order creates a short tradeoff: protecting the old public n8n URL first can temporarily reject Twilio; changing Twilio first leaves the old direct n8n URL temporarily bypassable. Do not claim the ingress is protected until both settings are in place.

### Synthetic, no-send verification

Use a fake test token, a synthetic callback URL, a fixture request body, and a mocked `fetch`/WF01 response. Do not use Twilio's live credential, a real recipient, the production webhook URL, the production workflow, or live database credentials.

**Executed locally:** `npm test -- tests/api/twilio-relay.test.ts` passed **8/8** route tests. These tests use synthetic credentials/data and mocked `fetch`; no provider or n8n request is made. Application and test typechecks and focused ESLint also passed. This verifies local route behavior only, not deployment, public HTTPS reachability, live Twilio signatures, or WF01 Header Auth.

| Case | Expected result |
|---|---|
| Missing `X-Twilio-Signature` | HTTP 403; mocked `fetch` called zero times |
| Wrong signature or changed form field | HTTP 403; mocked `fetch` called zero times |
| Valid synthetic signature and required fields | One mock relay call; exact raw form body and relay header forwarded |
| Mock WF01 response containing existing TwiML | Proxy returns the same status, response body, and `Content-Type` |
| Valid signature but missing required payload fields, or non-form content | HTTP 400 / 415; mocked `fetch` called zero times |
| Missing proxy configuration | HTTP 503; mocked `fetch` called zero times |
| Upstream relay failure | HTTP 502 with generic logging only |
| n8n URL called without `X-Nestly-Relay-Secret` | Header Auth rejects before workflow execution/DB access |

### MessageSid deduplication (local database arbitration verified; WF01 change still pending)

The core schema has a unique constraint on `messages.provider_message_id`. Preserve it as the concurrency arbiter; never fall back to `$execution.id` when `MessageSid` is missing. In the existing `Persist Inbound Message` Postgres node, keep the existing Postgres credential and `queryBatching: single`, replace the `query` with:

```sql
WITH inserted AS (
  INSERT INTO public.messages (
    conversation_id, provider_message_id, direction, sender_type,
    content, message_type, delivery_status
  )
  VALUES (
    (($1::jsonb)->'conversation'->>'id')::uuid,
    ($1::jsonb)->>'provider_message_id',
    'inbound',
    'customer',
    ($1::jsonb)->>'content',
    'text',
    'received'
  )
  ON CONFLICT (provider_message_id) DO NOTHING
  RETURNING id
)
SELECT
  c.*,
  EXISTS (SELECT 1 FROM inserted) AS is_new_inbound
FROM jsonb_populate_record(
  NULL::public.conversations,
  ($1::jsonb)->'conversation'
) AS c;
```

Replace that same node's `options.queryReplacement` value with this n8n expression; do not include the former `$execution.id` fallback:

```text
={{ [JSON.stringify({conversation:$json,provider_message_id:$('Webhook').first().json.body.MessageSid,content:$('Webhook').first().json.body.Body || '[Non-text WhatsApp message]'})] }}
```

This uses only the Twilio `MessageSid`, which the incoming relay validates before forwarding. A missing SID must not be replaced with an execution-specific value.

Add an IF node named `First Message Delivery?` immediately after the success output of `Persist Inbound Message`, with a Boolean condition using `{{$json.is_new_inbound}}` **is true**. Wire the existing `Persist Inbound Message` success output 0 to this IF node. Wire IF output 0 (true) to the existing `AI Allowed?`. Wire IF output 1 (false) to a new `Respond Duplicate` Respond to Webhook node. Set that node to respond with text, HTTP 200, header `Content-Type: text/xml`, body `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`. Keep `Persist Inbound Message` error output 1 connected to the existing `Fallback Response`; leave the upstream customer/conversation lookup and creation edges unchanged.

The empty TwiML acknowledges a valid duplicate without invoking AI or producing a second automatic reply. PostgreSQL's unique constraint makes simultaneous inserts for the same SID serialize: exactly one execution gets `is_new_inbound=true`; concurrent losers get false after the unique conflict resolves. Test the node output, IF branches, and exact TwiML first in an inactive test workflow against a disposable database with synthetic SIDs. Do not invoke the active production WF01 or send customer messages as part of the test.

**Expected result:** For a previously unseen synthetic SID, one customer-authored inbound row is inserted, `is_new_inbound` is true, and only that execution reaches the unchanged `AI Allowed?` branch and existing response behavior. A repeat or simultaneous retry for the same SID inserts no second row, returns `is_new_inbound=false`, bypasses AI, and receives the empty 200 TwiML. One stored inbound row and at most one AI execution are the acceptance conditions; this does not guarantee recovery if the winning execution crashes after insertion.

**Rollback:** Restore the original `Persist Inbound Message` query and `options.queryReplacement` from the pre-edit workflow revision, delete `First Message Delivery?` and `Respond Duplicate`, and reconnect success output 0 directly to the existing `AI Allowed?`; retain error output 1 to `Fallback Response`. Do not drop the database uniqueness constraint or delete message rows. Rollback restores the previous behavior, including the known duplicate-AI risk.

**Local database result:** `SUPABASE_TEST_DB_CONTAINER=supabase_db_nestly-supabase-isolated-xtlsfp npm run test:twilio-dedup:local` passed against the disposable local Nestly Supabase stack. It confirmed one first sequential claim, rejected its duplicate, and exactly one winner among eight concurrently launched inserts sharing one synthetic SID; there was one stored row per SID, and the runner cleaned only its generated customer/conversation/message rows. This validates the database uniqueness arbiter, not the n8n node output, AI branch, TwiML response, or live workflow.

**WF01 remains pending:** Once relay cutover is approved and validated, apply the SQL/node wiring above in the existing workflow (or a non-production test copy) and test that only one execution reaches AI and duplicates receive empty TwiML. Never test against production WF01 or send outbound messages. This is an at-most-once claim: if the winning execution crashes after inserting but before replying, retries are suppressed and no automatic reply is regenerated. Recovery would need an explicit durable processing/outbox state machine; no exactly-once reply guarantee is claimed.

Keep website conversations on the direct Next.js session/RPC/context/reply/handoff path. Keep WF01 as the WhatsApp engine. Preserve WF01 identity and existing credentials except for the new Header Auth credential needed to prevent bypass; preserve WF03 identity, credentials, and public projection. Direct Meta work remains deferred.

No live instance execution was independently inspected for the export findings above; execution evidence is user-reported in the section above. No provider request or external message was made in this preparation. The sanitized export, local source/tests, and disposable-database test remain the implementation evidence, not independent live-instance verification. Keep the existing Twilio callback path active until the app has public HTTPS reachability, the secrets are configured, WF01 Header Auth is coordinated, and a controlled no-send/cutover validation is complete.

## Telegram channel boundary and recovery (2026-10-18)

Telegram is implemented directly in Next.js and does not use, replace, or modify WF01 or WF03. The Next.js webhook validates Telegram's secret header, persists channel-scoped identities/updates/messages, invokes grounded Nia and the existing handoff model, and owns staff replies and server-side `sendMessage` dispatch. Do not route Telegram messages through the WhatsApp workflow or synthesize website sessions, phone numbers, or customer matches. The migration retains the existing `nestly.website_handoff_conversation` transaction-local check and adds a distinct Telegram setting; the website handoff RPC and staff reply were exercised against the disposable database. The live WF01 instance was not independently queried in this pass.

Telegram API acceptance is not delivery/read evidence. Unknown sends are never automatically retried. A daily Vercel Cron invokes the protected service-only expiry sweep; after a crash the row can remain `dispatching` until the next scheduled run, then becomes `unknown`. The cron requires a configured server-only `CRON_SECRET` and does not enable outbound sends. The assigned operator must explicitly acknowledge an unknown Nia/staff send before a separate follow-up reply; the original remains unknown and the action is audited. A late provider acceptance after the 10-second client timeout may refine the state only when provider response evidence arrives; it cannot prove delivery/read. The fresh disposable database test applied the complete 21-migration history and exercised overlapping recovery, crash recovery, takeover races, late acceptance, review authorization/audit, and website handoff compatibility. See [the Telegram integration and future cutover sequence](./integrations/telegram.md). The migration remains local-only; schedule activation, webhook registration, linked-schema application, deployment, and approved-recipient tests are pending. No Telegram message was sent and neither n8n workflow was changed in this pass.

## Twilio Sandbox staff replies and signed delivery callbacks (2026-10-19)

### Implemented local path

Staff replies continue through `POST /api/staff/conversations/:id/messages`. Website conversations still use the existing `send_website_staff_reply` RPC and never call Twilio. WhatsApp conversations use an authenticated staff claim RPC that locks the conversation row and requires a manager-capable staff role, `channel = whatsapp`, `mode = HUMAN_ACTIVE`, and `assigned_staff_id = auth.uid()`. The backend persists one `agent`/`outbound` message using the caller's idempotency key before making a Twilio request; the UI exposes the composer only to the assigned staff member after takeover.

The outbound Twilio request carries `statusCallback` to `POST /api/twilio/whatsapp/status?message_id=<message-uuid>`. That callback is a direct Twilio-to-Next.js request, not a new n8n ingress or workflow. It validates `X-Twilio-Signature` against the exact configured public HTTPS URL and all parsed form fields, checks the configured Twilio `AccountSid`, and delegates the message/SID/status association to the service-only RPC. Only numeric Twilio error codes are stored; request bodies, message text, tokens, phone numbers, and signatures are not logged.

The six migrations `20261019101500`, `20261019103000`, `20261019104000`, `20261019105000`, `20261019110000`, and `20261019111000` add durable dispatch state, callback-event deduplication, monotonic delivery-status merging, pending-send ownership protection, SID-to-message association protection, event-table privilege revocation, and operator reconciliation/audit functions. The first callback-ordering test exposed that a late `read` status did not advance an already `delivered` message; migration `20261019103000` corrects that while preventing later non-read or contradictory terminal statuses from regressing state. The prior local-only state is historical; all six were subsequently applied to linked Supabase on 2026-10-18 as documented in Build Log §40.

### Manual WF01/WF03 action

No new n8n workflow, ingress, credential, reply node, or status-callback node is required for this staff-initiated outbound path. Do not edit WF01 or WF03 for this local implementation.

The supplied export has an initial `AI Allowed?` check after `Persist Inbound Message`, with `{{$json.mode}}` **is equal to** `AI_ACTIVE`. That check alone does not suppress an AI reply if staff takes over while the AI Agent is processing. The ordered cutover checklist below adds a fresh mode check after the AI Agent and immediately before the TwiML response. The export also shows that `Persist Inbound Message` uses `ON CONFLICT (provider_message_id) DO NOTHING` but does not use its `logged` CTE result; duplicate inbound requests still emit a conversation row and can reach AI. The cutover checklist adds a new-vs-duplicate branch that returns empty TwiML for retries. These are export findings only; the live WF01 graph is unverified and unchanged.

WF03 remains untouched. Its public projection is not involved in staff message delivery.

### Required server configuration and limits

Configure values in the Vercel project's **Settings → Environment Variables** and scope them to **Production** only to start. Save credentials as Secret values where Vercel offers Config/Secret types, then redeploy before relying on them. Sources:

| Vercel variable | Obtain its value from |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Console → Account Info for the same account/subaccount that owns the Sandbox. Use the Account SID, not an API Key SID. |
| `TWILIO_AUTH_TOKEN` | The Auth Token in that account's Twilio Console Account Info. The Twilio SDK's `validateRequest` requires the account Auth Token; an API Key secret is not a substitute. Treat it as server-only. |
| `TWILIO_WHATSAPP_FROM` | Twilio legacy Console → **Try WhatsApp / Sandbox settings** → the Sandbox sender number, formatted as `whatsapp:+<number>`. |
| `TWILIO_PUBLIC_WEBHOOK_URL` | `https://nestly-sigma.vercel.app/api/twilio/whatsapp/inbound` (user-supplied). It must exactly match the callback string Twilio signs. |
| `TWILIO_STATUS_CALLBACK_URL` | `https://nestly-sigma.vercel.app/api/twilio/whatsapp/status` (user-supplied). The app uses this as the per-message callback base and appends one `message_id` query parameter; do not change the Sandbox callback field as part of this setup. |
| `NESTLY_WF01_WEBHOOK_URL` | The existing active WF01 Webhook node's **Production URL** in n8n. Do not replace/regenerate the workflow or change its URL. Keep the value server-only. |
| `NESTLY_WF01_RELAY_SECRET` | Generate 32 random bytes locally, then store the same value in this Vercel variable and a new n8n **Header Auth** credential whose header name is `X-Nestly-Relay-Secret`. Never place it in a node expression, export, chat, or Git. |

On macOS, one way to generate the relay secret without printing it to the terminal is `openssl rand -base64 32 | tr -d '\n' | pbcopy`; paste it directly into the two secret-entry forms, then clear the clipboard. Add the n8n credential and set the WF01 Webhook to Header Auth only during an approved coordinated cutover; neither change is made here.

`TWILIO_OUTBOUND_ENABLED` is a fail-closed feature gate for **staff-initiated Next.js sends**. Leave it absent or explicitly set it to `false`; code requires the exact string `true`, and the UI/API both deny sends otherwise. Do not enable it until an approved-recipient test is authorized. This flag does **not** suppress existing WF01 TwiML replies: the currently configured Sandbox callback is unchanged and may continue its existing behavior. Avoid sending messages to the Sandbox while WF01 remains active unless an external reply is intended.

`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also required for durable finalization and callback persistence; obtain them from the linked Supabase project's API settings. `.env.example` contains names/placeholders only. No Vercel environment setting or Twilio Console callback was changed in this task.

The code rejects localhost, private IPv4/IPv6 literals, non-HTTPS callback URLs, unexpected callback paths, and callback URLs with pre-existing query parameters. Syntax validation does not prove public reachability; a public HTTPS endpoint is still a deployment prerequisite. No hosting change, callback cutover, real Twilio request, external message, or live WF01/WF03 check occurred.

The same idempotency key, including concurrent retries, cannot dispatch twice. A definitive Twilio 4xx rejection other than HTTP 408 is stored as `failed`; a timeout, network error, HTTP 408/5xx, invalid provider response, or failed persistence is treated as `unknown`/pending and is never auto-retried. Stale `dispatching`/`unknown` replies are reconcilable only by authorized staff after 15 minutes: the server fetches the exact MessageSid with the Twilio SDK and requires matching account, outbound direction, sender, recipient, exact body, and provider creation time within the bounded claim window. The current Twilio status is then applied through a service-only atomic RPC and an audit row is written. If a SID is not stored, staff must obtain the exact SID from Twilio Console. A missing search result is not proof of non-delivery; mismatches and provider lookup failures leave the message unresolved and must not permit a resend. This does not provide automatic expiry, retries, or exactly-once delivery.

### Local no-send verification

Run the mocked route/signature tests and type checks:

```sh
npm test -- tests/api/twilio-staff-replies.test.ts tests/api/twilio-relay.test.ts tests/api/twilio-status-signature.test.ts
npm run typecheck
npm run typecheck:tests
```

Against the disposable local stack only, after applying the six additive Twilio migrations:

```sh
SUPABASE_TEST_DB_CONTAINER=supabase_db_nestly-supabase-isolated-xtlsfp npm run test:twilio-staff:local
```

The SQL runner creates randomly named synthetic customer/conversation/message/status rows and intentionally retains them for inspection; it performs no deletes and makes no network request. It exercises assigned-staff authorization, two concurrent takeovers, same-key concurrent claim serialization, Nia suppression during human takeover, unresolved-send/ownership blocking, provider rejection, unknown-outcome callback recovery, duplicate/out-of-order callbacks, MessageSid association, evidence-based stale reconciliation, audit insertion, service-only RPC privileges, and anonymous isolation. The mocked route test verifies lookup matching, stale-window enforcement, audit of failed attempts, and no resend. These checks do not prove deployed credentials, public HTTPS reachability, live Twilio signing, linked migration history, or live workflow behavior.

### Ordered cutover checklist — migration step completed; remaining steps not executed

Do the remaining steps in order, with a named change owner and rollback window. The six reviewed database migrations were applied to linked Supabase on 2026-10-18. WF01, WF03, Twilio callbacks, and hosting remain unchanged.

1. **Linked migrations — completed 2026-10-18.** Repeated `npx --yes supabase@2.121.0 migration list --linked` and `db push --linked --dry-run`; the exact pending set was the six Twilio files listed above, with no seeds or roles. Applied using `npx --yes supabase@2.121.0 db push --linked --yes --skip-vault`. Post-apply history shows all 20 local/remote versions aligned through `20261019111000`. Read-only checks confirmed service-only dispatch/status/reconciliation RPCs, no direct status-event table grants, website chat/staff RLS access, and the anonymous 30-column `public_properties` projection. See Build Log §40 for exact results. Do not reapply.
2. **Configure required app variables (credentials server-only).** Set `TWILIO_AUTH_TOKEN`, `TWILIO_PUBLIC_WEBHOOK_URL`, `NESTLY_WF01_WEBHOOK_URL`, `NESTLY_WF01_RELAY_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_WHATSAPP_FROM`, `TWILIO_STATUS_CALLBACK_URL`, `TWILIO_OUTBOUND_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Initially leave `TWILIO_OUTBOUND_ENABLED` absent or `false`; the staff REST API requires the exact string `true`. The service-role key and all Twilio/n8n relay credentials are server-only; never use a `NEXT_PUBLIC_` prefix for them. `TWILIO_PUBLIC_WEBHOOK_URL` must exactly match the public inbound relay URL; `TWILIO_STATUS_CALLBACK_URL` is the per-message status callback base URL. Keep secrets out of workflow JSON, logs, and client bundles.
3. **Deploy public HTTPS first.** Deploy the app routes `/api/twilio/whatsapp/inbound` and `/api/twilio/whatsapp/status` on the approved public HTTPS host. Verify reachability and signature canonical URLs without sending a message. Localhost is not Twilio-reachable. Do not switch the Sandbox callback until this succeeds.
4. **Update the existing WF01 only, after relay deployment.**
   - On the existing `Webhook` node in `NESTLY — WF01 — Twilio WhatsApp Inbound`, set **Authentication** to **Header Auth** and select a new n8n Header Auth credential whose header name is `X-Nestly-Relay-Secret` and whose secret matches `NESTLY_WF01_RELAY_SECRET`. Keep the node name/path and response-node mode. Do not add a second Webhook, Code node, ingress, or credential containing the Twilio Auth Token.
   - Replace the query in existing `Persist Inbound Message` with this parameter-compatible form; keep its current `queryReplacement`:

     ```sql
     WITH logged AS (
       INSERT INTO public.messages (
         conversation_id, provider_message_id, direction, sender_type,
         content, message_type, delivery_status
       )
       VALUES (
         (($1::jsonb)->'conversation'->>'id')::uuid,
         ($1::jsonb)->>'provider_message_id',
         'inbound', 'customer', ($1::jsonb)->>'content', 'text', 'received'
       )
       ON CONFLICT (provider_message_id) DO NOTHING
       RETURNING id
     )
     SELECT c.*, EXISTS (SELECT 1 FROM logged) AS inbound_is_new
     FROM jsonb_populate_record(
       NULL::public.conversations,
       ($1::jsonb)->'conversation'
     ) AS c;
     ```

     Add an `Inbound Message New?` IF node with `={{ $json.inbound_is_new }}` **is true**: true goes to existing `AI Allowed?`; false goes to a `Respond Duplicate` node returning HTTP 200, `Content-Type: text/xml`, and `<Response></Response>`. This consumes Twilio retries without invoking AI, memory, or a second reply.
   - Keep the existing `AI Allowed?` check as the early gate. Add a Postgres `AI Reply Still Allowed?` check after `AI Agent`, query `SELECT EXISTS (SELECT 1 FROM public.conversations WHERE id = $1::uuid AND mode = 'AI_ACTIVE') AS ai_reply_allowed`, and set its `queryReplacement` to `={{ [ $('AI Allowed?').first().json.id ] }}`. Add an IF node with `={{ $json.ai_reply_allowed }}` **is true**: true goes to existing `Respond to Webhook`; false goes to existing `Human Mode Response` (empty TwiML). In `Respond to Webhook`, read AI text explicitly from `$('AI Agent').first().json.output`, not the Postgres result. In `Record Nia Reply`, likewise read content from `$('AI Agent').first().json.output`; keep its existing idempotent provider-message key. Do not route the false branch to `Record Nia Reply` or back to AI.
   - This final fresh DB check suppresses replies when takeover commits during AI generation. Because synchronous TwiML is delivered by Twilio after the workflow returns, a takeover can still race after the final check and before Twilio processes that response; eliminating that separate network window would require an approved asynchronous outbound-dispatch design, not another initial mode check.
5. **Switch Twilio Sandbox callbacks.** Set Sandbox “When a message comes in” to the public `/api/twilio/whatsapp/inbound` URL using POST; this Next.js relay validates Twilio's signature and forwards the unchanged form body with the authenticated relay header. The existing staff-reply API already sends a per-message `StatusCallback` to `/api/twilio/whatsapp/status`; the status URL is not an n8n node and must remain signed. Do not change WF03 or add a competing reply/status workflow.
6. **Approved-recipient tests and rollback.** With an approved, Sandbox-joined test recipient, verify inbound persistence once, replay the same `MessageSid` and verify no second AI reply, take over during a deliberately delayed AI response and verify empty TwiML/no Nia reply record, then verify ordinary AI response, staff takeover reply, signed status callback, and audit evidence. Confirm recipient consent and test window before any outbound message. Roll back by restoring the previously active Sandbox inbound URL and the previously recorded WF01 Header Auth state; disable only the new outbound feature configuration if status persistence fails. Keep the prior active route available until verification passes. The user-reported WF01 execution IDs above are not a substitute for this approved-recipient cutover test; no provider request or external message was made in this preparation.
