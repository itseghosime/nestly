# Nia: Telegram → Nestly backend → n8n WF02 → Gemini

## Responsibilities
Telegram remains registered to Nestly's existing webhook. The backend validates Telegram's secret, claims the update, persists the inbound message, checks AI/staff ownership, performs the existing public-property and fee lookup, and supplies at most ten previous messages from this same conversation. n8n generates conversational text. The backend validates it, appends canonical listing/fee facts, rechecks ownership in the existing reply-claim RPC, and dispatches once through Telegram. n8n never sends Telegram messages or writes conversation state on this response path.

The response agent is a real Gemini-backed n8n AI Agent. This change does not replace the existing rule-based search parser with an LLM planner; natural-language search extraction is still handled by Nestly's existing parser. The existing website chat route is unchanged. Plain greetings, thanks, identity questions, acknowledgements and frustration also have friendly deterministic fallbacks.

## Workflow
Existing WF02 `CFeb2L0Pd9uOQkVK` retained; original chat-test path retained.
New path: Nia Backend Webhook → Validate Nia Request → Nia Telegram AI → Validate Nia Response → Return Nia JSON.
Public endpoint: `https://itseghosime.app.n8n.cloud/webhook/nestly-nia-response`.
Header Auth reuses the existing credential whose header is `X-Nestly-Relay-Secret`. The server sends the existing `NESTLY_WF01_RELAY_SECRET`; no secret values are documented or changed. This is a shared credential, so rotation must coordinate WF01 and WF02.

The Telegram response agent receives bounded persisted history per request rather than relying on n8n Simple Memory. This avoids creating a competing authoritative conversation store. Its connected model is the existing Google Gemini Chat Model using n8n Gateway credits. Existing WF01, WF03 and all inspection/failure workflows are unchanged.

## Contract
Request JSON:
- version: 1
- requestId: correlation identifier derived from the claimed Telegram update, not a phone number
- query: current message, maximum 4000 characters
- answerKind: grounded | conversation
- context: normalized saved preferences, recent property IDs and selected property ID
- history: up to ten {role: user|assistant|staff, content}, maximum 1500 characters per message
- grounding: freshly generated backend answer, public property summaries and optional search-result count

Response JSON: {version: 1, requestId, message}. Request ID must match. Message is nonempty and at most 1200 characters; body is capped at 16 KiB. No browser can obtain the relay secret. Requests use HTTPS, forbid URL credentials/query fragments and redirects, timeout after 18 seconds, and do not retry automatically. WF02 has a 25-second execution timeout and does not retain successful/failed production execution data.

For grounded answers the AI supplies only a short introduction; exact facts remain appended by the backend. Model-supplied monetary values, links or HTML are rejected, as are numeric grounded introductions. The model guard is defense in depth, not a proof against every possible hallucination or prompt injection. History and grounded facts are explicitly treated as untrusted data in the system prompt.

## Configuration and rollback
Server-only Production variables:
- NIA_N8N_ENABLED=true
- NIA_N8N_WEBHOOK_URL=the endpoint above
- existing NESTLY_WF01_RELAY_SECRET remains unchanged

Missing, disabled, timed-out, invalid or unavailable AI responses use the grounded fallback and log only a fixed reason code. They do not create a second dispatch. Disable NIA_N8N_ENABLED and redeploy to restore the prior response path; preserve Telegram's webhook and all historical data. No database migration is needed.

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
