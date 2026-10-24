# Nia voice input — browser speech recognition

Current implementation supersedes the earlier native-on-device and Whisper proposals. User explicitly approved browser speech processing that may run online, clarifying that audio must not be saved to the database. User then required listening until Stop recording is clicked.

## User steps

Open Nia → Record voice message → speak → Stop recording → review/edit text → Send. There is no Nestly model download or recording-duration cap. Nothing is sent to Nia or saved as a message until Send. Current draft text is preserved and dictated text is appended once. No MediaRecorder, audio file, application audio-upload route, Storage object or audio database field is involved.

The app requests continuous browser recognition using SpeechRecognition or webkitSpeechRecognition and does not call available/install or require processLocally. If that property exists, it is set false so a downloaded local pack is not required. The browser may process audio through its own online service; processing/retention by that browser/provider is outside Nestly's control. The site discloses this while listening. Do not claim audio never leaves the device or is never retained by a browser vendor.

## Keep listening until Stop

There is no 60-second or other recording timer. Silence/no-speech followed by a normal browser end event resumes recognition automatically, preserving previous text without duplicate results. Normal browser-imposed session endings also resume. Stop during a restart cancels the restart and returns collected text. Cancel discards text from that voice session, and closing/minimizing Nia releases recognition and prevents restarts. Late results after cancellation are ignored.

Permission denial, loss of the browser recognition service, network failure, closing/suspending the tab/device or an unsupported browser can interrupt capture. The app cannot force a browser/vendor to maintain an uninterrupted microphone session. Those failures stop safely, preserve any recognized text for review and explain how to retry/type. Startup and final-result watchdogs do not impose a listening-duration limit. English en-GB is requested; actual accent/device accuracy still needs user testing.

Long voice input is not truncated or stopped at 4,000 characters. The existing backend message-size limit still applies to Send: the full draft is kept, a warning is shown and Send is disabled until the text is shortened. Existing 14px composer styling and website/Telegram replies remain unchanged.

## Removal and deployment

Removed Transformers.js, Whisper worker/client/worklet, generated runtime preparation, WASM/model assets and obsolete tests. No provider API key or environment change is required. Existing browser model caches from the earlier version may remain on individual devices but are no longer used. No n8n workflow or database migration changed. Deploy via existing Nestly Git-to-Vercel integration.

## Evidence and reproduction

Run npm test, npm run typecheck, npm run typecheck:tests, npm run lint and npm run build. Then run scripts/test-nia-voice-browser.mjs with a local Chromium path if necessary. The harness starts a loopback production build, mocks browser recognition and all APIs, blocks external requests and asserts no model requests or application audio uploads. No real microphone/provider speech test is automated.

Unit cases cover one-hour listening without app stop, normal/silent session restarts, duplicate-result replacement, explicit Stop, Stop between sessions, cancellation/late results, permission failures, final-event timeout and preserving long text. Browser cases cover manual Send, editable text, no 60-second stop, both cancellation paths, session restart/silence, permissions, oversized-draft editing, close cleanup and unsupported-browser typing. Production runtime acceptance and actual iPhone/Chrome service quality remain separate from synthetic local tests.

Reference: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition .
