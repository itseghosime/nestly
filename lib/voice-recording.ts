export const MAX_VOICE_SECONDS = 60;
export const MAX_TRANSCRIPT_CHARACTERS = 4000;
export const VOICE_LANGUAGE = "en-US";
export interface LocalSpeechRecognition {
  processLocally: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export interface LocalSpeechConstructor {
  new (): LocalSpeechRecognition;
  prototype: LocalSpeechRecognition;
  available(options: {
    langs: string[];
    processLocally: true;
  }): Promise<string>;
  install?(options: {
    langs: string[];
    processLocally: true;
  }): Promise<boolean>;
}
/** Deliberately never use webkitSpeechRecognition or an online recognition fallback. */
export function getLocalSpeechConstructor(
  scope: unknown,
): LocalSpeechConstructor | null {
  const candidate = (scope as { SpeechRecognition?: LocalSpeechConstructor })
    ?.SpeechRecognition;
  return typeof candidate === "function" &&
    "processLocally" in candidate.prototype &&
    typeof candidate.available === "function"
    ? candidate
    : null;
}
export function appendVoiceTranscript(draft: string, transcript: string) {
  return [draft.trim(), transcript.trim()]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_TRANSCRIPT_CHARACTERS);
}
