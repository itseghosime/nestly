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

It reports only configuration readiness and never prints values or constructs/logs a token-bearing Bot API URL. Registration is a later cutover action: use a trusted secret manager/secure operator client to call Telegram `setWebhook` with the public HTTPS `/api/telegram/webhook` URL and the same `secret_token`; do not put a bot-token URL in a browser, shell history, workflow export, or logs. This pass did not register the webhook, change deployment configuration, or send messages.

## Migration and verification

Local-only additive migration: `supabase/migrations/20261019120000_nestly_telegram_channel.sql`. It:

- admits `telegram` as a conversation channel and adds private identity, update-deduplication, and outbound-dispatch ledgers;
- scopes Telegram identities and provider IDs by channel/bot, with uniqueness and durable processing state;
- adds service-only RPCs for update claims, inbound persistence, handoff, AI/staff dispatch claims, finalization, and expiry handling;
- requires an assigned authorized staff member for staff dispatch, and enforces fresh AI ownership checks/blocks takeover during an active send;
- preserves existing channels, rows, WF01/WF03, and the existing messages provider-ID/idempotency behavior.

The migration preserves the existing `nestly.website_handoff_conversation` transaction-local authorization used by `request_website_handoff`; Telegram uses a separate transaction-local setting. The disposable SQL suite exercises the website anonymous handoff and staff reply after loading the migration. The live WF01 instance was not independently inspected or changed in this pass.

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

## Future cutover order (not performed)

1. Review the linked migration history and dry-run; confirm `20261019120000_nestly_telegram_channel.sql` is the only intended pending migration and reconcile compatibility before applying. Do not reset, seed, or repair remote history.
2. Apply the reviewed migration through the normal linked migration process; verify grants/RLS and the website/WhatsApp regressions read-only.
3. Configure `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `CRON_SECRET` as server-only production secrets, leave `TELEGRAM_OUTBOUND_ENABLED=false`, then deploy to a public HTTPS origin. Verify the scheduled route with an authorized synthetic request and confirm the cron is active before relying on it.
4. Register Telegram's webhook through a trusted non-browser client with the HTTPS endpoint and secret header. Verify the webhook configuration without printing its token-bearing API URL or secret.
5. Exercise unauthorized/unsupported/duplicate-update handling with synthetic tests, then use an explicitly approved Telegram test chat to verify private inbound persistence, grounded answer, handoff, assigned staff reply, and Return to AI. API acceptance is the strongest send evidence; do not call it delivered/read.
6. Enable outbound sending only after a separately approved controlled test and rollback plan. On timeout/unknown, do not automatically resend. Disable the feature flag to stop new sends; preserve durable records for operator review.

For this pass the migration remains local-only and outbound remains disabled by default. The daily recovery schedule and operator review path are implemented but not deployed. Webhook registration, linked migration application, production configuration/deployment, and live Telegram verification are pending.
