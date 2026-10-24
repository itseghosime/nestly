type Job = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  progress?: (value: number | null) => void;
  timeout: ReturnType<typeof setTimeout>;
};
/** PCM travels only over postMessage to this same-origin worker, never over HTTP. */
export class WhisperClient {
  private nextId = 0;
  private jobs = new Map<number, Job>();
  private worker: Worker;
  private disposed = false;
  constructor(
    createWorker = () =>
      new Worker("/voice/whisper-worker.mjs", { type: "module" }),
  ) {
    this.worker = createWorker();
    this.worker.onmessage = ({ data }) => {
      const job = this.jobs.get(data?.id);
      if (!job) return;
      if (data.type === "progress") {
        job.progress?.(
          typeof data.progress === "number" && Number.isFinite(data.progress)
            ? Math.max(0, Math.min(99, data.progress))
            : null,
        );
        return;
      }
      clearTimeout(job.timeout);
      this.jobs.delete(data.id);
      if (data.type === "ready") job.resolve("");
      else if (data.type === "result" && typeof data.text === "string")
        job.resolve(data.text.slice(0, 4000));
      else job.reject(new Error("Local transcription failed."));
    };
    this.worker.onerror = () => this.dispose();
    this.worker.onmessageerror = () => this.dispose();
  }
  run(
    type: "load" | "transcribe",
    audio?: Float32Array,
    progress?: (value: number | null) => void,
  ): Promise<string> {
    if (this.disposed)
      return Promise.reject(new Error("Speech engine stopped."));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => this.dispose(),
        type === "load" ? 180000 : 90000,
      );
      this.jobs.set(id, { resolve, reject, progress, timeout });
      try {
        // Transfer a copy so retry can reuse the local recording without requesting the microphone.
        const copy = audio?.slice();
        this.worker.postMessage(
          { id, type, ...(copy ? { audio: copy } : {}) },
          copy ? [copy.buffer] : [],
        );
      } catch {
        this.dispose();
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    for (const job of this.jobs.values()) {
      clearTimeout(job.timeout);
      job.reject(new Error("Speech engine stopped."));
    }
    this.jobs.clear();
  }
}
