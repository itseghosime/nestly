# Nia: Telegram → Nestly backend → n8n WF02 → Gemini

## Responsibilities
Telegram remains registered to Nestly's existing webhook. The website chat also uses the same authenticated Nia response workflow after the website API validates and persists the message, checks AI/staff ownership, performs the existing public-property and fee lookup, and supplies at most ten previous messages. n8n generates conversational text only; the backend validates it and appends canonical listing/fee facts where applicable. Website conversation persistence, reply storage, ownership, and property cards remain controlled by the website API. n8n never sends Telegram messages or writes conversation state on either response path.

The response agent is a real Gemini-backed n8n AI Agent. An authenticated n8n Gemini search planner now extracts complete criteria, including Nigerian places nationwide, before the backend public query. Ambiguous names require clarification; the original parser remains an availability fallback. The model does not establish inventory or geographic correctness for every possible spelling. The website chat route uses this same response workflow while keeping conversation storage and property facts in the Nestly backend. Plain greetings, thanks, identity questions, acknowledgements and frustration also have friendly deterministic fallbacks when the AI workflow is disabled or unavailable.

## Workflow
Existing WF02 `CFeb2L0Pd9uOQkVK` retained; original chat-test path retained.
New path: Nia Backend Webhook → Validate Nia Request → Nia Telegram AI → Validate Nia Response → Return Nia JSON.
Public endpoint: `https://itseghosime.app.n8n.cloud/webhook/nestly-nia-response`.
Header Auth reuses the existing credential whose header is `X-Nestly-Relay-Secret`. The server sends `NESTLY_WF01_RELAY_SECRET`; no secret values are documented. `TELEGRAM_WEBHOOK_SECRET` is separate and authenticates Telegram ingress. Preserve both credential values and their distinct purposes.

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
- NESTLY_WF01_RELAY_SECRET=the existing server-side relay secret configured in WF02 Header Auth

Missing, disabled, timed-out, invalid or unavailable AI responses use the grounded fallback and log only a fixed reason code. They do not create a second dispatch. Disable NIA_N8N_ENABLED and redeploy to restore the prior response path; preserve Telegram's webhook and all historical data. No database migration is needed. Do not substitute the Telegram ingress secret for the n8n relay secret. If rotation is needed, coordinate only the affected credential's actual callers.

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

## Nigerian location planner — 2026-10-19

Protected POST /webhook/nestly-nia-plan shares WF02's existing Header Auth and Gemini model. Input: version, requestId, query (max 4000), prior preferences. Output: version/requestId plus intent search with complete allowlisted criteria, clarification with one bounded question, or conversation. Client timeout eight seconds; response cap 8 KiB; no redirects/retries. The backend copies only validated location, bedrooms, annual budget, property type, explicit power requirement, and max four amenity keywords. Location is sanitized before public database filters. It does not use model output as a SQL/PostgREST expression or infer that Nestly has listings in a named place.

Manual synthetic n8n executions 97–99 verified Independence Layout, Enugu; Aruogba clarification preserving solar; and ambiguous New Town clarification. Published version 7323dbb7-cd15-48b9-829d-77dd5338475d. This is not a complete gazetteer or a guarantee that all Nigerian place names are recognized. The model asks for a state/city if uncertain. Live production website test after PR #9 showed fallback and no n8n executions, exposing the wrong secret variable introduced by the previous website wiring. The relay-reference correction must receive a fresh production roundtrip before it is called verified.
