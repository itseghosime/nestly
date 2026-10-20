# Telegram integration

## Local implementation

Telegram is an additive channel for the private chats handled by `@nestly_nia_bot`. Next.js owns webhook ingress, persistence, Nia responses, staff handoff/replies, and `sendMessage`; no n8n workflow or fabricated website session/phone number is involved. Telegram identities are keyed by bot ID, Telegram user ID, and chat ID. Display names/usernames are metadata, never identity keys.

Only private text messages are handled. Unsupported updates are safely acknowledged/ignored and recorded. A duplicate received while its first worker still holds an active `processing` lease gets HTTP 503 so Telegram can retry; it is not acknowledged as complete. If the worker crashed before dispatch, redelivery after lease expiry can reclaim the update. Completed, ignored, human-owned, and durably tracked dispatch outcomes are acknowledged without re-dispatch. Website chat remains available. WhatsApp is deferred from active customer contact; historical records and signed Next.js callback handling remain unchanged, and staff replies are gated by `TWILIO_OUTBOUND_ENABLED`. That app-side flag does not disable Twilio inbound callbacks or any WF01 synchronous TwiML reply. Staff must take over first; Telegram staff replies require an authorized, assigned operator. Nia checks current conversation ownership immediately before dispatch. If takeover wins during response preparation, no AI reply is dispatched.

The current release requires Telegram and website chat, not WhatsApp reactivation. Public Telegram contact links use the fixed destination `https://t.me/nestly_nia_bot`; website chat remains a separate option. WhatsApp conversation rows retain their `whatsapp` channel identity and remain readable in staff history; the app does not infer Telegram identities from stored phone numbers. The user previously reported WF01 active at version `41d0a037-4706-4899-b18c-5756be24fb7b`; that external workflow and Twilio webhook registration were not changed or rechecked for this channel switch. Do not describe WhatsApp as fully disconnected.

Update processing and message dispatch are durable and idempotent. A duplicate Telegram `update_id` does not create another inbound message or reply. Expired processing leases may be reclaimed on Telegram redelivery, up to the attempt limit. Telegram `sendMessage` API acceptance is not delivery/read evidence; Telegram delivery and read callbacks are not implemented. Timeouts, unreadable responses, or failed persistence after provider acceptance are `unknown` and are never automatically resent. A daily Vercel Cron invokes the service-only expired-dispatch sweep; it marks expired sends `unknown` and never retries them. Recovery may therefore take up to one schedule interval after a crash. Concurrent sweep runs skip rows already locked by another run.

For an unknown Nia or staff send, the assigned operator must explicitly acknowledge the uncertainty in the inbox before the composer permits a separate staff reply. The original remains `unknown`, the acknowledgement is audited, and the follow-up is a new message with a new idempotency key—not a retry. The reply still requires Telegram sending to be enabled and configured. Unknown system handoff acknowledgements explain that no retry will occur but do not block staff from continuing the conversation. A late provider response with a valid Telegram message ID may refine the recorded state to API-accepted; it cannot establish delivery/read. The app's provider request timeout is 10 seconds and the active ownership lock is two minutes, but a late provider acceptance after a client timeout cannot be ruled out.

## Configuration

Server-only variables:

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API credential for `@nestly_nia_bot`; obtain/manage it in BotFather. Never expose it in a `NEXT_PUBLIC_` variable, browser URL/history, logs, or workflow export. |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret used to verify Telegram's `X-Telegram-Bot-Api-Secret-Token` header. Generate locally with `openssl rand -hex 32`; store the value in the deployment secret manager and supply the same value as Telegram's `secret_token` when registering the webhook. Never paste it into chat or commit it. |
| `TELEGRAM_OUTBOUND_ENABLED` | Exact string `true` enables staff/Nia sends; absent, invalid, or any other value keeps sends disabled. Keep it absent or `false` until separately approved. |
| `CRON_SECRET` | Random server-only bearer secret (at least 32 characters) used to authorize the scheduled expired-dispatch recovery route. Store it in Vercel before relying on the production Cron; Vercel sends it as `Authorization: Bearer …`. It does not enable Telegram outbound sends. |

The redacted, no-network readiness check is:

```sh
npm run telegram:preflight
```

It reports only configuration readiness and never prints values or constructs/logs a token-bearing Bot API URL. Production registration is performed by `POST /api/admin/telegram/webhook` from a same-origin session authorized as `Platform Admin`, with JSON body `{"action":"register"}`. The action accepts no destination or credentials from the caller; it reads secrets server-side, checks `getWebhookInfo` first, refuses to replace a different destination, calls `setWebhook` for the fixed endpoint, then verifies the result with `getWebhookInfo`. Never put a bot-token URL in browser code/history, shell history, workflow export, or logs.

## Migration and verification

Additive migration `supabase/migrations/20261019120000_nestly_telegram_channel.sql`, applied to the existing linked Supabase project on 2026-10-18 after an exact single-pending migration dry-run. A seed-disabled disposable database also applied all 21 ordered migrations. The Telegram migration:

- admits `telegram` as a conversation channel and adds private identity, update-deduplication, and outbound-dispatch ledgers;
- scopes Telegram identities and provider IDs by channel/bot, with uniqueness and durable processing state;
- adds service-only RPCs for update claims, inbound persistence, handoff, AI/staff dispatch claims, finalization, and expiry handling;
- requires an assigned authorized staff member for staff dispatch, and enforces fresh AI ownership checks/blocks takeover during an active send;
- preserves existing channels, rows, WF01/WF03, and the existing messages provider-ID/idempotency behavior.

The migration preserves the existing `nestly.website_handoff_conversation` transaction-local authorization and adds a separate Telegram setting. Read-only linked-schema verification confirmed the live `nestly_handoff_notifications` guard retains the website check and that the existing conversation triggers/data remain present. The user reports WF01 remains active at version `41d0a037-4706-4899-b18c-5756be24fb7b`; its WhatsApp-only, inbound-validating handoff query was not edited or independently retrieved in this session. The disposable SQL suite exercises website anonymous handoff and staff replies after loading the migration.

The expiry sweep uses row locks with `SKIP LOCKED`, updates dispatch/message/update state atomically to `unknown`, and returns the number of dispatches changed. The protected cron route calls it on a daily schedule. `acknowledge_telegram_unknown_send` is limited to an assigned staff member on a human-owned Telegram conversation, records an audit event and review row, and leaves the original outcome unknown. A repeated acknowledgement is idempotent.

Run the isolated-database suite only against a disposable local Supabase container:

```sh
SUPABASE_TEST_DB_CONTAINER=<isolated-or-telegram-fresh-container-name> npm run test:telegram:local
```

The runner rejects container names that do not identify an isolated test stack, provisions synthetic staff/customer fixtures, and does not connect to linked Supabase or contact Telegram. For migration validation, copy all repository migrations into a new local Supabase project, start with project seed SQL disabled, confirm `supabase migration list --local` has matching local/remote versions, then run the suite. Fresh-stack verification on **2026-10-18** applied all 21 migrations, including all 20 predecessors, and had no pending versions. Fixture timestamps/identities are synthetic and do not represent verification time. Mocked route tests and existing-channel regressions:

```sh
npm test -- tests/api/telegram.test.ts tests/api/telegram-staff-replies.test.ts tests/api/telegram-recovery-cron.test.ts tests/api/telegram-unknown-review.test.ts tests/unit/staff-conversation-status.test.ts tests/api/nia-fee-answer.test.ts tests/api/nia-conversation-context.test.ts tests/api/twilio-staff-replies.test.ts tests/api/twilio-relay.test.ts tests/api/twilio-status-signature.test.ts
npm run typecheck
npm run typecheck:tests
```

## Deployment and later channel activation

1. **Completed:** Confirmed the linked migration history and dry-run; applied only `20261019120000_nestly_telegram_channel.sql`, without reset, seed, or history repair. Read-only checks verified aligned history, RLS/grants, safe RPC search paths, and existing channel compatibility.
2. **Completed 2026-10-18:** PR #1 is merged to `main` at `f182464b8007832430be263ab0d7ddaddd7d247c`. Vercel Production redeployment `GtzDoc1tK6J1rg26UASPoQR4sTci` is Ready for that revision. `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` were independently generated with local Web Crypto (32 random bytes each) and stored as Vercel Production Secret variables; values were not revealed. `TELEGRAM_BOT_TOKEN` was preserved. `TELEGRAM_OUTBOUND_ENABLED=false` remains a non-secret Config.
3. **Completed live authorization checks:** Missing and wrong `X-Telegram-Bot-Api-Secret-Token` headers each returned HTTP 403 before request parsing or admin-client creation. Missing and wrong cron bearer authorization each returned HTTP 401 before database access. Vercel's authorized manual Cron trigger returned HTTP 200. The route invokes only `mark_expired_telegram_dispatches_unknown`; its SQL marks expired dispatch records `unknown` and does not call a provider. The scheduled job remains configured to run daily.
4. **Completed 2026-10-18:** A Platform Admin invoked the fixed-destination setup action from the authenticated staff inbox. It returned HTTP 200 after the registration response and `getWebhookInfo` verified `https://nestly-sigma.vercel.app/api/telegram/webhook`, `allowed_updates=["message"]`, and `max_connections=1`. `drop_pending_updates=false` was sent to Telegram. No alternate webhook was replaced.
5. Use an explicitly approved Telegram test chat for any later inbound/send validation. API acceptance is the strongest send evidence; do not call it delivered/read.
6. **Controlled test window (2026-10-18):** The user approved enabling `TELEGRAM_OUTBOUND_ENABLED=true` in Production for a user-led test. The first live exchange produced two completed updates with API-accepted dispatches and persisted context, but bedroom and conversational-filler preferences were parsed incorrectly. The fixes are deployed at `bcdcb5e1b410d71f7e5388281226cd97d8e42bbb` and `f9cc070136e59d46cd0c21172a7c3f54e8ee811f`. API acceptance does not prove handset receipt/read. Do not send unsolicited or synthetic messages. Stop on any uncertain send; never automatically retry an unknown outcome. Disable outbound if a serious failure occurs.

The linked migration is applied and the Next.js code is deployed to Production. The webhook is registered and verified; outbound is enabled only for the user-controlled live-test window. Two live dispatches were accepted by Telegram, while handset receipt/read remains unverified. The parser follow-up fix is live; no old updates were replayed by the operator. The daily recovery route is protected and its Vercel-triggered authorized invocation succeeded; PR #2 has not been merged.


## n8n AI response generation (2026-10-19)
Telegram ingress, persistence, ownership and dispatch remain backend-owned. Natural-language replies now have an optional authenticated WF02/Gemini response service. See [nia-n8n.md](nia-n8n.md) for the contract, environment-specific test ledger and rollback. This preserves the existing grounded search parser; it does not make every search interpretation LLM-based.
