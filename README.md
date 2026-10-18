# Nestly

Nestly is a residential-rentals platform for Benin City and Delta State, with public property discovery and a staff operations workspace. This repository contains the current application, database migrations, synthetic demo fixtures, tests, and operational documentation.

## Project status

- The app is built with Next.js App Router, React, TypeScript, Tailwind CSS, and GSAP.
- Supabase provides authentication, property data, inspections, conversations, staff authorization, and audit records.
- The Twilio relay and staff-reply/status-callback routes are implemented. The six Twilio migrations are applied to the linked Supabase project.
- Website Nia conversations currently use the Next.js database-grounded handler. Live WF01 relay authentication/deduplication changes and Twilio callback cutover have not been verified or changed.
- The app has **not** been deployed to Vercel. Public HTTPS, production configuration, and approved-recipient end-to-end messaging remain deployment prerequisites. Do not configure callbacks to localhost.
- Anonymous saved homes remain browser-local. The app does not collect rent or deposits, process payments, or create binding agreements.

See [docs/BUILD_LOG.md](docs/BUILD_LOG.md), [docs/BACKEND_CHECKLIST.md](docs/BACKEND_CHECKLIST.md), [docs/BACKEND_REQUIREMENTS.md](docs/BACKEND_REQUIREMENTS.md), and [docs/n8n-contracts.md](docs/n8n-contracts.md) for implementation evidence and current limitations.

## Requirements and local setup

- Node.js **20.9 or newer** (validated locally with Node 24.12.0)
- npm
- A Supabase project for authenticated/backend features

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill only the environment variables needed for the feature being tested. Keep `.env.local` private; it is ignored by Git. `NEXT_PUBLIC_DEMO_MODE=true` enables local fixture fallbacks and should not be enabled in production.

### Environment variables

Names only are listed here; never commit values for secrets.

**Supabase-backed app**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only
- `NEXT_PUBLIC_SITE_URL`
- `PUBLIC_RECEIPT_HMAC_SECRET` — server-only
- `NEXT_PUBLIC_DEMO_MODE` — set to `true` only for local fixture mode

**Twilio inbound relay and staff-initiated replies**

- `TWILIO_AUTH_TOKEN` — server-only
- `TWILIO_OUTBOUND_ENABLED` — keep `false`; staff-initiated sends require an explicit `true`
- `TWILIO_PUBLIC_WEBHOOK_URL`
- `NESTLY_WF01_WEBHOOK_URL`
- `NESTLY_WF01_RELAY_SECRET` — server-only
- `TWILIO_ACCOUNT_SID`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_STATUS_CALLBACK_URL`

These routes require a publicly reachable HTTPS deployment before Twilio can call them. The linked migrations being applied does not mean WF01, Sandbox callbacks, or outbound messaging have been cut over.

**CLI and isolated tests**

- `SUPABASE_DB_PASSWORD` — Supabase CLI only
- `SUPABASE_TEST_URL`
- `SUPABASE_TEST_ANON_KEY`
- `SUPABASE_TEST_SERVICE_ROLE_KEY`
- `SUPABASE_TEST_DB_CONTAINER` — name of a disposable local Supabase database container
- `WHATSAPP_TEST_RECIPIENTS`

Use dedicated disposable test credentials and databases. Never run destructive tests or seed data against production.

**Deferred/optional integrations**

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- `NIA_PROVIDER`
- `NIA_MODEL`
- `NIA_TOKEN_BUDGET`
- `NIA_COST_CAP_NGN`
- `RESEND_API_KEY`

Direct Meta integration is deferred while Twilio is the current WhatsApp provider. These variables are not a substitute for the pending WF01 and callback cutover.

## Architecture overview

- `app/` — public routes, staff workspace, and App Router API endpoints
- `components/` — shared public and staff UI
- `lib/` — domain types, Supabase clients, authorization, conversation helpers, and explicit demo fixtures
- `supabase/migrations/` — active ordered migrations; all checked-in active migrations currently align with linked history
- `supabase/prepared-migrations/` — retained preparation drafts, not part of the active migration chain; review before use
- `tests/` — unit/API tests, including separately gated live-Supabase tests
- `scripts/` — disposable local Supabase SQL regression runners
- `docs/` — requirements, build log, runbooks, and integration contracts

The repository includes the reviewed sanitized WF03 projection export. Raw WF03 exports, the WF01 export with credential metadata, local seed SQL containing contact fields, Supabase local state, design-reference HTML, recordings, documentation image/PDF artifacts, and local visual-test scripts are intentionally excluded.

## Validation

```bash
npm test
npm run typecheck
npm run typecheck:tests
npm run lint
npm run build
```

Live-Supabase tests are environment-gated; skipped live tests are not evidence of a pass. The SQL regression runners require a disposable local Supabase database:

```bash
SUPABASE_TEST_DB_CONTAINER=<disposable-container-name> npm run test:twilio-staff:local
SUPABASE_TEST_DB_CONTAINER=<disposable-container-name> npm run test:twilio-dedup:local
```

Do not run `supabase db reset` or apply seed data to the linked project. The local `supabase/seed.sql` file is excluded from this repository because it contains contact fields; the checked-in `supabase/config.toml` does not configure seed paths.

## Deployment limitations

No Vercel deployment has been created or changed as part of this project. When deploying, use the repository root with the Next.js framework preset, `npm ci` for installation, and `npm run build` for the build. Configure the Supabase variables above for the target environment; add the Twilio and relay variables only after public HTTPS, WF01 authentication/deduplication, callback settings, and approved-recipient tests are ready. Keep all service-role, Twilio, relay, and receipt-signing secrets server-side and out of `NEXT_PUBLIC_` variables.
