// Opt-in local inference check with a public/synthetic WAV supplied by the caller. No microphone.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
if (!process.env.VOICE_TEST_WAV)
  throw new Error(
    "Provide VOICE_TEST_WAV with an approved public/synthetic test WAV.",
  );
const audio = await readFile(process.env.VOICE_TEST_WAV);
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end("<title>Local Whisper engine test</title>");
      return;
    }
    if (req.url === "/sample.wav") {
      res.setHeader("Content-Type", "audio/wav");
      res.end(audio);
      return;
    }
    const path = new URL(req.url, "http://localhost").pathname;
    if (!path.startsWith("/voice/") || path.includes("..")) throw new Error();
    const file = await readFile(resolve("public", "." + path));
    res.setHeader(
      "Content-Type",
      path.endsWith(".wasm") ? "application/wasm" : "text/javascript",
    );
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(3063, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ["--no-sandbox"],
    ...(process.env.HTTPS_PROXY
      ? {
          proxy: {
            server: process.env.HTTPS_PROXY,
            bypass: "127.0.0.1,localhost",
          },
        }
      : {}),
  });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  let writes = 0;
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) {
      writes++;
      await route.abort();
      return;
    }
    if (
      url.hostname !== "127.0.0.1" &&
      !["huggingface.co", "hf.co", "xethub.hf.co"].some(
        (host) => url.hostname === host || url.hostname.endsWith("." + host),
      )
    ) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  page.on("pageerror", (error) => console.error(error.message));
  page.on("requestfailed", (request) =>
    console.error(
      "Download failed",
      new URL(request.url()).hostname,
      request.failure()?.errorText,
    ),
  );
  await page.goto("http://127.0.0.1:3063");
  const result = await page.evaluate(async () => {
    const worker = new Worker("/voice/whisper-worker.mjs", { type: "module" });
    let next = 0;
    const request = (type, audio) =>
      new Promise((resolve, reject) => {
        const id = ++next,
          timeout = setTimeout(
            () => reject(new Error("Whisper engine timed out")),
            180000,
          );
        worker.onerror = (event) => {
          clearTimeout(timeout);
          reject(new Error(event.message));
        };
        worker.onmessage = ({ data }) => {
          if (data.id !== id || data.type === "progress") return;
          clearTimeout(timeout);
          if (data.type === "error") reject(new Error("Whisper engine failed"));
          else resolve(data.text);
        };
        worker.postMessage({ id, type, audio });
      });
    const started = performance.now();
    try {
      await request("load");
      const loadMs = Math.round(performance.now() - started);
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(
        await (await fetch("/sample.wav")).arrayBuffer(),
      );
      const offline = new OfflineAudioContext(
          1,
          Math.floor(decoded.duration * 16000),
          16000,
        ),
        source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const buffer = await offline.startRendering();
      await ctx.close();
      const inferenceStart = performance.now();
      const text = await request("transcribe", buffer.getChannelData(0));
      return {
        text,
        loadMs,
        inferenceMs: Math.round(performance.now() - inferenceStart),
      };
    } finally {
      worker.terminate();
    }
  });
  assert.equal(writes, 0);
  assert.ok(typeof result.text === "string" && result.text.trim());
  if (process.env.VOICE_TEST_EXPECT)
    assert.match(result.text, new RegExp(process.env.VOICE_TEST_EXPECT, "i"));
  console.log(
    JSON.stringify({
      environment:
        "local browser, real quantized Whisper/WASM, public synthetic fixture",
      ...result,
      networkWrites: writes,
      microphoneUsed: false,
    }),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
