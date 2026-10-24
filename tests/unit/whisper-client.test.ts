import { afterEach, describe, expect, it, vi } from "vitest";
import { WhisperClient } from "@/lib/whisper-client";
function fixture() {
  const fake = {
    onmessage: null as ((event: { data: object }) => void) | null,
    onerror: null as (() => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  const client = new WhisperClient(() => fake as unknown as Worker);
  return { client, fake, emit: (data: object) => fake.onmessage?.({ data }) };
}
afterEach(() => vi.useRealTimers());
describe("local Whisper worker transport", () => {
  it("sends PCM only to the worker and preserves retry samples", async () => {
    const f = fixture(),
      audio = new Float32Array([0.2, 0.3]);
    const result = f.client.run("transcribe", audio);
    const message = f.fake.postMessage.mock.calls[0][0];
    expect(message.audio).not.toBe(audio);
    expect([...message.audio]).toEqual([...audio]);
    expect(message.type).toBe("transcribe");
    f.emit({ id: message.id + 1, type: "result", text: "wrong job" });
    f.emit({ id: message.id, type: "result", text: "two bedrooms" });
    expect(await result).toBe("two bedrooms");
    f.client.dispose();
  });
  it("reports download progress and completes loading", async () => {
    const f = fixture(),
      progress = vi.fn(),
      result = f.client.run("load", undefined, progress);
    f.emit({ id: 1, type: "progress", progress: 20 });
    f.emit({ id: 1, type: "ready" });
    expect(await result).toBe("");
    expect(progress).toHaveBeenCalledWith(20);
    f.client.dispose();
  });
  it("rejects pending and future jobs after cancellation", async () => {
    const f = fixture(),
      result = f.client.run("load");
    const check = expect(result).rejects.toThrow();
    f.client.dispose();
    await check;
    expect(f.fake.terminate).toHaveBeenCalledTimes(1);
    await expect(f.client.run("load")).rejects.toThrow();
  });
  it("terminates hung inference and rejects worker failures", async () => {
    vi.useFakeTimers();
    const f = fixture(),
      result = f.client.run("transcribe", new Float32Array([1]));
    const check = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(90000);
    await check;
    expect(f.fake.terminate).toHaveBeenCalled();
    const g = fixture(),
      pending = g.client.run("load"),
      failure = expect(pending).rejects.toThrow();
    g.fake.onerror?.();
    await failure;
  });
});
