export const TWILIO_MESSAGE_SID_PATTERN = /^SM[0-9A-Fa-f]{32}$/;

export function isTwilioMessageSid(value: unknown): value is string {
  return typeof value === 'string' && TWILIO_MESSAGE_SID_PATTERN.test(value);
}
