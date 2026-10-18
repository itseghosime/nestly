'use client';

import React, { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { NiaWidget } from '@/components/public/NiaWidget';
import { MOTION, prefersReducedMotion } from '@/lib/motion';
import {
  HelpCircle,
  Search,
  X,
  Plus,
} from 'lucide-react';

interface FAQItem {
  id: string;
  category: 'inspections' | 'fees' | 'utilities' | 'nia' | 'landlords';
  question: string;
  answer: string;
}

const FAQS: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'inspections',
    question: 'Do I need an account to browse properties or book an inspection?',
    answer: 'No. You can freely explore verified daylight photos, inspect transparent fee sheets, and bookmark properties directly in your browser without creating an account or password. We only request basic contact details when booking a physical accompanied walkthrough.',
  },
  {
    id: 'faq-2',
    category: 'inspections',
    question: 'Are properties on Nestly physically verified in person?',
    answer: 'Yes. Every listing on Nestly is physically visited by an authorized field operations officer in Benin City or Delta State. We test water pressure from overhead tanks, check prepaid BEDC electricity distribution phases, verify flood history with neighbors, and inspect title deeds before any home is published.',
  },
  {
    id: 'faq-3',
    category: 'inspections',
    question: 'Is there an upfront "mobilization" or inspection fee?',
    answer: 'Zero upfront inspection fees. Unlike unregulated roadside agents who demand non-refundable registration charges to view properties, Nestly inspections are accompanied by staff at ₦0 charge.',
  },
  {
    id: 'faq-4',
    category: 'fees',
    question: 'How are the legal drafting and agency fees calculated?',
    answer: 'Nestly enforces strict statutory fee standards common to Edo and Delta states: 10% legal agreement drafting fee and 10% agency facilitation fee based on the annual base rent. Every naira is itemized on the listing page before you arrange a tour.',
  },
  {
    id: 'faq-5',
    category: 'fees',
    question: 'How do refundable caution deposits work?',
    answer: 'Caution deposits are held in dedicated trust by the verified landlord to cover tenant damages or unmetered utility debts. Under Nestly standard tenancy agreements, caution balances must be reconciled and refunded within 14 working days of vacant handover.',
  },
  {
    id: 'faq-6',
    category: 'utilities',
    question: 'What does "Inverter Pre-Cabling" and "Priority Feeder" mean?',
    answer: 'In Nigeria, electrical reliability varies widely by distribution feeder line. Properties marked "Priority Feeder" are connected to high-uptime commercial or government distribution lines (averaging 18-22 hrs daily). "Inverter Pre-Cabling" means changeover switches and battery distribution wiring are already integrated.',
  },
  {
    id: 'faq-7',
    category: 'utilities',
    question: 'How is clean water guaranteed in Sapele and Benin City?',
    answer: 'Our field officers verify that compounds possess dedicated submersible boreholes with functional automated pumping controls and multi-stage filtration vessels to ensure clean, odor-free domestic water supply.',
  },
  {
    id: 'faq-8',
    category: 'nia',
    question: 'Who is Nia and how does she help me?',
    answer: 'Nia is our autonomous AI property assistant. You can speak with Nia via WhatsApp or Web to quickly identify listings matching your commute, budget, or family needs. When you need physical coordination, Nia smoothly transfers notes to local field staff.',
  },
  {
    id: 'faq-9',
    category: 'landlords',
    question: 'How can property owners in Edo and Delta list with Nestly?',
    answer: 'Landlords can submit listings through our Submit Property portal. Our legal and vetting team performs a physical verification of the compound and confirms C-of-O/deed title within 24 to 48 hours before publication.',
  },
];

export default function FAQPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [openIds, setOpenIds] = useState<string[]>(['faq-1']);
  const [isNiaOpen, setIsNiaOpen] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredFaqs = useMemo(() => {
    return FAQS.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
      }
      return true;
    });
  }, [selectedCategory, searchTerm]);

  const toggleFaq = (id: string) => {
    setOpenIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        '[data-faq-hero]',
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: MOTION.duration.entrance,
          stagger: 0.06,
          ease: MOTION.ease.softOut,
          clearProps: 'transform,opacity',
        }
      );
    },
    { scope: pageRef }
  );

  useGSAP(
    () => {
      if (prefersReducedMotion() || !listRef.current) return;
      const items = listRef.current.querySelectorAll('[data-faq-item]');
      if (!items.length) return;
      gsap.fromTo(
        items,
        { y: 12, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.34,
          stagger: 0.04,
          ease: MOTION.ease.softOut,
          overwrite: 'auto',
          clearProps: 'transform,opacity',
        }
      );
    },
    { dependencies: [selectedCategory, searchTerm], scope: listRef }
  );

  return (
    <div ref={pageRef} className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main className="flex-1 w-full">
        {/* Hero Header */}
        <section className="bg-soft-stone/70 border-b border-hairline py-12 sm:py-20 px-4 sm:px-8">
          <div className="max-w-[1240px] mx-auto">
            <div className="max-w-3xl space-y-4">
              <div data-faq-hero className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-hairline text-xs font-bold uppercase tracking-wider text-primary shadow-2xs">
                <HelpCircle className="w-4 h-4 text-primary" />
                <span>Help Center &amp; Frequent Questions</span>
              </div>

              <h1 data-faq-hero className="font-headline text-3xl sm:text-5xl font-extrabold tracking-tight text-charcoal leading-[1.06]">
                Clear answers for <span className="text-persimmon italic font-serif">Nigerian</span> renting.
              </h1>

              <p data-faq-hero className="text-sm sm:text-base text-muted-ink leading-relaxed max-w-2xl font-normal">
                Everything you need to know about inspections, itemized fee sheets, power realities, and communicating with Nia across Edo and Delta states.
              </p>

              {/* Search Bar */}
              <div data-faq-hero className="pt-4 max-w-xl">
                <div className="relative flex items-center bg-white rounded-full border border-hairline shadow-sm focus-within:ring-2 focus-within:ring-charcoal transition-shadow">
                  <Search className="w-5 h-5 text-muted-ink ml-4 shrink-0" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search questions (e.g. borehole, caution deposit, slot, Nia)..."
                    className="w-full bg-transparent px-3 py-3 text-xs sm:text-sm text-charcoal placeholder-muted-ink focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear question search"
                      className="mr-3 text-muted-ink hover:text-charcoal p-1 rounded-full hover:bg-soft-stone transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category Filter Pills */}
              <div data-faq-hero className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-2">
                {[
                  { id: 'all', label: 'All Questions' },
                  { id: 'inspections', label: 'Physical Inspections' },
                  { id: 'fees', label: 'Fee Transparency' },
                  { id: 'utilities', label: 'Power & Water' },
                  { id: 'nia', label: 'Nia Assistant' },
                  { id: 'landlords', label: 'Landlords' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`nestly-press px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-charcoal text-white shadow-xs'
                        : 'bg-white hover:bg-stone-card text-charcoal border border-hairline'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQs Accordion List */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 py-12 sm:py-16">
          <div ref={listRef} className="max-w-3xl space-y-4">
            {filteredFaqs.length > 0 ? (
              filteredFaqs.map((faq) => {
                const isOpen = openIds.includes(faq.id);
                return (
                  <div
                    key={faq.id}
                    data-faq-item
                    className="bg-white rounded-3xl border border-hairline shadow-2xs transition-colors overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(faq.id)}
                      aria-expanded={isOpen}
                      className="w-full p-5 sm:p-6 flex items-center justify-between text-left text-base sm:text-lg font-bold text-charcoal hover:bg-soft-stone/35 transition-colors cursor-pointer"
                    >
                      <span>{faq.question}</span>
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 ml-4 ${
                          isOpen
                            ? 'bg-persimmon text-white rotate-45'
                            : 'bg-soft-stone text-charcoal'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                      </span>
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                        isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-3 border-t border-hairline text-xs sm:text-sm text-muted-ink leading-relaxed font-normal">
                          {faq.answer}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div data-faq-item className="text-center py-12 bg-white rounded-3xl border border-hairline p-8">
                <p className="font-bold text-charcoal text-base mb-2">No matching questions found</p>
                <p className="text-xs text-muted-ink mb-4">
                  We couldn&apos;t find an answer matching &quot;{searchTerm}&quot;. Ask Nia for instant assistance.
                </p>
                <button
                  type="button"
                  onClick={() => setIsNiaOpen(true)}
                  className="nestly-press px-6 py-2.5 rounded-full bg-persimmon text-white text-xs font-bold hover:bg-persimmon-hover transition-colors"
                >
                  Ask Nia Directly
                </button>
              </div>
            )}
          </div>

          {/* Bottom Card */}
          <div className="mt-16 bg-soft-stone rounded-3xl p-6 sm:p-10 border border-hairline max-w-3xl flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="font-headline text-lg sm:text-xl font-bold text-charcoal">
                Still have questions about a specific residence?
              </h3>
              <p className="text-xs sm:text-sm text-muted-ink mt-1">
                Our local operations desk in Benin City and Sapele is available Monday through Saturday.
              </p>
            </div>
            <Link
              href="/contact"
              className="nestly-press px-6 py-3 rounded-full bg-charcoal hover:bg-black text-white text-xs font-bold uppercase tracking-wider shrink-0 transition-colors shadow-2xs"
            >
              Contact Operations
            </Link>
          </div>
        </section>
      </main>

      <NiaWidget isOpenExternal={isNiaOpen} onCloseExternal={() => setIsNiaOpen(false)} />
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}
