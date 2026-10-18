import { describe, expect, it } from 'vitest';
import { NIA_TELEGRAM_URL } from '@/lib/contact-channels';

describe('Nia contact channels', () => {
  it('uses the fixed official Telegram bot destination', () => {
    expect(NIA_TELEGRAM_URL).toBe('https://t.me/nestly_nia_bot');
  });
});
