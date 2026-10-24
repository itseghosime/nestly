export type SpeechState = "idle" | "requesting" | "recording" | "transcribing";
export interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onresult:
    | ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type SpeechConstructor = new () => BrowserSpeechRecognition;
export function getSpeechConstructor(scope: unknown): SpeechConstructor | null {
  const value = scope as {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  const ctor = value?.SpeechRecognition || value?.webkitSpeechRecognition;
  return typeof ctor === "function" ? ctor : null;
}
/** Browser manages audio processing; Nestly receives text events only. No audio file/HTTP transport. */
export class BrowserSpeechSession {
  private rec: BrowserSpeechRecognition | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private wantsListening = false;
  private completed = "";
  private current = "";
  private generation = 0;
  constructor(
    private ctor: SpeechConstructor,
    private callbacks: {
      state: (state: SpeechState) => void;
      text: (text: string) => void;
      error: (message: string) => void;
    },
  ) {}
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private detach() {
    const rec = this.rec;
    this.rec = null;
    if (rec) {
      rec.onstart = null;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {}
    }
  }
  cancel() {
    this.active = false;
    this.wantsListening = false;
    this.generation++;
    this.clearTimer();
    this.detach();
    this.completed = "";
    this.current = "";
  }
  private finish(message = "") {
    if (!this.active) return;
    const text = [this.completed, this.current]
      .filter(Boolean)
      .join(" ")
      .trim();
    this.cancel();
    this.callbacks.state("idle");
    if (text) this.callbacks.text(text);
    if (message) this.callbacks.error(message);
    else if (!text)
      this.callbacks.error(
        "No speech was detected. Please try again or type your message.",
      );
  }
  start() {
    if (this.active) return;
    this.active = true;
    this.wantsListening = true;
    this.completed = "";
    this.current = "";
    this.callbacks.error("");
    this.openSession();
  }
  private openSession() {
    if (!this.active || !this.wantsListening) return;
    const seq = ++this.generation;
    this.callbacks.state("requesting");
    try {
      const rec = new this.ctor();
      this.rec = rec;
      rec.lang = "en-GB";
      rec.continuous = true;
      rec.interimResults = true;
      // Permit the browser's existing online service; never request a local model pack.
      if ("processLocally" in rec) rec.processLocally = false;
      rec.onstart = () => {
        if (seq !== this.generation || !this.active) return;
        this.clearTimer();
        this.callbacks.state("recording");
      };
      rec.onresult = (event) => {
        if (seq !== this.generation || !this.active) return;
        // Results are cumulative within a browser session: replace, do not append duplicates.
        this.current = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ")
          .trim();
      };
      rec.onerror = (event) => {
        if (seq !== this.generation || !this.active) return;
        if (event.error === "no-speech") return; // Normal silence: onend resumes listening.
        const message =
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "Microphone access was denied. Allow it in your browser, or type your message."
            : "Speech recognition stopped. Check your connection, try again, or type your message.";
        this.finish(message);
      };
      rec.onend = () => {
        if (seq !== this.generation || !this.active) return;
        this.clearTimer();
        if (!this.wantsListening) {
          this.finish();
          return;
        }
        // Resume after a browser-imposed session end, preserving recognized text once.
        this.completed = [this.completed, this.current]
          .filter(Boolean)
          .join(" ");
        this.current = "";
        this.detach();
        this.generation++;
        this.callbacks.state("recording");
        this.timer = setTimeout(() => {
          this.timer = null;
          this.openSession();
        }, 200);
      };
      this.timer = setTimeout(
        () =>
          this.finish(
            "Microphone access timed out. Please try again or type your message.",
          ),
        15000,
      );
      rec.start();
    } catch {
      this.finish(
        "Speech recognition is unavailable in this browser. You can type your message instead.",
      );
    }
  }
  stop() {
    if (!this.active) return;
    this.wantsListening = false;
    this.clearTimer();
    if (!this.rec) {
      this.finish();
      return;
    }
    this.callbacks.state("transcribing");
    this.timer = setTimeout(() => this.finish(), 5000);
    try {
      this.rec.stop();
    } catch {
      this.finish();
    }
  }
}
