import { describe, expect, it, vi } from "vitest";
import {
  appendVoiceTranscript,
  getLocalSpeechConstructor,
} from "@/lib/voice-recording";
describe("private on-device dictation", () => {
  it("refuses legacy or remote-only recognition", () => {
    expect(getLocalSpeechConstructor({})).toBeNull();
    class Legacy {
      static available = vi.fn();
    }
    expect(
      getLocalSpeechConstructor({
        SpeechRecognition: Legacy,
        webkitSpeechRecognition: Legacy,
      }),
    ).toBeNull();
    expect(
      getLocalSpeechConstructor({ webkitSpeechRecognition: Legacy }),
    ).toBeNull();
  });
  it("requires both local processing and availability support", () => {
    class Local {
      static available = vi.fn();
    }
    Object.defineProperty(Local.prototype, "processLocally", { value: false });
    expect(getLocalSpeechConstructor({ SpeechRecognition: Local })).toBe(Local);
    class MissingAvailability {}
    Object.defineProperty(MissingAvailability.prototype, "processLocally", {
      value: false,
    });
    expect(
      getLocalSpeechConstructor({ SpeechRecognition: MissingAvailability }),
    ).toBeNull();
  });
  it("appends editable text and bounds the draft", () => {
    expect(appendVoiceTranscript(" Hello ", " two bedrooms ")).toBe(
      "Hello two bedrooms",
    );
    expect(appendVoiceTranscript("a".repeat(3998), "hello")).toHaveLength(4000);
  });
});
