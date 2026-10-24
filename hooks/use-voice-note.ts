"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chooseVoiceMime,
  MAX_VOICE_BYTES,
  MAX_VOICE_SECONDS,
} from "@/lib/voice-recording";
export function useVoiceNote({
  enabled,
  onTranscript,
}: {
  enabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<
    "idle" | "requesting" | "recording" | "transcribing"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const clip = useRef<{ audio: Blob; duration: number } | null>(null);
  const callback = useRef(onTranscript);
  useEffect(() => {
    callback.current = onTranscript;
  }, [onTranscript]);
  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);
  const release = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    if (recorder.current && recorder.current.state !== "inactive")
      recorder.current.stop();
    recorder.current = null;
    cleanup();
    clip.current = null;
  }, [cleanup]);
  const cancel = useCallback(() => {
    release();
    setCanRetry(false);
    setState("idle");
    setSeconds(0);
    setError("");
  }, [release]);
  useEffect(() => {
    let active = true;
    fetch("/api/nia/transcribe")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active) {
          setSupported(
            Boolean(
              window.MediaRecorder && navigator.mediaDevices?.getUserMedia,
            ),
          );
          setAvailable(data?.enabled === true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
      release();
    };
  }, [release]);
  useEffect(() => {
    if (!enabled) {
      release();
      const seq = generation.current;
      queueMicrotask(() => {
        if (seq === generation.current) {
          setCanRetry(false);
          setState("idle");
          setSeconds(0);
          setError("");
        }
      });
    }
  }, [enabled, release]);
  const transcribe = useCallback(
    async (audio: Blob, duration: number, seq: number) => {
      if (seq !== generation.current) return;
      clip.current = { audio, duration };
      setState("transcribing");
      setError("");
      setCanRetry(false);
      const abort = new AbortController();
      controller.current = abort;
      try {
        const form = new FormData();
        form.set("audio", audio, "recording");
        form.set("durationSeconds", String(duration));
        const response = await fetch("/api/nia/transcribe", {
          method: "POST",
          body: form,
          signal: abort.signal,
        });
        const data = await response.json();
        if (!response.ok || typeof data.text !== "string" || !data.text.trim())
          throw new Error(
            data.error || "No speech was detected. Please try again.",
          );
        if (seq !== generation.current) return;
        callback.current(data.text);
        clip.current = null;
        setCanRetry(false);
      } catch (e) {
        if (seq !== generation.current || abort.signal.aborted) return;
        setError(
          e instanceof Error
            ? e.message
            : "Unable to transcribe. Please try again.",
        );
        setCanRetry(true);
      } finally {
        if (seq === generation.current) {
          setState("idle");
          controller.current = null;
        }
      }
    },
    [],
  );
  const start = useCallback(async () => {
    if (!enabled || !supported || !available || state !== "idle") return;
    const seq = ++generation.current;
    setState("requesting");
    setError("");
    clip.current = null;
    setCanRetry(false);
    setSeconds(0);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (seq !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mimeType = chooseVoiceMime((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000,
      });
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      let size = 0;
      const started = Date.now();
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          size += e.data.size;
          if (size <= MAX_VOICE_BYTES) chunks.push(e.data);
          else {
            setError("Recording is too large. Please try a shorter message.");
            generation.current++;
            rec.stop();
            cleanup();
            setState("idle");
          }
        }
      };
      rec.onerror = () => {
        if (seq !== generation.current) return;
        generation.current++;
        cleanup();
        setState("idle");
        setError("Recording stopped unexpectedly. Please try again.");
      };
      rec.onstop = () => {
        cleanup();
        recorder.current = null;
        if (seq !== generation.current) return;
        const audio = new Blob(chunks, {
          type: rec.mimeType || mimeType || "audio/webm",
        });
        const duration = Math.min(
          MAX_VOICE_SECONDS,
          Math.max(0.1, (Date.now() - started) / 1000),
        );
        if (!audio.size) {
          setState("idle");
          setError("No audio was recorded. Please try again.");
          return;
        }
        void transcribe(audio, duration, seq);
      };
      rec.start(250);
      setState("recording");
      timer.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - started) / 1000);
        setSeconds(Math.min(elapsed, MAX_VOICE_SECONDS));
        if (elapsed >= MAX_VOICE_SECONDS && rec.state === "recording")
          rec.stop();
      }, 250);
    } catch (e) {
      if (seq !== generation.current) return;
      cleanup();
      setState("idle");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser, or type your message."
          : "Your microphone is unavailable. You can type your message instead.",
      );
    }
  }, [enabled, supported, available, state, cleanup, transcribe]);
  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);
  const retry = useCallback(() => {
    const saved = clip.current;
    if (enabled && saved)
      void transcribe(saved.audio, saved.duration, ++generation.current);
  }, [enabled, transcribe]);
  return {
    supported,
    available,
    state,
    seconds,
    error,
    canRetry,
    start,
    stop,
    cancel,
    retry,
    isBusy: state !== "idle",
  };
}
