# Nia browser Whisper voice-to-text

Replaces native SpeechRecognition with quantized Whisper Tiny English, running in a Web Worker using single-thread WebAssembly. No audio-upload API, transcription provider, API key, n8n edit or database migration is involved.

## User steps

1. Open Nia and click **Record voice message**. No model download or microphone access occurs before that click.
2. First use downloads the engine/model, with a preparation progress message. Runtime files come from Nestly and model files from Hugging Face. The browser can cache them; private browsing or cache eviction can require another download.
3. Allow the microphone and speak for up to 60 seconds.
4. Click **Stop recording**. Microphone tracks release immediately. Audio is downsampled to 16 kHz locally and transferred to the worker through postMessage.
5. Review/edit the text appended to the existing draft, then click **Send**. Nothing auto-sends.

Cancel discards the current recording. Closing/minimizing Nia releases the microphone/audio graph, terminates model work and ignores late replies. Failed inference offers Retry using the same PCM in browser memory; it does not reopen the microphone. Samples are cleared on success/cancel/close. No file is created or saved to chat/database. Silent clips are rejected before inference. Typing remains available on unsupported devices or after a failure. Chat text remains 14px.

## Privacy and compatibility

The model receives a Float32Array, not a remotely hosted audio URL. The worker's fetch wrapper only permits GET/HEAD downloads from the site or huggingface.co; it cannot POST/PUT recordings. Model retrieval may redirect to Hugging Face's file CDN and reveals normal network metadata such as IP address, but does not send microphone samples. No microphone audio is logged or persisted. The ordinary chat endpoint receives text only after explicit Send.

Requires HTTPS/localhost, Worker, WebAssembly, AudioContext, AudioWorkletNode and getUserMedia. Native browser SpeechRecognition is no longer needed. Real iPhone/Safari microphone behavior, memory pressure and Nigerian accent/location-name accuracy remain device acceptance checks; do not promise universal support or speed on weaker phones. First-use downloads can be sizable, and local inference consumes CPU/battery. Transcripts can be wrong: review before sending.

Model: onnx-community/whisper-tiny.en, q8, revision 2575352d61be1bf7225cf8f8b268a4678025fc58. Runtime: @huggingface/transformers 3.8.1, WASM, one thread (does not require SharedArrayBuffer). Bounds: 60-second audio, 4,000-character transcript, 180-second load timeout and 90-second inference timeout. There is no remote recognition fallback.

## Development and deployment

npm ci installs the pinned dependency. npm run dev/build run scripts/prepare-voice-runtime.mjs first to copy the package's standalone browser JS, WASM, module and license into ignored public/voice/runtime-v3.8.1/. These assets are served statically; no model or inference code runs in a Next server function. Weights download only after Record is clicked. No binary/model cache is committed. Normal Vercel Git deployment requires no new environment setting.

Rollback by reverting the Whisper PR; prior native dictation and typed chat return. No provider or database cleanup is needed.

## Verification evidence

Local full suite: 392 passed, 16 live tests skipped; app/test typechecks and production build (85/85 routes) passed. Unit coverage includes resampling, duration/sample bounds, silence, worker correlation, cancellation/errors/timeouts and preserving retry PCM.

scripts/test-nia-voice-browser.mjs runs a loopback production build with synthetic PCM and a fake worker. Eleven scenarios pass: click-only activation; record/edit/manual Send; cancel recording; cancel model preparation; cancel inference/ignore late reply; permission denial; retry without microphone; silence; 60-second auto-stop; close cleanup; unsupported-device typing. External requests are blocked; zero audio-upload requests and unexpected mutations are permitted. No actual microphone or screenshots/videos are used.

scripts/test-whisper-engine.mjs tests the actual shipped model/runtime against a supplied public/synthetic WAV. Set VOICE_TEST_WAV, optionally VOICE_TEST_EXPECT and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. The local browser uses only GET/HEAD network requests. A public JFK sample from Hugging Face docs produced “my fellow Americans” correctly: initial load 30,131 ms, inference 2,143 ms, zero network writes. This is local test-machine evidence, not a Production/mobile SLA or accent acceptance result. The fixture/cache are not committed.

References: https://huggingface.co/docs/transformers.js/ and https://huggingface.co/onnx-community/whisper-tiny.en . No customer/provider message, Production form, real microphone recording, screenshot, video or migration was initiated by verification.
