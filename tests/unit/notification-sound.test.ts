import { describe, expect, it, vi } from 'vitest';

describe('staff notification sound preference', () => {
  it('persists enabled and disabled states in browser storage', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    vi.resetModules();
    const {
      isNotificationSoundEnabled,
      setNotificationSoundEnabled,
    } = await import('@/lib/notification-sound');

    setNotificationSoundEnabled(true);
    expect(isNotificationSoundEnabled()).toBe(true);
    setNotificationSoundEnabled(false);
    expect(isNotificationSoundEnabled()).toBe(false);
  });
});
