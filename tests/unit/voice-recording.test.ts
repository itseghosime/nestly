import { describe, expect, it } from "vitest";
import {
  appendVoiceTranscript,
  resampleVoiceAudio,
  hasVoiceSignal,
} from "@/lib/voice-recording";
describe("private browser audio preprocessing", () => {
  it("converts a 48 kHz signal to the 16 kHz model input without changing its amplitude", () => {
    const audio = resampleVoiceAudio(new Float32Array(48000).fill(0.25), 48000);
    expect(audio).toHaveLength(16000);
    expect([...audio].every((x) => x === 0.25)).toBe(true);
  });
  it("preserves 16 kHz samples and downsamples non-integer ratios", () => {
    expect([
      ...resampleVoiceAudio(new Float32Array([0.1, 0.2]), 16000),
    ]).toEqual([...new Float32Array([0.1, 0.2])]);
    expect(
      resampleVoiceAudio(new Float32Array(44100).fill(0.5), 44100),
    ).toHaveLength(16000);
  });
  it("rejects unsafe audio and excludes silence", () => {
    expect(() => resampleVoiceAudio(new Float32Array([NaN]), 16000)).toThrow();
    expect(() => resampleVoiceAudio(new Float32Array(960001), 16000)).toThrow();
    expect(() => resampleVoiceAudio(new Float32Array([1]), 8000)).toThrow();
    expect(hasVoiceSignal(new Float32Array(160))).toBe(false);
    expect(hasVoiceSignal(new Float32Array(160).fill(0.02))).toBe(true);
  });
  it("appends reviewable text and bounds the existing draft", () => {
    expect(appendVoiceTranscript(" Hello ", " two bedrooms ")).toBe(
      "Hello two bedrooms",
    );
    expect(appendVoiceTranscript("a".repeat(3998), "hello")).toHaveLength(4000);
  });
});
