export const MAX_TRANSCRIPT_CHARACTERS = 4000;
// Preserve the entire dictation; the composer asks users to shorten oversized messages before Send.
export function appendVoiceTranscript(draft: string, transcript: string) {
  return [draft.trim(), transcript.trim()].filter(Boolean).join(" ");
}
