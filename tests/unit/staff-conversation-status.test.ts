import { describe, expect, it } from 'vitest';
import {
  getAiOwnershipNotice,
  getConversationChannelNotice,
  getDeliveryLabel,
} from '@/lib/staff-conversation-status';
import { isTwilioMessageSid } from '@/lib/twilio-message-sid';

describe('staff conversation status labels', () => {
  it('keeps website chat status separate from Twilio', () => {
    expect(getConversationChannelNotice({
      channel: 'website',
      whatsappDispatchAvailable: true,
      whatsappOutboundEnabled: true,
      whatsappSendConfigured: true,
      whatsappStatusCallbackConfigured: true,
    })).toContain('Twilio configuration and provider delivery do not apply');
  });

  it('reports WhatsApp configuration, feature state, and unverified delivery separately', () => {
    const notice = getConversationChannelNotice({
      channel: 'whatsapp',
      whatsappDispatchAvailable: true,
      whatsappOutboundEnabled: false,
      whatsappSendConfigured: true,
      whatsappStatusCallbackConfigured: true,
    });
    expect(notice).toContain('Twilio REST configured');
    expect(notice).toContain('staff send flag disabled by deployment flag');
    expect(notice).toContain('status callback URL configured');
    expect(notice).toContain('Live delivery verification remains unconfirmed');
  });

  it('does not claim Nia is disconnected or conflate AI ownership with delivery', () => {
    expect(getAiOwnershipNotice('website')).toContain('ownership does not confirm delivery');
    expect(getAiOwnershipNotice('whatsapp')).toContain('WF01 handles inbound AI replies');
    expect(getAiOwnershipNotice('telegram')).toContain('Telegram');
  });

  it('requires provider-message evidence before labeling a queued WhatsApp message accepted', () => {
    expect(getDeliveryLabel('queued', 'whatsapp', 'not_applicable', false))
      .toBe('WhatsApp queued; provider acceptance unverified');
    expect(getDeliveryLabel('queued', 'whatsapp', 'accepted', true))
      .toBe('Twilio accepted; delivery pending');
  });

  it.each([
    ['null provider ID', null, false],
    ['Nia internal key', 'nia:synthetic-reply-key', false],
    ['handoff internal key', 'handoff:synthetic-reply-key', false],
    ['malformed SID', 'SMnot-a-valid-sid', false],
    ['valid Twilio SID', `SM${'a'.repeat(32)}`, true],
  ] as const)('validates %s as provider evidence', (_label, providerId, isValid) => {
    expect(isTwilioMessageSid(providerId)).toBe(isValid);
    expect(getDeliveryLabel(
      'queued',
      'whatsapp',
      'not_applicable',
      isTwilioMessageSid(providerId),
    )).toBe(isValid
      ? 'Twilio accepted; delivery pending'
      : 'WhatsApp queued; provider acceptance unverified');
  });

  it('preserves explicit pending and unknown no-resend states', () => {
    expect(getDeliveryLabel('queued', 'whatsapp', 'dispatching', false))
      .toBe('Twilio outcome pending; do not resend');
    expect(getDeliveryLabel('queued', 'whatsapp', 'unknown', false))
      .toBe('Twilio outcome unknown; do not resend');
  });

  it('keeps Telegram API acceptance distinct from delivery and read confirmation', () => {
    expect(getConversationChannelNotice({
      channel: 'telegram',
      whatsappDispatchAvailable: true,
      whatsappOutboundEnabled: true,
      whatsappSendConfigured: true,
      whatsappStatusCallbackConfigured: true,
      telegramDispatchAvailable: true,
      telegramOutboundEnabled: false,
      telegramSendConfigured: true,
      telegramWebhookSecretConfigured: true,
    })).toContain('staff sending disabled by default flag');
    expect(getDeliveryLabel('sent', 'telegram', 'accepted', false))
      .toBe('Telegram API accepted; delivery/read unconfirmed');
    expect(getDeliveryLabel('queued', 'telegram', 'unknown', false))
      .toBe('Telegram send outcome unknown; do not resend');
  });
});
