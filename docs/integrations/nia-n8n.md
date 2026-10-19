# Nia: Telegram → Nestly backend → n8n WF02 → Gemini

## Responsibilities
Telegram remains registered to Nestly's existing webhook. The website chat also uses the same authenticated Nia response workflow after the website API validates and persists the message, checks AI/staff ownership, performs the existing public-property and fee lookup, and supplies at most ten previous messages. n8n generates conversational text only; the backend validates it and appends canonical listing/fee facts where applicable. Website conversation persistence, reply storage, ownership, and property cards remain controlled by the website API. n8n never sends Telegram messages or writes conversation state on either response path.

The response agent is a real Gemini-backed n8n AI Agent. This change does not replace the existing rule-based search parser with an LLM planner; natural-language search extraction is still handled by Nestly's existing parser. The website chat route uses this same response workflow while keeping conversation storage and property facts in the Nestly backend. Plain greetings, thanks, identity questions, acknowledgements and frustration also have friendly deterministic fallbacks when the AI workflow is disabled or unavailable.

## Workflow
Existing WF02 `CFeb2L0Pd9uOQkVK` retained; original chat-test path retained.
New path: Nia Backend Webhook → Validate Nia Request → Nia Telegram AI → Validate Nia Response → Return Nia JSON.
Public endpoint: `https://itseghosime.app.n8n.cloud/webhook/nestly-nia-response`.
Header Auth reuses the existing credential whose header is `X-Nestly-Relay-Secret`. The server sends the configured `TELEGRAM_WEBHOOK_SECRET`; no secret values are documented. This same value authenticates Telegram ingress and the Nia n8n request, so rotation must coordinate Vercel and the WF02 Header Auth credential.

The Telegram response agent receives bounded persisted history per request rather than relying on n8n Simple Memory. This avoids creating a competing authoritative conversation store. Its connected model is the existing Google Gemini Chat Model using n8n Gateway credits. Existing WF01, WF03 and all inspection/failure workflows are unchanged.

## Contract
Request JSON:
- version: 1
- requestId: idempotency/correlation identifier (never a website session token)
- query: current message, maximum 4000 characters
- answerKind: grounded | conversation
- visitor: returning-user flag derived from persisted conversation history
- context: normalized saved preferences, recent property IDs and selected property ID
- history: up to ten {role: user|assistant|staff, content}, maximum 1500 characters per message
- grounding: freshly generated backend answer, public property summaries and optional search-result count

Response JSON: {version: 1, requestId, message}. Request ID must match. Message is nonempty and at most 1200 characters; body is capped at 16 KiB. No browser can obtain the shared secret. Requests use HTTPS, forbid URL credentials/query fragments and redirects, timeout after 18 seconds, and do not retry automatically. WF02 has a 25-second execution timeout and does not retain successful/failed production execution data.

For grounded answers the AI supplies only a short introduction; exact facts remain appended by the backend. Model-supplied monetary values, links or HTML are rejected, as are numeric grounded introductions. The model guard is defense in depth, not a proof against every possible hallucination or prompt injection. History and grounded facts are explicitly treated as untrusted data in the system prompt.

## Configuration and rollback
Server-only Production variables:
- NIA_N8N_ENABLED=true
- NIA_N8N_WEBHOOK_URL=the endpoint above
- TELEGRAM_WEBHOOK_SECRET=the server-side Telegram webhook secret also configured in the WF02 Header Auth credential

Missing, disabled, timed-out, invalid or unavailable AI responses use the grounded fallback and log only a fixed reason code. They do not create a second dispatch. Disable NIA_N8N_ENABLED and redeploy to restore the prior response path; preserve Telegram's webhook and all historical data. No database migration is needed. Because the same secret authenticates both Telegram ingress and WF02, rotate it in Vercel and the WF02 credential together if compromised.

## Verification ledger — 2026-10-19
- Local: 65 focused Vitest tests passed under Vitest 5.0.5 in a source-only harness. Five changed runtime modules compiled with esbuild. This is not a full repository typecheck/build.
- Linked Supabase: read-only metadata verified the existing messages columns used by the scoped history query; no rows or schema modified.
- Live n8n, manual synthetic execution 89: greeting returned a warm answer through the new validation/model/JSON path.
- Live n8n, manual synthetic execution 90: grounded-fee input returned a short introduction without modifying fee facts. No Telegram/provider send nodes exist on this path.
- WF02 published successfully; Production configuration saved. Vercel build and end-to-end Telegram delivery are pending at this documentation checkpoint.
- No customer messages sent/replayed, credentials disclosed, migrations applied, screenshots, recordings, PDF or hosting-provider changes.

## Returning-user follow-up
The current message is excluded from history. An earlier inbound message establishes a return visit. When the current conversation has no earlier user message, the backend checks the exact bot ID + Telegram user ID and looks for an earlier inbound across that same identity's conversations, excluding the current inbound. This recognizes returns after a closed conversation without matching names or usernames. Lookup errors never fabricate a return visit. Only greeting-only messages receive a welcome-back fallback; substantive requests proceed normally. visitor.returningUser is passed explicitly to the model.
Local focused coverage is now 68 passed. Live n8n manual synthetic execution 91 returned a welcome-back greeting. Published version ebaff88d-e649-4506-ad80-508d47241ffa includes the visitor contract.

## Release verification
PR #7 merged as a26177dda2d77930b81cb0226b8574027380765f; final Preview and Production Vercel checks succeeded. Expanded source-only harness: 92 tests passed including the enabled model-request→single mocked Telegram-send path. Actual Next.js 16.4.2 NextResponse was loaded; database/provider I/O was mocked. No full repository test-typecheck is claimed. The retained legacy chat trigger is disabled in final published version c20811a0-5c67-499a-84be-c25fbd3b8be7 so production ingress uses Header Auth only. Unauthenticated endpoint probe returned 403. A fresh deliberate Telegram inbound still needs to confirm the deployed relay-secret match and real reply delivery. This release does not modify Telegram's registered ingress, user data, WF01/WF03 or migrations.
