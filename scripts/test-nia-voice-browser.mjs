// Loopback-only UI regression with synthetic microphone PCM and a fake local Whisper worker.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3058";
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3058",
  ],
  {
    env: {
      ...process.env,
      NIA_N8N_ENABLED: "false",
      TELEGRAM_OUTBOUND_ENABLED: "false",
      TELEGRAM_HANDOFF_CHAT_ID: "",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let log = "",
  browser;
server.stdout.on("data", (x) => (log += x));
server.stderr.on("data", (x) => (log += x));
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.voiceTest = {
      microphones: 0,
      stops: 0,
      workers: 0,
      terminates: 0,
      deny: false,
      fail: false,
      loadDelay: 0,
      resultDelay: 0,
      offset: 0,
      inferences: 0,
      silence: false,
    };
    const now = Date.now;
    Date.now = () => now() + window.voiceTest.offset;
    window.SpeechRecognition = undefined;
    window.Worker = class {
      constructor() {
        window.voiceTest.workers++;
      }
      postMessage(data) {
        const callback = (event) => this.onmessage?.({ data: event });
        if (data.type === "load") {
          callback({ id: data.id, type: "progress", progress: 42 });
          setTimeout(
            () => callback({ id: data.id, type: "ready" }),
            window.voiceTest.loadDelay,
          );
        } else {
          window.voiceTest.inferences++;
          setTimeout(() => {
            const fail = window.voiceTest.fail;
            window.voiceTest.fail = false;
            callback({
              id: data.id,
              type: fail ? "error" : "result",
              text: "two-bedroom apartment in GRA",
            });
          }, window.voiceTest.resultDelay);
        }
      }
      terminate() {
        window.voiceTest.terminates++;
      }
    };
    window.AudioContext = class {
      sampleRate = 48000;
      destination = {};
      audioWorklet = { addModule: async () => {} };
      async resume() {}
      async close() {}
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
    };
    window.AudioWorkletNode = class {
      port = { onmessage: null };
      connect() {
        this.timer = setInterval(
          () =>
            this.port.onmessage?.({
              data: new Float32Array(4800).fill(
                window.voiceTest.silence ? 0 : 0.1,
              ),
            }),
          20,
        );
      }
      disconnect() {
        clearInterval(this.timer);
      }
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.voiceTest.microphones++;
          if (window.voiceTest.deny)
            throw new DOMException("Denied", "NotAllowedError");
          return {
            getTracks: () => [{ stop: () => window.voiceTest.stops++ }],
          };
        },
      },
    });
  });
  let sends = 0,
    audioRequests = 0,
    unexpectedMutations = 0,
    sentText = "";
  async function intercept(route) {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.includes("transcribe")) audioRequests++;
    if (url.origin !== origin) {
      await route.abort();
      return;
    }
    if (url.pathname === "/api/nia/conversations/messages") {
      sends++;
      sentText = request.postDataJSON().content;
      await route.fulfill({
        json: {
          data: {
            mode: "AI_ACTIVE",
            message: "Synthetic saved response",
            properties: [],
          },
        },
      });
      return;
    }
    if (url.pathname === "/api/nia/conversations") {
      await route.fulfill({ json: { data: null } });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (request.method() !== "GET") {
        unexpectedMutations++;
        await route.abort();
        return;
      }
      await route.fulfill({ json: { data: [], total: 0 } });
      return;
    }
    await route.continue();
  }
  await page.route("**/*", intercept);
  await page.goto(origin);
  await page
    .getByRole("button", { name: "Open Nia Property Assistant", exact: true })
    .click();
  const mic = () =>
    page.getByRole("button", { name: "Record voice message", exact: true });
  const stop = () =>
    page.getByRole("button", { name: "Stop recording", exact: true });
  const cancel = () =>
    page.getByRole("button", { name: "Cancel recording", exact: true });
  const input = () =>
    page
      .getByRole("dialog", { name: "Nia Property Assistant" })
      .locator("input");
  const record = async () => {
    await mic().click();
    await stop().waitFor();
    await page.waitForTimeout(100);
  };
  await mic().waitFor();
  assert.equal(await page.evaluate(() => window.voiceTest.microphones), 0);
  assert.equal(await page.evaluate(() => window.voiceTest.workers), 0);
  await input().fill("Hi Nia");
  await record();
  await input().press("Enter");
  assert.equal(sends, 0);
  await stop().click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value ===
      "Hi Nia two-bedroom apartment in GRA",
  );
  assert.equal(sends, 0);
  await input().fill("Edited text only");
  await page
    .getByRole("button", { name: "Send message to Nia", exact: true })
    .click();
  await page.waitForTimeout(200);
  assert.equal(sends, 1);
  assert.equal(sentText, "Edited text only");
  await input().fill("Keep draft");
  await record();
  await cancel().click();
  assert.equal(await input().inputValue(), "Keep draft");
  await page.evaluate(() => (window.voiceTest.loadDelay = 800));
  const before = await page.evaluate(() => window.voiceTest.microphones);
  await mic().click();
  await page
    .getByText("Preparing speech model… 42%", { exact: true })
    .waitFor();
  await cancel().click();
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => window.voiceTest.microphones), before);
  await page.evaluate(() => (window.voiceTest.loadDelay = 0));
  await page.evaluate(() => (window.voiceTest.resultDelay = 600));
  await record();
  await stop().click();
  await page
    .getByText("Transcribing on your device… Review the text before sending.", {
      exact: true,
    })
    .waitFor();
  await cancel().click();
  await page.waitForTimeout(700);
  assert.equal(await input().inputValue(), "Keep draft");
  await page.evaluate(() => (window.voiceTest.resultDelay = 0));
  await page.evaluate(() => (window.voiceTest.deny = true));
  await mic().click();
  await page
    .getByText(
      "Microphone access was denied. Allow it in your browser, or type your message.",
      { exact: true },
    )
    .waitFor();
  await cancel().click();
  await page.evaluate(() => (window.voiceTest.deny = false));
  await page.evaluate(() => (window.voiceTest.fail = true));
  await record();
  await stop().click();
  await page
    .getByRole("button", { name: "Retry transcription", exact: true })
    .waitFor();
  const count = await page.evaluate(() => window.voiceTest.microphones);
  await page
    .getByRole("button", { name: "Retry transcription", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value ===
      "Keep draft two-bedroom apartment in GRA",
  );
  assert.equal(await page.evaluate(() => window.voiceTest.microphones), count);
  await input().fill("");
  await page.evaluate(() => (window.voiceTest.silence = true));
  await record();
  const inferences = await page.evaluate(() => window.voiceTest.inferences);
  await stop().click();
  await page
    .getByText(
      "No speech was detected. Please record again or type your message.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.voiceTest.inferences),
    inferences,
  );
  await cancel().click();
  await page.evaluate(() => (window.voiceTest.silence = false));
  await record();
  await page.evaluate(() => (window.voiceTest.offset += 61000));
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value ===
      "two-bedroom apartment in GRA",
  );
  await record();
  const stops = await page.evaluate(() => window.voiceTest.stops);
  await page
    .getByRole("button", { name: "Close Nia assistant", exact: true })
    .click();
  await page.waitForFunction((n) => window.voiceTest.stops > n, stops);
  const unsupported = await browser.newPage();
  await unsupported.route("**/*", intercept);
  await unsupported.addInitScript(() => {
    window.AudioWorkletNode = undefined;
  });
  await unsupported.goto(origin);
  await unsupported
    .getByRole("button", { name: "Open Nia Property Assistant", exact: true })
    .click();
  await unsupported
    .getByRole("dialog", { name: "Nia Property Assistant" })
    .waitFor();
  assert.equal(
    await unsupported
      .getByRole("button", { name: "Record voice message", exact: true })
      .count(),
    0,
  );
  await unsupported
    .getByRole("dialog", { name: "Nia Property Assistant" })
    .locator("input")
    .fill("Typing still works");
  assert.equal(sends, 1);
  assert.equal(audioRequests, 0);
  assert.equal(unexpectedMutations, 0);
  console.log(
    JSON.stringify({
      environment: "local production build, synthetic PCM/Whisper worker",
      scenarios: 11,
      passed: true,
      audioUploadRequests: audioRequests,
      unexpectedMutations,
      microphoneUsed: false,
    }),
  );
} catch (error) {
  console.error(log.slice(-1000));
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
