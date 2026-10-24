import { env, pipeline } from "./runtime-v3.8.1/transformers.min.js";
// Audio never enters fetch: only model/runtime GET/HEAD downloads are permitted in this worker.
const nativeFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
  const method = (
    init?.method || (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    self.location.href,
  );
  if (
    !["GET", "HEAD"].includes(method) ||
    init?.body ||
    (url.origin !== self.location.origin &&
      url.origin !== "https://huggingface.co")
  ) {
    return Promise.reject(
      new Error("Only speech-model downloads are allowed."),
    );
  }
  return nativeFetch(input, init);
};
env.allowLocalModels = false;
env.useBrowserCache = true;
env.useFSCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = new URL(
  "./runtime-v3.8.1/",
  self.location.href,
).href;
let loading;
let busy = false;
async function getTranscriber(id) {
  if (!loading) {
    const files = new Map();
    loading = pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      {
        revision: "2575352d61be1bf7225cf8f8b268a4678025fc58",
        device: "wasm",
        dtype: "q8",
        progress_callback: (data) => {
          if (data.status !== "progress") return;
          files.set(data.file, {
            loaded: Number(data.loaded) || 0,
            total: Number(data.total) || 0,
          });
          const totals = [...files.values()].reduce(
            (a, b) => ({
              loaded: a.loaded + b.loaded,
              total: a.total + b.total,
            }),
            { loaded: 0, total: 0 },
          );
          self.postMessage({
            id,
            type: "progress",
            progress: totals.total
              ? Math.min(99, Math.floor((100 * totals.loaded) / totals.total))
              : null,
          });
        },
      },
    ).catch((error) => {
      loading = null;
      throw error;
    });
  }
  return loading;
}
self.onmessage = async ({ data }) => {
  if (
    !data ||
    !Number.isSafeInteger(data.id) ||
    !["load", "transcribe"].includes(data.type)
  )
    return;
  const { id, type } = data;
  if (busy) {
    self.postMessage({ id, type: "error" });
    return;
  }
  busy = true;
  try {
    if (
      type === "transcribe" &&
      (!(data.audio instanceof Float32Array) ||
        !data.audio.length ||
        data.audio.length > 16000 * 60 ||
        data.audio.some((x) => !Number.isFinite(x)))
    )
      throw new Error("Invalid recording.");
    const transcriber = await getTranscriber(id);
    if (type === "load") self.postMessage({ id, type: "ready" });
    else {
      const result = await transcriber(data.audio, {
        chunk_length_s: 25,
        stride_length_s: 3,
        return_timestamps: false,
        max_new_tokens: 256,
      });
      const text = Array.isArray(result)
        ? result.map((x) => x.text).join(" ")
        : result.text;
      if (typeof text !== "string") throw new Error("Missing text.");
      self.postMessage({
        id,
        type: "result",
        text: text.trim().slice(0, 4000),
      });
    }
  } catch {
    self.postMessage({ id, type: "error" });
  } finally {
    busy = false;
  }
};
