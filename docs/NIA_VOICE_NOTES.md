# Nia website voice notes

Status: implemented and locally tested; provider activation blocked pending explicit approval. Nothing is enabled in Production.

## User experience

Open Nia and click the microphone. Permission is requested only on that click. Record up to 60 seconds, then stop; the transcript is appended to the existing draft. Review or edit it and click Send. Recording never automatically submits a chat message. Cancel stops recording or ignores an in-flight result. Retry reuses the failed clip without requesting another recording. Closing Nia releases microphone tracks and cancels pending transcription.

The existing 14px chat input and website/Telegram conversation paths remain unchanged. Unsupported browsers, denied microphone permission and unavailable transcription retain typing. HTTPS or localhost is required for microphone access. WebM/Opus and Safari MP4 are supported where MediaRecorder offers them; actual Safari/iPhone microphone acceptance remains unverified.

## Server contract

GET /api/nia/transcribe returns capability only. POST accepts multipart audio plus durationSeconds, checks same origin, limits requests to five per minute through the existing guard, bounds streamed input and audio to 2 MiB, and checks MIME/container signatures. The 60-second server check uses client-declared duration; it does not decode and independently verify media length. Transcript length is capped at 4,000 characters.

NIA_VOICE_ENABLED defaults false. When enabled, the server derives the transcription endpoint from NIA_N8N_WEBHOOK_URL and authenticates with the existing server-only relay secret. Requests have unique IDs, a 20-second timeout and bounded responses. No secret reaches the browser. No new database tables or migrations are required.

## Prepared n8n branch — NOT applied

| Node | Purpose |
| --- | --- |
| Nia Voice Webhook | Separate POST endpoint; existing Header Auth credential |
| Validate Nia Voice | Validate envelope and turn base64 into binary audio |
| Transcribe Nia Voice | Managed OpenAI audio transcription through n8n credits |
| Normalize Nia Transcript | Validate text and echo request ID |
| Return Nia Transcript | Return versioned JSON |

Connect each row to the next. Exact prepared operations and base workflow version are in integrations/nia-voice-prepared.json. All five node parameter schemas were validated read-only. No workflow update or publication occurred. Re-read the current graph/version before applying this additive branch; do not overwrite newer changes.

## Audio processing and activation

Automatic approval review rejected activation: general permission to add voice notes did not explicitly authorize disclosure of recordings to OpenAI. Obtain that approval before applying the prepared nodes, making a provider test, enabling NIA_VOICE_ENABLED or merging for activation. The proposed request sends the selected audio, MIME, duration and request ID through n8n to OpenAI; it does not include chat history. This may consume n8n credits.

The application does not store audio in the database or attach it to chat records. Failed clips remain in browser memory for retry until cancelled/closed; transport and provider processing still occur after activation. Do not promise zero provider/platform retention. Existing n8n execution payload saving is disabled; confirm settings and provider retention terms before activation.

## Evidence

Local tests: 400 passed, 16 live tests skipped; application/test typechecks and production build passed. Full lint: zero errors, 33 existing image warnings. Eight local production-build browser scenarios passed using a fake microphone and intercepted synthetic API responses: click-only permission, record/stop/edit/manual send, recording cancel, transcription cancel, denial, clip retry, 60-second auto-stop and close cleanup. Run scripts/test-nia-voice-browser.mjs with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if required. It restricts testing to loopback and blocks external requests; no recordings/screenshots are created.

These checks do not prove real audio recognition, accent quality, iPhone recording or provider availability. No user audio, Telegram message or Production mutation was sent during verification. After approval: apply the additive branch, validate with authorized synthetic speech, confirm transcript response, enable the flag and verify the exact deployed revision. Rollback: disable the flag; existing typed chat continues.
