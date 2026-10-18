'use client';

import React, { useState } from 'react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { Eye, Keyboard, Smartphone, Sun, MessageSquare } from 'lucide-react';

export default function AccessibilityPage() {
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-8 py-10 sm:py-16">
        {/* Header */}
        <div className="mb-10 pb-6 border-b border-hairline">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-soft-stone border border-hairline text-xs font-bold uppercase tracking-wider text-muted-ink mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Digital Inclusion · WCAG 2.1 Level AA</span>
          </div>

          <h1 className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.06]">
            Accessibility Commitment
          </h1>

          <p className="text-sm sm:text-base text-muted-ink mt-3 max-w-2xl leading-relaxed font-normal">
            Nestly is designed to be usable by everyone, regardless of physical ability, device hardware constraints, or ambient outdoor sunlight conditions in Southern Nigeria.
          </p>
        </div>

        {/* Core Accessibility Pillars */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-2xs space-y-2">
            <div className="flex items-center gap-3 text-primary font-bold text-base">
              <Keyboard className="w-5 h-5 text-emerald-600" />
              <h2 className="font-headline text-lg font-bold text-charcoal">Keyboard Navigation &amp; Visible Focus</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
              Every interactive element—including navigation drawers, filter pills, property cards, and date pickers—can be operated using standard keyboard Tab, Shift+Tab, and Enter keys. High-visibility solid focus rings indicate the active cursor location without subtle glows.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-2xs space-y-2">
            <div className="flex items-center gap-3 text-primary font-bold text-base">
              <Eye className="w-5 h-5 text-emerald-600" />
              <h2 className="font-headline text-lg font-bold text-charcoal">Contrast &amp; High-Legibility Typography</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
              We pair deep neutral Charcoal (<code>#202320</code>) against tactile Warm White paper grounds (<code>#FCFBF8</code>), delivering contrast ratios exceeding 7:1 for body text (far surpassing the 4.5:1 WCAG AA baseline). Secondary text maintains strict minimum 4.5:1 ratios.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-2xs space-y-2">
            <div className="flex items-center gap-3 text-primary font-bold text-base">
              <Smartphone className="w-5 h-5 text-emerald-600" />
              <h2 className="font-headline text-lg font-bold text-charcoal">Touch Ergonomics &amp; Hit Target Bounds</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
              Mobile touch controls and buttons feature a strict minimum bounding target of 44x44px. Critical actions (such as booking inspections and saving homes) are positioned for natural one-handed thumb reachability on 390px mobile viewports.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-2xs space-y-2">
            <div className="flex items-center gap-3 text-primary font-bold text-base">
              <Sun className="w-5 h-5 text-emerald-600" />
              <h2 className="font-headline text-lg font-bold text-charcoal">Daytime Viewing Clarity</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
              Nigerian field operatives frequently view properties outdoors in intense tropical sunlight. To prevent washed-out screens, cards and tables utilize crisp 1px structural outlines (<code>#E5E2DA</code>) rather than fuzzy low-opacity drop shadows.
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-hairline shadow-2xs space-y-2">
            <div className="flex items-center gap-3 text-primary font-bold text-base">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <h2 className="font-headline text-lg font-bold text-charcoal">Conversational Alternative via Nia</h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
              For users with visual or motor limitations who find complex filter grids challenging, our conversational assistant Nia provides a streamlined natural-language alternative to discover homes and schedule walkthroughs directly.
            </p>
          </div>
        </div>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
