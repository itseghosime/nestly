import twilio from 'twilio';
import { describe, expect, it } from 'vitest';
import {
  buildTwilioStatusCallbackUrl,
  parseTwilioFormParams,
  validateTwilioSignature,
} from '@/lib/backend/twilio-webhook';

const AUTH_TOKEN = 'synthetic-only-status-token';
const CALLBACK_BASE = 'https://nestly.example.test/api/twilio/whatsapp/status';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';

describe('Twilio status callback signature inputs', () => {
  it('validates the exact configured HTTPS URL, message query, and full form payload', () => {
    const callbackUrl = buildTwilioStatusCallbackUrl(CALLBACK_BASE, MESSAGE_ID);
    expect(callbackUrl).toBe(`${CALLBACK_BASE}?message_id=${MESSAGE_ID}`);
    if (!callbackUrl) throw new Error('Expected a valid synthetic callback URL');

    const body = new URLSearchParams({
      AccountSid: `AC${'1'.repeat(32)}`,
      MessageSid: `SM${'2'.repeat(32)}`,
      MessageStatus: 'delivered',
      ErrorCode: '',
    }).toString();
    const params = parseTwilioFormParams(body);
    const signature = twilio.getExpectedTwilioSignature(AUTH_TOKEN, callbackUrl, params);

    expect(validateTwilioSignature(AUTH_TOKEN, signature, callbackUrl, params)).toBe(true);
    expect(validateTwilioSignature(
      AUTH_TOKEN,
      signature,
      `${CALLBACK_BASE}?message_id=11111111-1111-4111-8111-111111111111`,
      params,
    )).toBe(false);
    expect(validateTwilioSignature(
      AUTH_TOKEN,
      signature,
      callbackUrl,
      { ...params, MessageStatus: 'read' },
    )).toBe(false);
  });

  it('rejects callback bases that are not exact public HTTPS route URLs', () => {
    expect(buildTwilioStatusCallbackUrl(
      'http://localhost:3000/api/twilio/whatsapp/status',
      MESSAGE_ID,
    )).toBeNull();
    expect(buildTwilioStatusCallbackUrl(
      'https://localhost/api/twilio/whatsapp/status',
      MESSAGE_ID,
    )).toBeNull();
    expect(buildTwilioStatusCallbackUrl(
      'https://192.168.1.5/api/twilio/whatsapp/status',
      MESSAGE_ID,
    )).toBeNull();
    expect(buildTwilioStatusCallbackUrl(
      `${CALLBACK_BASE}?message_id=untrusted`,
      MESSAGE_ID,
    )).toBeNull();
    expect(buildTwilioStatusCallbackUrl(
      'https://nestly.example.test/api/twilio/whatsapp/other',
      MESSAGE_ID,
    )).toBeNull();
  });
});
