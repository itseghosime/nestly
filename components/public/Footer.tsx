import React from 'react';
import Link from 'next/link';

interface FooterProps {
  onOpenNia?: () => void;
}

export function Footer({ onOpenNia }: FooterProps) {
  return (
    <footer className="w-full bg-[#FAF8F3] border-t border-[#EAE7DF] pt-16 sm:pt-20 pb-12 sm:pb-14 mt-16 sm:mt-24">
      <div className="max-w-[1180px] mx-auto px-6 lg:px-8">
        {/* Top Wordmark & Statement Row */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between border-b border-hairline pb-12 sm:pb-14 mb-12 sm:mb-16 gap-6">
          <div>
            <span className="font-headline text-[64px] sm:text-[90px] lg:text-[100px] font-extrabold tracking-tighter text-charcoal leading-none block select-none">
              nestly<span className="text-persimmon">.</span>
            </span>
            <p className="text-sm font-medium text-muted-ink mt-3 max-w-md">
              Residential rental listings for Benin City, Sapele, Warri, and Southern Nigeria.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onOpenNia}
              className="px-6 py-3 rounded-full bg-white hover:bg-soft-stone text-charcoal font-bold text-xs uppercase tracking-wider border border-hairline transition-colors shadow-2xs"
            >
              Ask Nia on WhatsApp
            </button>
            <Link
              href="/browse"
              className="px-6 py-3 rounded-full bg-persimmon text-white font-bold text-xs uppercase tracking-wider hover:bg-persimmon-hover transition-colors shadow-sm"
            >
              Browse Homes
            </Link>
          </div>
        </div>

        {/* Links Grid (4 Clean Columns) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10 mb-12 sm:mb-16">
          {/* Explore */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-muted-ink mb-4">
              Explore
            </h4>
            <ul className="space-y-2.5 text-sm font-medium text-charcoal/80">
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/browse">
                  Browse all homes
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/saved">
                  Saved homes shortlist
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/neighborhoods">
                  Neighborhood guides
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/neighborhoods/gra-benin-city">
                  GRA Benin City
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/neighborhoods/clinic-road-sapele">
                  Sapele Corridor
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-muted-ink mb-4">
              Company
            </h4>
            <ul className="space-y-2.5 text-sm font-medium text-charcoal/80">
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/about">
                  About Nestly
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/how-it-works">
                  How it works
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/submit-property">
                  Submit a property
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/contact">
                  Contact operations desk
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-muted-ink mb-4">
              Support
            </h4>
            <ul className="space-y-2.5 text-sm font-medium text-charcoal/80">
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/faq">
                  Help &amp; FAQ
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/inspection-request">
                  Book physical visit
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/service-unavailable">
                  System status
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-widest text-muted-ink mb-4">
              Legal &amp; Privacy
            </h4>
            <ul className="space-y-2.5 text-sm font-medium text-charcoal/80">
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/terms">
                  Terms of Use
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/privacy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/cookies">
                  Cookie Preferences
                </Link>
              </li>
              <li>
                <Link className="hover:text-persimmon transition-colors" href="/accessibility">
                  Accessibility
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Disclaimer & Staff Link */}
        <div className="pt-8 border-t border-hairline flex flex-col sm:flex-row items-center justify-between text-xs text-muted-ink gap-4">
          <p>© 2026 Nestly Technologies Nigeria Ltd · Residential rental listings in Edo and Delta States.</p>
          <Link
            href="/staff/signin"
            className="font-bold text-charcoal hover:text-persimmon transition-colors flex items-center gap-1 shrink-0"
          >
            Staff Portal Sign-in →
          </Link>
        </div>
      </div>
    </footer>
  );
}
