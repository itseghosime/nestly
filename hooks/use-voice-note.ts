"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLocalSpeechConstructor,
  MAX_TRANSCRIPT_CHARACTERS,
  MAX_VOICE_SECONDS,
  VOICE_LANGUAGE,
  type LocalSpeechRecognition,
} from "@/lib/voice-recording";

export function useVoiceNote({
  enabled,
  onTranscript,
}: {
  enabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<
    "idle" | "requesting" | "recording" | "transcribing"
  >("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recognizer = useRef<LocalSpeechRecognition | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const callback = useRef(onTranscript);
  useEffect(() => {
    callback.current = onTranscript;
  }, [onTranscript]);
  const clearTimers = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (watchdog.current) clearTimeout(watchdog.current);
    timer.current = null;
    watchdog.current = null;
  }, []);
  const release = useCallback(() => {
    generation.current++;
    clearTimers();
    const rec = recognizer.current;
    recognizer.current = null;
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* Already stopped. */
      }
    }
  }, [clearTimers]);
  const cancel = useCallback(() => {
    release();
    setState("idle");
    setSeconds(0);
    setError("");
  }, [release]);
  useEffect(() => {
    let active = true;
    const ctor = getLocalSpeechConstructor(window);
    if (ctor) {
      void ctor
        .available({ langs: [VOICE_LANGUAGE], processLocally: true })
        .then((value) => {
          if (active)
            setSupported(
              value === "available" ||
                (value === "downloadable" &&
                  typeof ctor.install === "function"),
            );
        })
        .catch(() => undefined);
    }
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
        if (generation.current === seq) {
          setState("idle");
          setSeconds(0);
          setError("");
        }
      });
    }
  }, [enabled, release]);
  const stop = useCallback(() => {
    const rec = recognizer.current;
    if (!rec) return;
    clearTimers();
    setState("transcribing");
    const seq = generation.current;
    watchdog.current = setTimeout(() => {
      if (generation.current !== seq) return;
      release();
      setState("idle");
      setError(
        "Speech recognition stopped. Please try again or type your message.",
      );
    }, 5000);
    rec.stop();
  }, [clearTimers, release]);
  const start = useCallback(async () => {
    if (!enabled || !supported || state !== "idle") return;
    const ctor = getLocalSpeechConstructor(window);
    if (!ctor) return;
    const seq = ++generation.current;
    setError("");
    setSeconds(0);
    setState("requesting");
    try {
      const options = {
        langs: [VOICE_LANGUAGE],
        processLocally: true as const,
      };
      const availability = await ctor.available(options);
      if (generation.current !== seq) return;
      if (availability !== "available") {
        // Only a language model is downloaded; microphone capture has not started.
        if (
          !["downloadable", "downloading"].includes(availability) ||
          !ctor.install ||
          !(await ctor.install(options))
        ) {
          throw new Error("local-unavailable");
        }
        if (generation.current !== seq) return;
        if ((await ctor.available(options)) !== "available")
          throw new Error("local-unavailable");
      }
      if (generation.current !== seq) return;
      const rec = new ctor();
      rec.processLocally = true;
      // Fail closed: no browser is allowed to silently choose a remote recognizer.
      if (rec.processLocally !== true) throw new Error("local-unavailable");
      rec.lang = VOICE_LANGUAGE;
      rec.continuous = true;
      rec.interimResults = false;
      let text = "";
      recognizer.current = rec;
      rec.onstart = () => {
        if (generation.current !== seq) return;
        clearTimers();
        setState("recording");
        const started = Date.now();
        timer.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - started) / 1000);
          setSeconds(Math.min(elapsed, MAX_VOICE_SECONDS));
          if (elapsed >= MAX_VOICE_SECONDS) stop();
        }, 250);
      };
      rec.onresult = (event) => {
        if (generation.current !== seq) return;
        text = Array.from(event.results)
          .filter((result) => result.isFinal)
          .map((result) => result[0].transcript)
          .join(" ")
          .slice(0, MAX_TRANSCRIPT_CHARACTERS);
      };
      rec.onerror = (event) => {
        if (generation.current !== seq) return;
        release();
        setState("idle");
        setError(
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone access was denied. Allow it in your browser, or type your message."
            : "On-device speech recognition is unavailable. Please try again or type your message.",
        );
      };
      rec.onend = () => {
        if (generation.current !== seq) return;
        clearTimers();
        recognizer.current = null;
        generation.current++;
        setState("idle");
        if (text.trim()) callback.current(text.trim());
        else
          setError(
            "No speech was detected. Please try again or type your message.",
          );
      };
      watchdog.current = setTimeout(() => {
        if (generation.current !== seq) return;
        release();
        setState("idle");
        setError(
          "Microphone access timed out. Please try again or type your message.",
        );
      }, 15000);
      rec.start();
    } catch {
      if (generation.current !== seq) return;
      release();
      setState("idle");
      setError(
        "On-device speech recognition is unavailable. You can type your message instead.",
      );
    }
  }, [enabled, supported, state, release, stop, clearTimers]);
  return {
    supported,
    state,
    seconds,
    error,
    start,
    stop,
    cancel,
    isBusy: state !== "idle",
  };
}
