export type StaffConversationStatus = {
  channel: 'website' | 'whatsapp' | 'telegram';
  whatsappDispatchAvailable: boolean;
  whatsappOutboundEnabled: boolean;
  whatsappSendConfigured: boolean;
  whatsappStatusCallbackConfigured: boolean;
  telegramDispatchAvailable?: boolean;
  telegramOutboundEnabled?: boolean;
  telegramSendConfigured?: boolean;
  telegramWebhookSecretConfigured?: boolean;
};

export function getTakeoverControlState(conversation: {
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE' | 'CLOSED';
  assignedStaffId: string | null;
  assignedStaff: string;
  isAssignedToCurrentStaff: boolean;
}): { label: string; disabled: boolean } {
  if (conversation.mode === 'CLOSED') {
    return { label: 'Conversation closed', disabled: true };
  }
  if (conversation.mode === 'AI_ACTIVE') {
    return { label: 'Take over', disabled: false };
  }
  if (!conversation.assignedStaffId) {
    return { label: 'Assign to me', disabled: false };
  }
  if (conversation.isAssignedToCurrentStaff) {
    return { label: 'Assigned to you', disabled: true };
  }
  return { label: 'Reassign to me', disabled: false };
}

export function getAiOwnershipNotice(channel: StaffConversationStatus['channel']): string {
  if (channel === 'website') {
    return 'Nia ownership is active for website chat. The app handles website responses; ownership does not confirm delivery.';
  }
  if (channel === 'telegram') {
    return 'Nia ownership is active for Telegram. The app handles grounded replies; Telegram API acceptance does not confirm delivery or reading.';
  }
  return 'Stored WhatsApp ownership is shown for historical context. WF01 is separate from this inbox and its inbound/TwiML behavior is not controlled here.';
}

export function getConversationChannelNotice(status: StaffConversationStatus): string {
  if (status.channel === 'website') {
    return 'Website chat uses the app conversation path; Twilio configuration and provider delivery do not apply.';
  }
  if (status.channel === 'telegram') {
    if (!status.telegramDispatchAvailable) return 'Telegram dispatch tracking is unavailable; do not send replies.';
    const sendConfiguration = status.telegramSendConfigured ? 'bot token configured' : 'bot token missing or invalid';
    const webhookSecret = status.telegramWebhookSecretConfigured ? 'webhook secret configured' : 'webhook secret missing';
    const sendGate = status.telegramOutboundEnabled ? 'staff sending enabled' : 'staff sending disabled by default flag';
    return `Telegram ${sendConfiguration}; ${webhookSecret}; ${sendGate}. Bot API acceptance is not delivery/read confirmation.`;
  }
  if (!status.whatsappOutboundEnabled) {
    return 'WhatsApp is deferred in this deployment. Historical messages remain readable; staff replies are disabled by the server-side flag. External inbound/TwiML behavior is not controlled here.';
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
  hasValidProviderMessageSid: boolean,
): string {
  if (channel === 'telegram') {
    if (dispatchStatus === 'unknown') return 'Telegram send outcome unknown; do not resend';
    if (dispatchStatus === 'dispatching') return 'Telegram send pending; do not resend';
    if (dispatchStatus === 'failed') return `Telegram send failed (${status})`;
    if (dispatchStatus === 'accepted' && status === 'sent') {
      return 'Telegram API accepted; delivery/read unconfirmed';
    }
    if (status === 'queued') return 'Telegram queued; API acceptance unverified';
    return `Telegram status unverified (${status})`;
  }
  if (channel === 'whatsapp') {
    if (dispatchStatus === 'unknown') return 'Twilio outcome unknown; do not resend';
    if (dispatchStatus === 'dispatching') return 'Twilio outcome pending; do not resend';
    if (dispatchStatus === 'failed') return `Twilio send failed (${status})`;
    if (!hasValidProviderMessageSid) {
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
