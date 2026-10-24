"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasVoiceSignal,
  MAX_VOICE_SECONDS,
  resampleVoiceAudio,
} from "@/lib/voice-recording";
import { WhisperClient } from "@/lib/whisper-client";
export function useVoiceNote({
  enabled,
  onTranscript,
}: {
  enabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<
    "idle" | "loading" | "requesting" | "recording" | "transcribing"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const callback = useRef(onTranscript);
  const client = useRef<WhisperClient | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const capture = useRef<AudioWorkletNode | null>(null);
  const source = useRef<MediaStreamAudioSourceNode | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const chunks = useRef<Float32Array[]>([]);
  const sampleCount = useRef(0);
  const saved = useRef<Float32Array | null>(null);
  const finishRecording = useRef<() => void>(() => {});
  useEffect(() => {
    callback.current = onTranscript;
  }, [onTranscript]);
  const stopCapture = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (capture.current) {
      capture.current.port.onmessage = null;
      capture.current.disconnect();
    }
    capture.current = null;
    source.current?.disconnect();
    source.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (context.current) void context.current.close().catch(() => undefined);
    context.current = null;
  }, []);
  const release = useCallback(() => {
    generation.current++;
    busy.current = false;
    stopCapture();
    client.current?.dispose();
    client.current = null;
    chunks.current = [];
    sampleCount.current = 0;
    saved.current = null;
  }, [stopCapture]);
  const cancel = useCallback(() => {
    release();
    setState("idle");
    setError("");
    setSeconds(0);
    setCanRetry(false);
    setProgress(null);
  }, [release]);
  useEffect(() => {
    queueMicrotask(() =>
      setSupported(
        Boolean(
          window.isSecureContext &&
            window.Worker &&
            window.WebAssembly &&
            window.AudioContext &&
            window.AudioWorkletNode &&
            navigator.mediaDevices?.getUserMedia,
        ),
      ),
    );
    return release;
  }, [release]);
  useEffect(() => {
    if (!enabled) {
      release();
      const seq = generation.current;
      queueMicrotask(() => {
        if (seq === generation.current) {
          setState("idle");
          setSeconds(0);
          setCanRetry(false);
          setError("");
          setProgress(null);
        }
      });
    }
  }, [enabled, release]);
  const transcribe = useCallback(async (audio: Float32Array, seq: number) => {
    if (generation.current !== seq) return;
    saved.current = audio;
    busy.current = true;
    setState("transcribing");
    setError("");
    setCanRetry(false);
    try {
      if (!client.current) {
        client.current = new WhisperClient();
        await client.current.run("load");
      }
      const text = await client.current.run("transcribe", audio);
      if (generation.current !== seq) return;
      if (!text.trim()) throw new Error("No speech detected");
      saved.current = null;
      callback.current(text.trim());
    } catch {
      if (generation.current !== seq) return;
      client.current?.dispose();
      client.current = null;
      setError(
        "Couldn’t transcribe that recording on this device. Retry, record a shorter message, or type instead.",
      );
      setCanRetry(true);
    } finally {
      if (generation.current === seq) {
        busy.current = false;
        setState("idle");
      }
    }
  }, []);
  const stop = useCallback(() => {
    if (!capture.current || !context.current) return;
    const rate = context.current.sampleRate,
      seq = generation.current;
    const samples = new Float32Array(sampleCount.current);
    let offset = 0;
    for (const chunk of chunks.current) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    chunks.current = [];
    sampleCount.current = 0;
    stopCapture();
    try {
      const audio = resampleVoiceAudio(samples, rate);
      if (!hasVoiceSignal(audio)) {
        busy.current = false;
        setState("idle");
        setError(
          "No speech was detected. Please record again or type your message.",
        );
        return;
      }
      void transcribe(audio, seq);
    } catch {
      busy.current = false;
      setState("idle");
      setError(
        "No speech was detected. Please record again or type your message.",
      );
    }
  }, [stopCapture, transcribe]);
  useEffect(() => {
    finishRecording.current = stop;
  }, [stop]);
  const start = useCallback(async () => {
    if (!enabled || !supported || busy.current) return;
    busy.current = true;
    const seq = ++generation.current;
    saved.current = null;
    setCanRetry(false);
    setError("");
    setSeconds(0);
    setProgress(null);
    setState("loading");
    try {
      // Create/resume in the click handler to respect Safari's audio activation requirement.
      const ctx = new AudioContext();
      context.current = ctx;
      await ctx.resume();
      if (generation.current !== seq) return;
      if (!client.current) client.current = new WhisperClient();
      await client.current.run("load", undefined, (value) => {
        if (generation.current === seq) setProgress(value);
      });
      if (generation.current !== seq) return;
      setState("requesting");
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      if (generation.current !== seq) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      await ctx.audioWorklet.addModule("/voice/capture-worklet.js");
      if (generation.current !== seq) return;
      const src = ctx.createMediaStreamSource(media),
        node = new AudioWorkletNode(ctx, "nia-capture");
      source.current = src;
      capture.current = node;
      chunks.current = [];
      sampleCount.current = 0;
      node.port.onmessage = ({ data }) => {
        if (generation.current !== seq || !(data instanceof Float32Array))
          return;
        const remaining =
          Math.floor(ctx.sampleRate * MAX_VOICE_SECONDS) - sampleCount.current;
        if (remaining > 0) {
          const chunk =
            data.length > remaining ? data.slice(0, remaining) : data;
          chunks.current.push(chunk);
          sampleCount.current += chunk.length;
        }
        if (sampleCount.current >= ctx.sampleRate * MAX_VOICE_SECONDS)
          finishRecording.current();
      };
      src.connect(node);
      node.connect(ctx.destination); // Worklet outputs silence.
      const started = Date.now();
      setState("recording");
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, MAX_VOICE_SECONDS));
        if (elapsed >= MAX_VOICE_SECONDS) finishRecording.current();
      }, 250);
    } catch (e) {
      if (generation.current !== seq) return;
      release();
      setState("idle");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser, or type your message."
          : "Voice transcription could not start. Check your connection for the speech-model download, or type your message.",
      );
    }
  }, [enabled, supported, release]);
  const retry = useCallback(() => {
    if (!enabled || busy.current || !saved.current) return;
    void transcribe(saved.current, ++generation.current);
  }, [enabled, transcribe]);
  return {
    supported,
    state,
    seconds,
    progress,
    error,
    canRetry,
    start,
    stop,
    cancel,
    retry,
    isBusy: state !== "idle",
  };
}
