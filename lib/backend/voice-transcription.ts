import { randomUUID } from "node:crypto";
import {
  MAX_TRANSCRIPT_CHARACTERS,
  type VoiceMimeType,
} from "@/lib/voice-recording";
export function voiceTranscriptionUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.NIA_VOICE_ENABLED !== "true" || !env.NESTLY_WF01_RELAY_SECRET?.trim())
    return null;
  try {
    const url = new URL(env.NIA_N8N_WEBHOOK_URL || "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith("/nestly-nia-response")
    )
      return null;
    url.pathname = url.pathname.replace(
      /nestly-nia-response$/,
      "nestly-nia-transcribe",
    );
    return url.toString();
  } catch {
    return null;
  }
}
export async function transcribeNiaRecording(
  audio: Uint8Array,
  mimeType: VoiceMimeType,
  durationSeconds: number,
  options: {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const url = voiceTranscriptionUrl(env);
  if (!url) throw new Error("VOICE_UNAVAILABLE");
  const requestId = randomUUID();
  const timeout = AbortSignal.timeout(20000);
  const response = await (options.fetcher ?? fetch)(url, {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Nestly-Relay-Secret": env.NESTLY_WF01_RELAY_SECRET!,
    },
    body: JSON.stringify({
      version: 1,
      requestId,
      mimeType,
      durationSeconds,
      audioBase64: Buffer.from(audio).toString("base64"),
    }),
    signal: options.signal
      ? AbortSignal.any([timeout, options.signal])
      : timeout,
  });
  if (!response.ok || !response.body) throw new Error("VOICE_UNAVAILABLE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 24000) {
        await reader.cancel();
        throw new Error("INVALID_TRANSCRIPT");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (
    body?.version !== 1 ||
    body.requestId !== requestId ||
    typeof body.text !== "string" ||
    body.text.length > MAX_TRANSCRIPT_CHARACTERS ||
    /\x00/.test(body.text)
  )
    throw new Error("INVALID_TRANSCRIPT");
  const text = body.text.trim();
  if (!text) throw new Error("NO_SPEECH");
  return text;
}
