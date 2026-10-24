import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BrowserSpeechSession,
  getSpeechConstructor,
  type BrowserSpeechRecognition,
} from "@/lib/browser-speech";
class Recognition {
  static instances: Recognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  processLocally = true;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onresult: BrowserSpeechRecognition["onresult"] = null;
  onerror: ((e: { error: string }) => void) | null = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();
  constructor() {
    Recognition.instances.push(this);
  }
  result(...text: string[]) {
    this.onresult?.({
      results: text.map((transcript) => ({ 0: { transcript } })),
    });
  }
}
function setup() {
  const state = vi.fn(),
    text = vi.fn(),
    error = vi.fn();
  const session = new BrowserSpeechSession(Recognition, { state, text, error });
  session.start();
  return { session, state, text, error, rec: Recognition.instances[0] };
}
beforeEach(() => {
  vi.useFakeTimers();
  Recognition.instances = [];
});
afterEach(() => vi.useRealTimers());
describe("browser-managed speech recognition", () => {
  it("supports unprefixed and prefixed browsers without local model interfaces", () => {
    expect(getSpeechConstructor({ SpeechRecognition: Recognition })).toBe(
      Recognition,
    );
    expect(getSpeechConstructor({ webkitSpeechRecognition: Recognition })).toBe(
      Recognition,
    );
    expect(getSpeechConstructor({})).toBeNull();
  });
  it("permits browser service processing and enables continuous results", () => {
    const f = setup();
    expect(f.rec.processLocally).toBe(false);
    expect(f.rec.continuous).toBe(true);
    f.session.cancel();
  });
  it("does not stop at 60 seconds or after an hour while service is active", async () => {
    const f = setup();
    await vi.advanceTimersByTimeAsync(3600000);
    expect(f.rec.stop).not.toHaveBeenCalled();
    expect(f.text).not.toHaveBeenCalled();
    f.session.cancel();
  });
  it("replaces cumulative results and emits reviewable text only after Stop", () => {
    const f = setup();
    f.rec.result("two");
    f.rec.result("two bedrooms");
    expect(f.text).not.toHaveBeenCalled();
    f.session.stop();
    expect(f.text).toHaveBeenCalledExactlyOnceWith("two bedrooms");
  });
  it("resumes browser session endings and preserves all segments once", async () => {
    const f = setup();
    f.rec.result("two bedrooms");
    f.rec.onend?.();
    await vi.advanceTimersByTimeAsync(250);
    const next = Recognition.instances[1];
    expect(next.start).toHaveBeenCalled();
    next.result("in GRA");
    f.session.stop();
    expect(f.text).toHaveBeenCalledExactlyOnceWith("two bedrooms in GRA");
  });
  it("resumes silence instead of ending dictation", async () => {
    const f = setup();
    f.rec.onerror?.({ error: "no-speech" });
    f.rec.onend?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(Recognition.instances).toHaveLength(2);
    expect(f.text).not.toHaveBeenCalled();
    f.session.cancel();
  });
  it("Stop during restart ends the session without starting another microphone", async () => {
    const f = setup();
    f.rec.result("GRA");
    f.rec.onend?.();
    f.session.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(Recognition.instances).toHaveLength(1);
    expect(f.text).toHaveBeenCalledExactlyOnceWith("GRA");
  });
  it("cancel discards dictated text and ignores delayed callbacks", () => {
    const f = setup();
    f.rec.result("discard");
    const late = f.rec.onresult;
    f.session.cancel();
    late?.({ results: [{ 0: { transcript: "late" } }] });
    expect(f.text).not.toHaveBeenCalled();
    expect(f.rec.abort).toHaveBeenCalled();
  });
  it("preserves interim text if the browser fails to emit end after Stop", async () => {
    const f = setup();
    f.rec.stop.mockImplementation(() => {});
    f.rec.result("saved words");
    f.session.stop();
    await vi.advanceTimersByTimeAsync(5100);
    expect(f.text).toHaveBeenCalledExactlyOnceWith("saved words");
  });
  it("does not truncate or stop long speech at the chat message-size boundary", () => {
    const f = setup(),
      long = "a".repeat(5000);
    f.rec.result(long);
    expect(f.rec.stop).not.toHaveBeenCalled();
    f.session.stop();
    expect(f.text).toHaveBeenCalledExactlyOnceWith(long);
  });
  it("surfaces service/permission errors without automatic repeated prompts", async () => {
    const f = setup();
    f.rec.onerror?.({ error: "not-allowed" });
    await vi.advanceTimersByTimeAsync(20000);
    expect(f.error).toHaveBeenCalledWith(expect.stringContaining("denied"));
    expect(Recognition.instances).toHaveLength(1);
  });
});
