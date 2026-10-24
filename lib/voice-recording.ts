export const MAX_VOICE_SECONDS = 60;
export const MAX_VOICE_BYTES = 2 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARACTERS = 4000;
export const VOICE_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
] as const;
export type VoiceMimeType = (typeof VOICE_MIME_TYPES)[number];
export function normalizeVoiceMime(value: string): VoiceMimeType | null {
  const type = value.toLowerCase().split(";")[0].trim();
  return VOICE_MIME_TYPES.includes(type as VoiceMimeType)
    ? (type as VoiceMimeType)
    : null;
}
export function chooseVoiceMime(
  isSupported: (type: string) => boolean,
): string | undefined {
  return [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/webm",
  ].find(isSupported);
}
export function hasVoiceFileSignature(
  bytes: Uint8Array,
  type: VoiceMimeType,
): boolean {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (type === "audio/webm")
    return (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  if (type === "audio/mp4") return ascii(4, 4) === "ftyp";
  if (type === "audio/ogg") return ascii(0, 4) === "OggS";
  if (type === "audio/wav")
    return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
  return (
    ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}
export function appendVoiceTranscript(draft: string, transcript: string) {
  return [draft.trim(), transcript.trim()]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_TRANSCRIPT_CHARACTERS);
}
