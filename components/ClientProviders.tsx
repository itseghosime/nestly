'use client';

import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SavedHomesProvider } from '@/lib/saved-homes-context';
import { PropertyTransitionProvider } from '@/lib/property-transition-context';
import { consumeListingScrollPosition } from '@/lib/motion';

function ScrollRestorationManager() {
  const pathname = usePathname();

  useEffect(() => {
    const saved = consumeListingScrollPosition(pathname);
    if (saved && saved.scrollY > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved.scrollY, behavior: 'instant' as ScrollBehavior });
      });
    }
  }, [pathname]);

  return null;
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <SavedHomesProvider>
      <PropertyTransitionProvider>
        <ScrollRestorationManager />
        {children}
      </PropertyTransitionProvider>
    </SavedHomesProvider>
  );
}
