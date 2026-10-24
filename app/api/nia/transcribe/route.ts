import { NextResponse } from "next/server";
import {
  assertSameOrigin,
  guardPublicRequest,
} from "@/lib/backend/public-request";
import {
  transcribeNiaRecording,
  voiceTranscriptionUrl,
} from "@/lib/backend/voice-transcription";
import {
  hasVoiceFileSignature,
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
  normalizeVoiceMime,
} from "@/lib/voice-recording";
export const runtime = "nodejs";
export function GET() {
  return NextResponse.json(
    { enabled: Boolean(voiceTranscriptionUrl()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const originFailure = assertSameOrigin(request);
  if (originFailure) return originFailure;
  if (!voiceTranscriptionUrl())
    return NextResponse.json(
      {
        error:
          "Voice transcription is currently unavailable. You can type your message.",
      },
      { status: 503 },
    );
  const rateFailure = await guardPublicRequest(
    request,
    "nia-voice-transcription",
    { maxRequests: 5, windowSeconds: 60 },
  );
  if (rateFailure) return rateFailure;
  const contentType = request.headers.get("content-type") || "";
  if (
    !contentType.startsWith("multipart/form-data;") ||
    contentType.length > 300
  )
    return NextResponse.json(
      { error: "Invalid recording upload." },
      { status: 400 },
    );
  const limit = MAX_VOICE_BYTES + 65536;
  if (Number(request.headers.get("content-length")) > limit)
    return NextResponse.json(
      { error: "Recording is too large. Please record a shorter message." },
      { status: 413 },
    );
  try {
    if (!request.body)
      return NextResponse.json(
        { error: "No recording was received." },
        { status: 400 },
      );
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          await reader.cancel();
          return NextResponse.json(
            { error: "Recording is too large." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": contentType },
    }).formData();
    const audio = form.get("audio");
    const durationSeconds = Number(form.get("durationSeconds"));
    if (
      !(audio instanceof File) ||
      audio.size === 0 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > MAX_VOICE_SECONDS
    )
      return NextResponse.json(
        { error: "Please record a message of up to 60 seconds." },
        { status: 400 },
      );
    if (audio.size > MAX_VOICE_BYTES)
      return NextResponse.json(
        { error: "Recording is too large." },
        { status: 413 },
      );
    const mime = normalizeVoiceMime(audio.type);
    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (!mime || !hasVoiceFileSignature(bytes, mime))
      return NextResponse.json(
        { error: "This audio format is not supported. Please record again." },
        { status: 415 },
      );
    const text = await transcribeNiaRecording(bytes, mime, durationSeconds, {
      signal: request.signal,
    });
    return NextResponse.json(
      { text },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof Error && error.message === "NO_SPEECH")
      return NextResponse.json(
        {
          error:
            "No speech was detected. Please try again or type your message.",
        },
        { status: 422 },
      );
    return NextResponse.json(
      {
        error:
          "We couldn’t transcribe that recording. Please try again or type your message.",
      },
      { status: 502 },
    );
  }
}
