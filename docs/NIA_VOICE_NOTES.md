# Nia on-device dictation

This supersedes the initial, unmerged server-transcription proposal. No audio upload endpoint, provider relay, n8n audio branch, transcription key or new environment setting is shipped.

## How to use

1. Open the website Nia chat in a supported browser.
2. Click **Dictate message**. A missing local English speech pack may download at this point. Microphone permission is requested when recognition starts, never when opening the site.
3. Speak, then click **Stop dictation** (maximum 60 seconds). Recognition is required to run on your device.
4. Review or edit the text appended to your existing draft.
5. Click **Send** to submit text through the existing Nia conversation path.

Cancel discards that dictation. Closing/minimizing Nia or starting an ordinary reply aborts microphone recognition and ignores late results. The existing draft remains. Permission denial and recognition failures allow typing or a new attempt. No recording is retained for retry because the app never creates an audio file.

## Privacy boundary and compatibility

The app uses only unprefixed SpeechRecognition with processLocally support and available({langs:['en-US'], processLocally:true}). It sets processLocally=true before start and refuses legacy/remote-only implementations. There is no online speech-recognition fallback. Audio is processed by the browser locally, not uploaded to Nestly, n8n or an AI provider by this feature. Only text is sent, when the user clicks Send. Normal site/data requests still occur.

This API is experimental and browser/OS/language-pack dependent. A native microphone button appears only when the required local interfaces and language availability are present. Unsupported browsers, including devices without these local APIs, retain typing. Do not promise universal iPhone/Safari support. English (en-US) is the initial supported pack; Nigerian accent accuracy needs actual user-device acceptance. HTTPS or localhost is required. A pack download transfers a model to the device; it does not upload microphone audio. Cancellation during installation ignores its completion but cannot necessarily cancel a browser-managed model download.

The app receives final recognized text, caps it at 4,000 characters and appends to the draft within that cap. Listening stops at 60 seconds, with startup and completion timeout handling. Chat stays 14px; no auto-send or audio-message history is introduced. Existing website/Telegram AI and human handoff paths are unchanged. No database migrations or n8n edits are needed.

## Reproduce checks

Run npm test, npm run typecheck, npm run typecheck:tests, npm run lint and npm run build. After building, run node scripts/test-nia-voice-browser.mjs (set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if needed).

The harness starts a loopback production build, intercepts application APIs, blocks external requests and supplies a fake local SpeechRecognition implementation. It requires explicit text Send, asserts processLocally on availability/install/start, checks no transcription/audio endpoint request, and verifies cancellation, denied permission, local pack installation, auto-stop, close cleanup and unsupported-browser typing. No real microphone, audio recording, screenshot or video is used. These are local synthetic UI checks, not actual browser speech-quality or Production device acceptance.

Rollback: revert the voice-notes PR; typed chat and existing server responses continue. No provider or database rollback is necessary.

Local results for this revision: 387 tests passed, 16 live skipped; application/test typechecks passed; full lint zero errors with 33 existing image warnings; production build 85/85 routes; browser harness passed all ten scenarios with zero audio/transcription requests and no unexpected mutations. These are not live speech-recognition tests.
