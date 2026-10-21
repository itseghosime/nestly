# Nia — response speed and staff handoff

## Customer flow

Searches use one n8n interpretation call followed by the public-property query and exact verified result formatting. The former second introduction call is skipped. Generic requests can browse immediately without a budget; subjective filler does not become a mandatory amenity. Explicit requirements remain binding. Greetings, fees and listing references retain their supported handling. Planner and conversational AI deadlines are 5 and 6 seconds respectively; network/database/persistence/Telegram delivery can add time. **5–7 seconds is a target, not a guaranteed SLA.**

## Human notification

1. Customer asks to speak to an agent in website chat or Telegram.
2. The existing database operation confirms HUMAN_ACTIVE. Nia pauses.
3. After the customer response, background work checks human ownership and claims one outbox event.
4. Nestly sends the approved staff recipient a private Telegram alert with channel and Open conversation link. No transcript or private customer details are forwarded.
5. Staff opens the link, signs in, chooses Assign to me and replies from the inbox. Returning the conversation to AI uses the existing action.

The recipient must have started the bot and has been resolved to the exact existing Telegram identity requested by the user. Production-only TELEGRAM_HANDOFF_CHAT_ID selects the verified numeric destination. TELEGRAM_OUTBOUND_ENABLED must be true; an empty destination disables staff alerts. Do not put a token or destination in NEXT_PUBLIC variables.

Internal alert records use dashboard channel and template human_handoff.telegram_alert; that template identifies the actual Telegram transport. Per-conversation event keys prevent duplicate sends. Successful send means API acceptance only. Queued/unconfirmed after a network timeout means delivery is unknown; do not blindly retry. Rejected alerts show failed; the staff inbox still contains the request.

## Reproduce safe checks

```sh
npm test
npm run typecheck
npm run typecheck:tests
npm run lint
npm run build
```

All tests use synthetic fixtures/mocked Telegram. n8n manual synthetic runs measured 0.703–2.892 seconds across greetings and search extraction; these do not measure the whole customer request. The first-request regression returns a synthetic matching listing without asking for budget first. See BUILD_LOG.md for exact workflow versions and acceptance limits.

## Deliberate live acceptance

Send a fresh request such as “Show me two-bedroom apartments in GRA”. Matching public results should appear without a budget questionnaire. Then ask “I want to speak to an agent”. The approved staff Telegram chat should receive a private inbox link. Confirm response time from customer send to displayed reply and staff alert receipt separately. A failure in notification delivery must not restore AI ownership or discard the saved customer message. No automated Production chat/alert test is claimed in the implementation pass.

## Website responsiveness regression

A saved POST reply is displayed before the follow-up history request, so a slow history read cannot hide matching cards. Closed session cookies are expired on snapshot reads; staff history is retained and active HUMAN_ACTIVE sessions remain intact.

`node scripts/test-nia-visible-reply.mjs` starts a loopback production build and mocks all APIs, aborting external requests. It delays history by four seconds and requires the saved reply/card within 1.5 seconds. Observed 417ms locally. Chromium can be supplied through PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; no screenshots/videos are produced. Full local suite: 384 passed, 16 live skipped; typechecks, lint (0 errors/33 warnings) and build (85/85 pages) passed.
