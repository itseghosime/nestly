export type StaffConversationStatus = {
  channel: 'website' | 'whatsapp';
  whatsappDispatchAvailable: boolean;
  whatsappOutboundEnabled: boolean;
  whatsappSendConfigured: boolean;
  whatsappStatusCallbackConfigured: boolean;
};

export function getAiOwnershipNotice(channel: StaffConversationStatus['channel']): string {
  if (channel === 'website') {
    return 'Nia ownership is active for website chat. The app handles website responses; ownership does not confirm delivery.';
  }
  return 'Nia ownership is active for WhatsApp. WF01 handles inbound AI replies; staff REST sends and delivery callbacks are separate.';
}

export function getConversationChannelNotice(status: StaffConversationStatus): string {
  if (status.channel === 'website') {
    return 'Website chat uses the app conversation path; Twilio configuration and provider delivery do not apply.';
  }
  if (!status.whatsappDispatchAvailable) {
    return 'Twilio dispatch tracking is unavailable; provider delivery cannot be confirmed.';
  }

  const sendConfiguration = status.whatsappSendConfigured ? 'configured' : 'not fully configured';
  const sendGate = status.whatsappOutboundEnabled ? 'enabled' : 'disabled by deployment flag';
  const callbackConfiguration = status.whatsappStatusCallbackConfigured ? 'configured' : 'missing or invalid';
  return `Twilio REST ${sendConfiguration}; staff send flag ${sendGate}; status callback URL ${callbackConfiguration}. Live delivery verification remains unconfirmed.`;
}

export function getDeliveryLabel(
  status: string,
  channel: StaffConversationStatus['channel'],
  dispatchStatus: string,
  hasProviderMessageId: boolean,
): string {
  if (channel === 'whatsapp') {
    if (dispatchStatus === 'unknown') return 'Twilio outcome unknown; do not resend';
    if (dispatchStatus === 'dispatching') return 'Twilio outcome pending; do not resend';
    if (dispatchStatus === 'failed') return `Twilio send failed (${status})`;
    if (!hasProviderMessageId) {
      return status === 'queued'
        ? 'WhatsApp queued; provider acceptance unverified'
        : `WhatsApp ${status} recorded; provider status unverified`;
    }
    if (status === 'read') return 'WhatsApp: read (provider status recorded)';
    if (status === 'delivered') return 'WhatsApp: delivered (provider status recorded)';
    if (status === 'sent') return 'Twilio sent; recipient delivery not confirmed';
    if (status === 'queued') return 'Twilio accepted; delivery pending';
    return `WhatsApp: ${status}`;
  }
  if (status === 'queued') return 'Website chat: saved; awaiting customer receipt';
  if (status === 'delivered') return 'Website chat: delivered';
  if (status === 'sent') return 'Website chat: delivery unverified';
  return `Website chat: ${status}`;
}
