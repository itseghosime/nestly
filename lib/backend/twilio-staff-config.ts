import { buildTwilioStatusCallbackUrl } from '@/lib/backend/twilio-webhook';

export type TwilioStaffSendConfiguration = {
  accountSid: string;
  authToken: string;
  from: string;
  callbackBase: string;
};

export function normalizeWhatsAppAddress(value: string): string | null {
  const phone = value.startsWith('whatsapp:') ? value.slice('whatsapp:'.length) : value;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? `whatsapp:${phone}` : null;
}

export function getTwilioStaffSendSettings() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const callbackBase = process.env.TWILIO_STATUS_CALLBACK_URL;
  const siteUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const statusCallbackConfigured = Boolean(
    callbackBase
    && buildTwilioStatusCallbackUrl(callbackBase, '00000000-0000-4000-8000-000000000000'),
  );
  const configured = Boolean(
    accountSid
    && /^AC[0-9A-Fa-f]{32}$/.test(accountSid)
    && authToken
    && from
    && normalizeWhatsAppAddress(from)
    && statusCallbackConfigured
    && siteUrl
    && serviceRoleKey,
  );

  return {
    enabled: process.env.TWILIO_OUTBOUND_ENABLED === 'true',
    configured,
    statusCallbackConfigured,
    configuration: configured
      ? { accountSid: accountSid!, authToken: authToken!, from: from!, callbackBase: callbackBase! }
      : null,
  };
}
