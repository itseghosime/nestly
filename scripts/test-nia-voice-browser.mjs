// Local-only UI verification with a fake browser speech service. No real microphone/provider.
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
      starts: 0,
      stops: 0,
      aborts: 0,
      deny: false,
      text: "two-bedroom apartment in GRA",
      delay: 0,
      offset: 0,
    };
    const now = Date.now;
    Date.now = () => now() + window.voiceTest.offset;
    window.Worker = class {
      constructor() {
        throw new Error("No model worker should be created");
      }
    };
    window.webkitSpeechRecognition = class {
      processLocally = true;
      start() {
        window.voiceTest.starts++;
        window.recognition = this;
        queueMicrotask(() => {
          if (window.voiceTest.deny) {
            this.onerror?.({ error: "not-allowed" });
            return;
          }
          if (this.processLocally !== false)
            throw new Error("No downloaded pack permitted");
          this.onstart?.();
          this.onresult?.({
            results: [{ 0: { transcript: window.voiceTest.text } }],
          });
        });
      }
      stop() {
        window.voiceTest.stops++;
        const end = this.onend;
        setTimeout(() => end?.(), window.voiceTest.delay);
      }
      abort() {
        window.voiceTest.aborts++;
      }
    };
    window.SpeechRecognition = undefined;
  });
  let sends = 0,
    uploads = 0,
    models = 0,
    sentText = "";
  async function intercept(route) {
    const req = route.request(),
      url = new URL(req.url());
    if (url.pathname.includes("transcribe")) uploads++;
    if (url.pathname.startsWith("/voice/") || url.hostname === "huggingface.co")
      models++;
    if (url.origin !== origin) {
      await route.abort();
      return;
    }
    if (url.pathname === "/api/nia/conversations/messages") {
      sends++;
      sentText = req.postDataJSON().content;
      await route.fulfill({
        json: {
          data: {
            mode: "AI_ACTIVE",
            message: "Synthetic reply",
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
      if (req.method() !== "GET") {
        throw Error("Unexpected mutation");
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
      page.getByRole("button", { name: "Record voice message", exact: true }),
    stop = () =>
      page.getByRole("button", { name: "Stop recording", exact: true }),
    cancel = () =>
      page.getByRole("button", { name: "Cancel voice input", exact: true }),
    input = () =>
      page
        .getByRole("dialog", { name: "Nia Property Assistant" })
        .locator("input");
  await mic().waitFor();
  assert.equal(await page.evaluate(() => window.voiceTest.starts), 0);
  await input().fill("Hi Nia");
  await mic().click();
  await stop().waitFor();
  await input().press("Enter");
  assert.equal(sends, 0);
  await page.evaluate(() => (window.voiceTest.offset += 120000));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.voiceTest.stops), 0);
  assert.equal(await stop().count(), 1);
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
  await mic().click();
  await stop().waitFor();
  await cancel().click();
  assert.equal(await input().inputValue(), "Keep draft");
  await page.evaluate(() => (window.voiceTest.delay = 600));
  await mic().click();
  await stop().click();
  await page
    .locator('[role="status"]')
    .filter({ hasText: "Finishing… Review the text before sending." })
    .waitFor();
  await cancel().click();
  await page.waitForTimeout(700);
  assert.equal(await input().inputValue(), "Keep draft");
  await page.evaluate(() => (window.voiceTest.delay = 0));
  await mic().click();
  await stop().waitFor();
  const starts = await page.evaluate(() => window.voiceTest.starts);
  await page.evaluate(() => {
    window.voiceTest.text = "near GRA";
    window.recognition.onend();
  });
  await page.waitForFunction((n) => window.voiceTest.starts > n, starts);
  await stop().waitFor();
  assert.equal(await input().inputValue(), "Keep draft");
  await stop().click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value ===
      "Keep draft two-bedroom apartment in GRA near GRA",
  );
  await input().fill("");
  await page.evaluate(() => (window.voiceTest.text = ""));
  await mic().click();
  await stop().waitFor();
  const before = await page.evaluate(() => window.voiceTest.starts);
  await page.evaluate(() => {
    window.recognition.onerror({ error: "no-speech" });
    window.recognition.onend();
  });
  await page.waitForFunction((n) => window.voiceTest.starts > n, before);
  await stop().waitFor();
  await cancel().click();
  await page.evaluate(() => (window.voiceTest.deny = true));
  await mic().click();
  await page
    .getByText(
      "Microphone access was denied. Allow it in your browser, or type your message.",
      { exact: true },
    )
    .waitFor();
  await cancel().click();
  await page.evaluate(() => {
    window.voiceTest.deny = false;
    window.voiceTest.text = "a".repeat(5000);
  });
  await mic().click();
  await stop().waitFor();
  await stop().click();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="dialog"] input')?.value.length === 5000,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Send message to Nia", exact: true })
      .isDisabled(),
    true,
  );
  await input().fill("Short enough");
  assert.equal(
    await page
      .getByRole("button", { name: "Send message to Nia", exact: true })
      .isEnabled(),
    true,
  );
  await mic().click();
  await stop().waitFor();
  const aborts = await page.evaluate(() => window.voiceTest.aborts);
  await page
    .getByRole("button", { name: "Close Nia assistant", exact: true })
    .click();
  await page.waitForFunction((n) => window.voiceTest.aborts > n, aborts);
  const unsupported = await browser.newPage();
  await unsupported.route("**/*", intercept);
  await unsupported.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
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
  assert.equal(uploads, 0);
  assert.equal(models, 0);
  assert.equal(sends, 1);
  console.log(
    JSON.stringify({
      environment: "local production build, fake browser speech service",
      scenarios: 11,
      passed: true,
      modelRequests: models,
      audioUploadRequestsFromApp: uploads,
      realMicrophoneUsed: false,
    }),
  );
} catch (e) {
  console.error(log.slice(-1000));
  throw e;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
