// Local-only browser verification. Synthetic on-device recognizer; no real microphone/audio.
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
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox"],
        }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.voiceTest = {
      starts: 0,
      aborts: 0,
      deny: false,
      offset: 0,
      text: "two-bedroom apartment in GRA",
      availability: "available",
      installs: 0,
      delay: 0,
      localOnly: true,
    };
    const now = Date.now;
    Date.now = () => now() + window.voiceTest.offset;
    window.SpeechRecognition = class {
      static async available(options) {
        window.voiceTest.localOnly &&= options.processLocally === true;
        return window.voiceTest.availability;
      }
      static async install(options) {
        window.voiceTest.localOnly &&= options.processLocally === true;
        window.voiceTest.installs++;
        window.voiceTest.availability = "available";
        return true;
      }
      start() {
        window.voiceTest.starts++;
        window.voiceTest.localOnly &&= this.processLocally === true;
        queueMicrotask(() => {
          if (window.voiceTest.deny) this.onerror?.({ error: "not-allowed" });
          else this.onstart?.();
        });
      }
      stop() {
        setTimeout(() => {
          this.onresult?.({
            results: [
              { isFinal: true, 0: { transcript: window.voiceTest.text } },
            ],
          });
          this.onend?.();
        }, window.voiceTest.delay);
      }
      abort() {
        window.voiceTest.aborts++;
      }
    };
    Object.defineProperty(
      window.SpeechRecognition.prototype,
      "processLocally",
      { value: false, writable: true },
    );
  });
  let chatSends = 0,
    audioRequests = 0,
    unexpectedMutations = 0,
    sentText = "";
  async function intercept(r) {
    const request = r.request(),
      url = new URL(request.url());
    if (url.pathname.includes("transcribe")) audioRequests++;
    if (url.origin !== origin) {
      await r.abort();
      return;
    }
    if (url.pathname === "/api/nia/conversations/messages") {
      chatSends++;
      sentText = request.postDataJSON().content;
      await r.fulfill({
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
      await r.fulfill({ json: { data: null } });
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (request.method() !== "GET") {
        unexpectedMutations++;
        await r.abort();
        return;
      }
      await r.fulfill({ json: { data: [], total: 0 } });
      return;
    }
    await r.continue();
  }
  await page.route("**/*", intercept);
  await page.goto(origin);
  const open = () =>
    page
      .getByRole("button", { name: "Open Nia Property Assistant", exact: true })
      .click();
  const mic = () =>
    page.getByRole("button", { name: "Dictate message", exact: true });
  const stop = () =>
    page.getByRole("button", { name: "Stop dictation", exact: true });
  const cancel = () =>
    page.getByRole("button", { name: "Cancel dictation", exact: true });
  const input = () =>
    page
      .getByRole("dialog", { name: "Nia Property Assistant" })
      .locator("input");
  await open();
  await mic().waitFor();
  assert.equal(await page.evaluate(() => window.voiceTest.starts), 0);
  await input().fill("Hi Nia");
  await mic().click();
  await stop().waitFor();
  await input().press("Enter");
  assert.equal(chatSends, 0);
  await stop().click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value ===
      "Hi Nia two-bedroom apartment in GRA",
  );
  assert.equal(chatSends, 0);
  await input().fill("Edited text only");
  await page
    .getByRole("button", { name: "Send message to Nia", exact: true })
    .click();
  await page.waitForTimeout(200);
  assert.equal(sentText, "Edited text only");
  assert.equal(chatSends, 1);
  await input().fill("Keep draft");
  await mic().click();
  await stop().waitFor();
  await cancel().click();
  assert.equal(await input().inputValue(), "Keep draft");
  await page.evaluate(() => (window.voiceTest.delay = 600));
  await mic().click();
  await stop().click();
  await cancel().click();
  await page.waitForTimeout(750);
  assert.equal(await input().inputValue(), "Keep draft");
  await page.evaluate(() => {
    window.voiceTest.delay = 0;
    window.voiceTest.deny = true;
  });
  await mic().click();
  await page
    .getByText(
      "Microphone access was denied. Allow it in your browser, or type your message.",
      { exact: true },
    )
    .waitFor();
  assert.equal(await input().inputValue(), "Keep draft");
  await cancel().click();
  await page.evaluate(() => {
    window.voiceTest.deny = false;
    window.voiceTest.availability = "downloadable";
  });
  await mic().click();
  await stop().waitFor();
  assert.equal(await page.evaluate(() => window.voiceTest.installs), 1);
  await stop().click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value ===
      "Keep draft two-bedroom apartment in GRA",
  );
  await input().fill("");
  await mic().click();
  await stop().waitFor();
  await page.evaluate(() => (window.voiceTest.offset += 61000));
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value ===
      "two-bedroom apartment in GRA",
  );
  await mic().click();
  await stop().waitFor();
  const aborts = await page.evaluate(() => window.voiceTest.aborts);
  await page
    .getByRole("button", { name: "Close Nia assistant", exact: true })
    .click();
  await page.waitForFunction((n) => window.voiceTest.aborts > n, aborts);
  assert.equal(await page.evaluate(() => window.voiceTest.localOnly), true);
  const unsupported = await browser.newPage();
  await unsupported.route("**/*", intercept);
  await unsupported.addInitScript(() => {
    window.SpeechRecognition = class {};
    window.webkitSpeechRecognition = class {};
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
      .getByRole("button", { name: "Dictate message", exact: true })
      .count(),
    0,
  );
  await unsupported
    .getByRole("dialog", { name: "Nia Property Assistant" })
    .locator("input")
    .fill("Typing still works");
  assert.equal(audioRequests, 0);
  assert.equal(unexpectedMutations, 0);
  assert.equal(chatSends, 1);
  console.log(
    JSON.stringify({
      environment: "local production build, synthetic on-device speech API",
      passed: [
        "click-only permission",
        "text-edit-manual-send",
        "cancel listening",
        "ignore late transcript",
        "permission denial",
        "local language-pack installation",
        "60-second auto-stop",
        "close aborts recognition",
        "unsupported browsers retain typing",
        "local-only and zero audio requests",
      ],
      audioRequests,
      unexpectedMutations,
      realMicrophoneUsed: false,
    }),
  );
} catch (e) {
  console.error(log.slice(-1200));
  throw e;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
