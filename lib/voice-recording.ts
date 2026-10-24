export const MAX_VOICE_SECONDS = 60;
export const MAX_TRANSCRIPT_CHARACTERS = 4000;
export const VOICE_SAMPLE_RATE = 16000;
export function appendVoiceTranscript(draft: string, transcript: string) {
  return [draft.trim(), transcript.trim()]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_TRANSCRIPT_CHARACTERS);
}
/** Area-averaged mono downsampling. Only the returned samples enter the local worker. */
export function resampleVoiceAudio(
  input: Float32Array,
  sourceRate: number,
): Float32Array {
  if (
    !Number.isFinite(sourceRate) ||
    sourceRate < VOICE_SAMPLE_RATE ||
    sourceRate > 192000 ||
    !input.length ||
    input.length > sourceRate * MAX_VOICE_SECONDS ||
    input.some((x) => !Number.isFinite(x))
  )
    throw new Error("Invalid recording");
  const ratio = sourceRate / VOICE_SAMPLE_RATE;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = i * ratio,
      end = (i + 1) * ratio;
    let sum = 0;
    for (let j = Math.floor(start); j < Math.ceil(end); j++)
      sum += input[j] * (Math.min(j + 1, end) - Math.max(j, start));
    output[i] = sum / ratio;
  }
  return output;
}
export function hasVoiceSignal(samples: Float32Array) {
  if (!samples.length) return false;
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  return Math.sqrt(energy / samples.length) >= 0.0005;
}
