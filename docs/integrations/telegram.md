# Telegram integration

## Local implementation

Telegram is an additive channel for the private chats handled by `@nestly_nia_bot`. Next.js owns webhook ingress, persistence, Nia responses, staff handoff/replies, and `sendMessage`; no n8n workflow or fabricated website session/phone number is involved. Telegram identities are keyed by bot ID, Telegram user ID, and chat ID. Display names/usernames are metadata, never identity keys.

Only private text messages are handled. Unsupported updates are safely acknowledged/ignored and recorded. A duplicate received while its first worker still holds an active `processing` lease gets HTTP 503 so Telegram can retry; it is not acknowledged as complete. If the worker crashed before dispatch, redelivery after lease expiry can reclaim the update. Completed, ignored, human-owned, and durably tracked dispatch outcomes are acknowledged without re-dispatch. Website and WhatsApp paths are unchanged. Staff must take over first; Telegram staff replies require an authorized, assigned operator. Nia checks current conversation ownership immediately before dispatch. If takeover wins during response preparation, no AI reply is dispatched.

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

It reports only configuration readiness and never prints values or constructs/logs a token-bearing Bot API URL. Registration is a later cutover action: use a trusted secret manager/secure operator client to call Telegram `setWebhook` with the public HTTPS `/api/telegram/webhook` URL and the same `secret_token`; do not put a bot-token URL in a browser, shell history, workflow export, or logs. The initial implementation pass did not register the webhook; the current Production configuration and live checks are recorded below.

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
4. **Pending by design:** Register Telegram's webhook only in a separately approved step, using a trusted non-browser client with the HTTPS endpoint and secret header. Do not print or log the secret or a token-bearing Bot API URL. The authorization gate is verified, but no webhook has been registered.
5. Use an explicitly approved Telegram test chat for any later inbound/send validation. API acceptance is the strongest send evidence; do not call it delivered/read.
6. Enable outbound sending only after a separately approved controlled test and rollback plan. It remains disabled; registering the webhook while it is off will not send Nia/staff replies. On timeout/unknown, do not automatically resend. Preserve durable records for operator review.

The linked migration is applied and the Next.js code is deployed to Production. The webhook is not registered, outbound remains explicitly disabled, and no provider message was sent. The daily recovery route is protected and its Vercel-triggered authorized invocation succeeded; PR #2 has not been merged.
