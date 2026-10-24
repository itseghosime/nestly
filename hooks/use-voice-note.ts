"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrowserSpeechSession,
  getSpeechConstructor,
  type SpeechState,
} from "@/lib/browser-speech";
export function useVoiceNote({
  enabled,
  onTranscript,
}: {
  enabled: boolean;
  onTranscript: (text: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<SpeechState>("idle");
  const [error, setError] = useState("");
  const callback = useRef(onTranscript);
  const session = useRef<BrowserSpeechSession | null>(null);
  useEffect(() => {
    callback.current = onTranscript;
  }, [onTranscript]);
  const release = useCallback(() => {
    session.current?.cancel();
    session.current = null;
  }, []);
  const cancel = useCallback(() => {
    release();
    setState("idle");
    setError("");
  }, [release]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active)
        setSupported(
          Boolean(window.isSecureContext && getSpeechConstructor(window)),
        );
    });
    return () => {
      active = false;
      release();
    };
  }, [release]);
  useEffect(() => {
    if (!enabled) {
      release();
      let active = true;
      queueMicrotask(() => {
        if (active) {
          setState("idle");
          setError("");
        }
      });
      return () => {
        active = false;
      };
    }
  }, [enabled, release]);
  const start = useCallback(() => {
    if (!enabled || !supported || session.current) return;
    const ctor = getSpeechConstructor(window);
    if (!ctor) return;
    const current = new BrowserSpeechSession(ctor, {
      state: (value) => {
        setState(value);
        if (value === "idle") session.current = null;
      },
      text: (text) => callback.current(text),
      error: setError,
    });
    session.current = current;
    current.start();
  }, [enabled, supported]);
  const stop = useCallback(() => session.current?.stop(), []);
  return {
    supported,
    state,
    error,
    start,
    stop,
    cancel,
    isBusy: state !== "idle",
  };
}
