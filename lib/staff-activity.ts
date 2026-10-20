'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type Activity = { attentionCount: number; unreadNotifications: number };

export function useStaffActivity() {
  const pathname = usePathname();
  const [activity, setActivity] = useState<Activity | null>(null);
  useEffect(() => {
    let active = true;
    let current: AbortController | undefined;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      current?.abort();
      const controller = new AbortController();
      current = controller;
      try {
        const response = await fetch('/api/staff/activity', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Activity unavailable');
        const { data } = await response.json();
        if (!Number.isSafeInteger(data?.attentionCount) || data.attentionCount < 0
          || !Number.isSafeInteger(data?.unreadNotifications) || data.unreadNotifications < 0) {
          throw new Error('Invalid activity');
        }
        if (active && !controller.signal.aborted) setActivity(data);
      } catch {
        if (active && !controller.signal.aborted) setActivity(null);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('staff-activity-changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      current?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('staff-activity-changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [pathname]);
  return activity;
}
