// Ship the pinned browser runtime as same-origin assets. Model weights are downloaded on demand.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { mkdir, copyFile, readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("@huggingface/transformers"));
const metadata = JSON.parse(
  await readFile(resolve(dist, "../package.json"), "utf8"),
);
if (metadata.version !== "3.8.1")
  throw new Error("Review the voice runtime version before upgrading.");
const target = resolve("public/voice/runtime-v3.8.1");
await mkdir(target, { recursive: true });
for (const file of [
  "transformers.min.js",
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
])
  await copyFile(resolve(dist, file), resolve(target, file));
await copyFile(
  resolve(dist, "../LICENSE"),
  resolve(target, "LICENSE-transformers"),
);
console.log("Prepared local Whisper browser runtime (3.8.1).");
