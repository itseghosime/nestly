import { describe, expect, it } from "vitest";
import { appendVoiceTranscript } from "@/lib/voice-recording";
describe("reviewable voice text", () => {
  it("appends to the current draft and preserves long dictation for editing", () => {
    expect(appendVoiceTranscript(" Hello ", " two bedrooms ")).toBe(
      "Hello two bedrooms",
    );
    expect(appendVoiceTranscript("a".repeat(3998), "hello")).toHaveLength(4004);
  });
});
