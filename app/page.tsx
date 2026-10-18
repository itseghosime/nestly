"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Header } from "@/components/public/Header";
import { Footer } from "@/components/public/Footer";
import { NiaWidget } from "@/components/public/NiaWidget";
import { PropertyCard } from "@/components/public/PropertyCard";
import { fetchProperties } from "@/lib/properties";
import { PROPERTIES as FIXTURE_PROPERTIES } from "@/lib/fixtures/properties";
import type { Property } from "@/lib/types";
import { fetchNeighborhoods } from "@/lib/neighborhoods";
import { NEIGHBORHOODS as FIXTURE_NEIGHBORHOODS } from "@/lib/fixtures/neighborhoods";
import { prefersReducedMotion } from "@/lib/motion";
import {
  ArrowUpRight,
  Search,
  Calendar,
  MessageSquare,
  ChevronRight,
  Home as HomeIcon,
  ArrowRight,
} from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const HOME_FAQS = [
  {
    q: "Do I need an account to browse or contact Nia?",
    a: "No account or registration is required to browse public listings or save them locally in your browser. Contact details are requested when you submit an inquiry or inspection request.",
  },
  {
    q: "Are properties on Nestly physically verified?",
    a: "Not every listing detail is independently verified. Review the information shown and confirm ownership, utilities, condition, availability, and terms before making arrangements.",
  },
  {
    q: "Does an inspection request confirm a visit or fee?",
    a: "No. Submitting a request does not confirm an appointment or payment. Wait for an explicit response and clarify any charges before visiting.",
  },
  {
    q: "Which neighborhoods are currently supported?",
    a: "We currently focus on prime residential corridors in Edo and Delta: GRA Benin City, Boundary Road, Ihama, Ugbor, and Airport Road in Edo State; and Clinic Road Sapele and Effurun GRA in Delta State.",
  },
];

export default function HomePage() {
  const router = useRouter();
  const mainRef = useRef<HTMLElement>(null);
  const featuredGridRef = useRef<HTMLDivElement>(null);

  const [selectedCategory, setSelectedCategory] = useState<
    "all" | "Apartment" | "Self-Contained" | "Terrace Duplex"
  >("all");
  const [isNiaOpen, setIsNiaOpen] = useState(false);
  const [searchLocation, setSearchLocation] = useState(
    "Boundary Rd, GRA Benin",
  );
  const [searchBeds, setSearchBeds] = useState("2 or 3 Bedrooms");
  const [searchPrice, setSearchPrice] = useState("Under ₦4,000,000");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const [properties, setProperties] = useState<Property[]>(FIXTURE_PROPERTIES);
  const [homePropertiesError, setHomePropertiesError] = useState<string | null>(null);
  React.useEffect(() => {
    let c = false;
    fetchProperties()
      .then((rows) => {
        if (!c && rows.length) {
          setProperties(rows);
          setHomePropertiesError(null);
        }
      })
      .catch((error: unknown) => {
        if (!c) setHomePropertiesError(error instanceof Error ? error.message : 'Failed to load listings.');
      });
    return () => { c = true; };
  }, []);
  const filteredProperties =
    selectedCategory === "all"
      ? properties.slice(0, 3)
      : properties.filter((property) => property.propertyType === selectedCategory).slice(0, 3);

  const handleCategoryChange = (
    cat: "all" | "Apartment" | "Self-Contained" | "Terrace Duplex",
  ) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);

    if (!prefersReducedMotion() && featuredGridRef.current) {
      requestAnimationFrame(() => {
        if (!featuredGridRef.current) return;
        const cards =
          featuredGridRef.current.querySelectorAll(".property-card");
        gsap.fromTo(
          cards,
          { opacity: 0, y: 14, scale: 0.985 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.3,
            stagger: 0.055,
            ease: "power2.out",
            clearProps: "transform,opacity",
          },
        );
      });
    }
  };

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(
      `/browse?location=${encodeURIComponent(searchLocation)}&beds=${encodeURIComponent(searchBeds)}`,
    );
  };

  // Composed Hero & Section Entrances
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      // 1. Hero composed entrance
      const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
      heroTl
        .fromTo(
          "[data-hero-eyebrow]",
          { opacity: 0, y: 10 },
          { opacity: 1, y: 0, duration: 0.34, clearProps: "all" },
        )
        .fromTo(
          "[data-hero-text]",
          { opacity: 0, y: 22 },
          {
            opacity: 1,
            y: 0,
            duration: 0.48,
            stagger: 0.08,
            clearProps: "all",
          },
          "-=0.2",
        )
        .fromTo(
          "[data-hero-visual]",
          { opacity: 0, scale: 0.985 },
          {
            opacity: 1,
            scale: 1,
            duration: 0.56,
            ease: "power2.out",
            clearProps: "all",
          },
          "-=0.32",
        )
        .fromTo(
          "[data-hero-overlay-item]",
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.42,
            stagger: 0.07,
            clearProps: "all",
          },
          "-=0.28",
        );

      // 2. Editorial Intro section (#intro) - asymmetric left/right + wide strip
      gsap.fromTo(
        "[data-intro-col]",
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.46,
          stagger: 0.1,
          ease: "power2.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: "#intro",
            start: "top 84%",
            once: true,
          },
        },
      );

      gsap.fromTo(
        "[data-intro-strip]",
        { opacity: 0, scale: 0.98 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.52,
          ease: "power2.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: "[data-intro-strip]",
            start: "top 88%",
            once: true,
          },
        },
      );

      // 3. Neighborhoods 60/40 panels (#neighborhoods)
      gsap.fromTo(
        "[data-neighborhood-panel]",
        { opacity: 0, y: 22 },
        {
          opacity: 1,
          y: 0,
          duration: 0.48,
          stagger: 0.1,
          ease: "power2.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: "#neighborhoods",
            start: "top 82%",
            once: true,
          },
        },
      );

      // 4. Nia section chat bubbles (#nia)
      gsap.fromTo(
        "[data-nia-bubble]",
        { opacity: 0, y: 12, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.38,
          stagger: 0.14,
          ease: "back.out(1.4)",
          clearProps: "all",
          scrollTrigger: {
            trigger: "#nia",
            start: "top 80%",
            once: true,
          },
        },
      );

      // 5. Viewing process horizontal rows (#how-it-works)
      gsap.fromTo(
        "[data-step-row]",
        { opacity: 0, x: -16 },
        {
          opacity: 1,
          x: 0,
          duration: 0.42,
          stagger: 0.09,
          ease: "power2.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: "#how-it-works",
            start: "top 82%",
            once: true,
          },
        },
      );

      // 6. Practical guides (#guides)
      gsap.fromTo(
        "[data-guide-card]",
        { opacity: 0, y: 18 },
        {
          opacity: 1,
          y: 0,
          duration: 0.44,
          stagger: 0.08,
          ease: "power2.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: "#guides",
            start: "top 84%",
            once: true,
          },
        },
      );
    },
    { scope: mainRef },
  );

  return (
    <div className="min-h-screen bg-warm text-charcoal flex flex-col selection:bg-persimmon selection:text-white">
      {/* 88px Desktop & Mobile Header */}
      <Header onOpenNia={() => setIsNiaOpen(true)} />

      <main ref={mainRef} className="w-full overflow-hidden flex-1" id="home">
        {/* ================= EXACT APPROVED HERO SECTION ================= */}
        <section className="max-w-[1360px] mx-auto px-4 sm:px-8 lg:px-12 pt-8 sm:pt-14 lg:pt-20 pb-16">
          {/* Top Meta Eyebrow */}
          <div
            data-hero-eyebrow
            className="flex items-center justify-between mb-6 sm:mb-8"
          >
            <div className="inline-flex items-center gap-2 sm:gap-2.5 px-3.5 sm:px-4 py-1.5 rounded-full bg-soft-stone/80 border border-hairline text-[11px] sm:text-[12px] font-bold tracking-widest uppercase text-muted-ink">
              <span className="w-2 h-2 rounded-full bg-persimmon"></span>
              <span>BENIN CITY · SAPELE · DELTA</span>
            </div>
            <p className="text-[13px] font-medium text-muted-ink hidden sm:block">
              Residential property discovery · No sign-up required
            </p>
          </div>

          {/* Asymmetrical Headline & Intro Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-end mb-8 sm:mb-12">
            <div data-hero-text className="lg:col-span-8">
              <h1 className="font-headline text-[48px] sm:text-[76px] lg:text-[100px] font-extrabold leading-[0.94] tracking-[-0.035em] text-charcoal">
                A place to
                <br />
                call{" "}
                <span className="text-persimmon underline decoration-4 underline-offset-8 decoration-persimmon/40">
                  yours.
                </span>
              </h1>
            </div>
            <div data-hero-text className="lg:col-span-4 lg:pb-3">
              <p className="text-base sm:text-lg lg:text-[20px] leading-relaxed text-muted-ink font-normal max-w-[360px]">
                Find a home that fits your life. Browse listing details, ask
                Nia about available information, and request an in-person
                viewing.
              </p>
            </div>
          </div>

          {/* Giant Architectural Hero Visual with Inward Notch */}
          <div className="relative w-full">
            {/* Main container with 40px rounded corners */}
            <div
              data-hero-visual
              className="hero-notch-container w-full h-[400px] sm:h-[540px] lg:h-[680px] bg-soft-stone relative shadow-sm border border-hairline"
            >
              <img
                src="/images/generated/img_790f21b75f6c4829b0e7c145c8ca6112.png"
                alt="Contemporary Nigerian upscale residential home exterior in GRA Benin City"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/50 via-transparent to-transparent"></div>

              {/* Inward Notch (Top-Right) housing circular arrow 'Explore homes' */}
              <div
                data-hero-overlay-item
                className="cutout-badge hidden sm:flex"
              >
                <span className="text-[13px] font-bold uppercase tracking-wider text-charcoal">
                  Explore homes
                </span>
                <Link
                  href="/browse"
                  aria-label="Explore homes"
                  className="w-10 h-10 rounded-full bg-charcoal text-white flex items-center justify-center hover:bg-persimmon nestly-press shadow-2xs"
                >
                  <ArrowUpRight className="w-5 h-5 stroke-[2.4]" />
                </Link>
              </div>

              {/* Bottom Image Micro Caption */}
              <div
                data-hero-overlay-item
                className="absolute bottom-6 right-6 hidden lg:flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-charcoal/60 backdrop-blur-md text-white text-[12px] font-medium border border-white/20"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Boundary Road, GRA · Sample rental architecture</span>
              </div>
            </div>

            {/* Overlapping Sunlit Interior Photo at bottom right */}
            <div
              data-hero-overlay-item
              className="hidden lg:block absolute -bottom-10 right-12 z-20 w-[300px] p-2.5 bg-warm rounded-4xl shadow-xl border border-hairline"
            >
              <div className="w-full h-[190px] rounded-3xl overflow-hidden relative">
                <img
                  src="/images/generated/img_182f9d8fffd242df93d3c53e9b4abbc0.png"
                  alt="Sunlit modern Nigerian living room interior"
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-white/90 backdrop-blur-sm text-[11px] font-bold text-charcoal">
                  Sunlit Living Room
                </div>
              </div>
            </div>

            {/* Floating Segmented Search Bar (Overlapping Bottom-Left of Hero) */}
            <div
              data-hero-overlay-item
              className="lg:absolute -bottom-10 left-6 sm:left-8 z-30 mt-6 lg:mt-0 w-full lg:w-auto max-w-[700px]"
            >
              <form
                onSubmit={handleHeroSearch}
                className="bg-white rounded-3xl lg:rounded-full p-3 lg:p-2.5 shadow-xl border border-hairline flex flex-col lg:flex-row items-stretch lg:items-center gap-2 lg:gap-0 divide-y lg:divide-y-0 lg:divide-x divide-hairline"
              >
                {/* Location Segment */}
                <div className="px-5 py-2 lg:py-1.5 flex flex-col text-left min-w-[190px]">
                  <label
                    htmlFor="hero-location"
                    className="text-[11px] font-extrabold uppercase tracking-wider text-muted-ink"
                  >
                    Location
                  </label>
                  <select
                    id="hero-location"
                    value={searchLocation}
                    onChange={(e) => setSearchLocation(e.target.value)}
                    className="bg-transparent text-[14px] sm:text-[15px] font-bold text-charcoal focus:outline-none cursor-pointer mt-0.5"
                  >
                    <option value="Boundary Rd, GRA Benin">
                      Boundary Rd, GRA Benin
                    </option>
                    <option value="Ihama Road District">
                      Ihama Road District
                    </option>
                    <option value="Ugbor & Airport Road">
                      Ugbor &amp; Airport Road
                    </option>
                    <option value="Clinic Road Sapele">
                      Clinic Road Sapele (Delta)
                    </option>
                    <option value="Effurun GRA Warri">
                      Effurun GRA (Warri)
                    </option>
                  </select>
                </div>

                {/* Bedrooms Segment */}
                <div className="px-5 py-2 lg:py-1.5 flex flex-col text-left min-w-[160px]">
                  <label
                    htmlFor="hero-beds"
                    className="text-[11px] font-extrabold uppercase tracking-wider text-muted-ink"
                  >
                    Bedrooms
                  </label>
                  <select
                    id="hero-beds"
                    value={searchBeds}
                    onChange={(e) => setSearchBeds(e.target.value)}
                    className="bg-transparent text-[14px] sm:text-[15px] font-bold text-charcoal focus:outline-none cursor-pointer mt-0.5"
                  >
                    <option value="2 or 3 Bedrooms">2 or 3 Bedrooms</option>
                    <option value="1 Bedroom (Self-contain)">
                      1 Bedroom (Self-contain)
                    </option>
                    <option value="2 Bedrooms Flat">2 Bedrooms Flat</option>
                    <option value="3 Bedrooms Flat">3 Bedrooms Flat</option>
                    <option value="4+ Bedrooms Duplex">
                      4+ Bedrooms Duplex
                    </option>
                  </select>
                </div>

                {/* Price Segment */}
                <div className="px-5 py-2 lg:py-1.5 flex flex-col text-left min-w-[160px]">
                  <label
                    htmlFor="hero-price"
                    className="text-[11px] font-extrabold uppercase tracking-wider text-muted-ink"
                  >
                    Annual Budget
                  </label>
                  <select
                    id="hero-price"
                    value={searchPrice}
                    onChange={(e) => setSearchPrice(e.target.value)}
                    className="bg-transparent text-[14px] sm:text-[15px] font-bold text-charcoal focus:outline-none cursor-pointer mt-0.5"
                  >
                    <option value="Under ₦2,000,000">Under ₦2,000,000</option>
                    <option value="Under ₦3,500,000">Under ₦3,500,000</option>
                    <option value="₦3,500,000 - ₦6,000,000">
                      ₦3,500,000 - ₦6,000,000
                    </option>
                    <option value="Above ₦6,000,000">Above ₦6,000,000</option>
                  </select>
                </div>

                {/* Action Trigger */}
                <div className="p-1.5 flex items-center justify-end">
                  <button
                    type="submit"
                    aria-label="Search homes"
                    className="w-full lg:w-12 h-12 rounded-full bg-persimmon hover:bg-persimmon-hover text-white flex items-center justify-center shadow-sm font-bold text-sm gap-2 nestly-press cursor-pointer"
                  >
                    <Search className="w-5 h-5 stroke-[2.2]" />
                    <span className="lg:hidden">Search homes</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* ================= 1. EDITORIAL INTRO (#intro) ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline mt-10 lg:mt-16"
          id="intro"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-start mb-12 sm:mb-14">
            <div data-intro-col className="lg:col-span-6">
              <span className="text-[12px] font-extrabold uppercase tracking-widest text-persimmon block mb-3">
                A better way to rent
              </span>
              <h2 className="font-headline text-[38px] sm:text-[54px] font-extrabold leading-[1.06] tracking-tight text-charcoal">
                Good places.
                <br />A fresh start.
              </h2>
            </div>
            <div data-intro-col className="lg:col-span-6 lg:pt-3">
              <p className="text-base sm:text-lg sm:text-[20px] text-muted-ink leading-relaxed mb-6 font-normal">
                Compare homes, understand itemized Nigerian tenancy fees, and
                ask questions before you arrange an in-person viewing with our
                field team.
              </p>
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 text-base font-bold text-charcoal hover:text-persimmon transition-colors group"
              >
                <span>Get to know Nestly</span>
                <span className="transition-transform duration-150 group-hover:translate-x-1">
                  ↗
                </span>
              </Link>
            </div>
          </div>

          {/* Low cinematic strip */}
          <div data-intro-strip className="w-full">
            <div className="w-full h-[260px] sm:h-[340px] rounded-3xl sm:rounded-4xl overflow-hidden relative shadow-sm border border-hairline">
              <img
                src="/images/generated/img_5b652e6df80b49e698189b91c2274307.png"
                alt="Wide architectural interior in Benin City"
                className="w-full h-full object-cover object-center"
              />
            </div>
            <p className="text-xs text-muted-ink text-right mt-3 font-medium">
              Space for everyday life. Illustrative photography in Edo State.
            </p>
          </div>
        </section>

        {/* ================= 2. FEATURED HOMES (#featured-homes) ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline"
          id="featured-homes"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
            <div>
              <span className="text-[12px] font-extrabold uppercase tracking-widest text-muted-ink">
                Curated selections
              </span>
              <h2 className="font-headline text-3xl sm:text-[52px] font-extrabold tracking-tight text-charcoal mt-1">
                Find your kind of home.
              </h2>
            </div>
            <Link
              href="/browse"
              className="inline-flex items-center gap-3 group text-sm font-bold text-charcoal hover:text-persimmon transition-colors"
            >
              <span>Browse all homes</span>
              <span className="w-10 h-10 rounded-full bg-persimmon text-white flex items-center justify-center transition-transform duration-150 group-hover:scale-105 shadow-sm">
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>

          {/* Filter Capsules */}
          <div
            className="flex items-center gap-2.5 pb-8 overflow-x-auto no-scrollbar"
            role="tablist"
            aria-label="Property Categories"
          >
            {[
              { id: "all", label: "All homes" },
              { id: "Apartment", label: "Apartments" },
              { id: "Self-Contained", label: "Studios / Mini-flats" },
              { id: "Terrace Duplex", label: "Terrace Duplexes" },
            ].map((tab) => {
              const active = selectedCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    handleCategoryChange(
                      tab.id as
                        | "all"
                        | "Apartment"
                        | "Self-Contained"
                        | "Terrace Duplex",
                    )
                  }
                  className={`px-5 py-2.5 rounded-full text-xs font-bold tracking-wider uppercase whitespace-nowrap nestly-press cursor-pointer ${
                    active
                      ? "bg-charcoal text-white shadow-sm"
                      : "bg-soft-stone text-charcoal hover:bg-hairline"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Asymmetrical 3-Card Rail */}
          <div
            ref={featuredGridRef}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            {filteredProperties.map((prop, index: number) => (
              <PropertyCard
                key={prop.id}
                property={prop}
                featured={index === 0}
              />
            ))}
          </div>
        </section>

        {/* ================= 3. NEIGHBORHOODS (#neighborhoods) ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline"
          id="neighborhoods"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end mb-10">
            <div className="lg:col-span-7">
              <span className="text-[12px] font-extrabold uppercase tracking-widest text-muted-ink">
                Regional Focus
              </span>
              <h2 className="font-headline text-3xl sm:text-[52px] font-extrabold leading-[1.08] tracking-tight text-charcoal mt-2">
                A home is more
                <br />
                than four walls.
              </h2>
            </div>
            <div className="lg:col-span-5 lg:pb-2">
              <p className="text-base sm:text-lg text-muted-ink leading-relaxed">
                Explore residential pockets across Benin City and the Sapele
                commuter corridor in Delta State.
              </p>
            </div>
          </div>

          {/* Subtle Browse Chips */}
          <div className="flex flex-wrap items-center gap-2 mb-10">
            <span className="text-xs font-bold text-muted-ink mr-2 uppercase tracking-wider">
              Pockets:
            </span>
            {FIXTURE_NEIGHBORHOODS.map((n) => (
              <Link
                key={n.id}
                href={`/neighborhoods/${n.slug}`}
                className="px-4 py-1.5 rounded-full bg-soft-stone hover:bg-hairline text-charcoal text-xs font-semibold nestly-press"
              >
                {n.name.split(" (")[0]}
              </Link>
            ))}
          </div>

          {/* Large 60/40 photographic panels */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left (60%): Benin City Aerial */}
            <div
              data-neighborhood-panel
              className="lg:col-span-7 relative rounded-3xl sm:rounded-4xl overflow-hidden h-[340px] sm:h-[420px] group shadow-sm border border-hairline"
            >
              <img
                src="/images/generated/img_864608b0ef784f93a2ea34fab3c747f1.png"
                alt="Aerial panoramic photograph of Benin City residential district"
                className="property-card-img w-full h-full object-cover group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/30 to-transparent"></div>
              <div className="absolute bottom-6 left-6 right-6 text-white flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white mb-2 inline-block">
                    Edo State Capital
                  </span>
                  <h3 className="font-headline text-2xl sm:text-3xl font-extrabold">
                    GRA &amp; Boundary Road, Benin
                  </h3>
                  <p className="text-xs sm:text-sm text-white/80 mt-1 max-w-sm">
                    Leafy avenues, 20-22hr priority electrical feeder, and elite
                    security.
                  </p>
                </div>
                <Link
                  href="/neighborhoods/gra-benin-city"
                  aria-label="Explore GRA Benin City guide"
                  className="w-11 h-11 rounded-full bg-white text-charcoal flex items-center justify-center hover:bg-persimmon hover:text-white nestly-press shrink-0"
                >
                  <ArrowUpRight className="w-5 h-5" />
                </Link>
              </div>
            </div>

            {/* Right (40%): Sapele Corridor */}
            <div
              data-neighborhood-panel
              className="lg:col-span-5 relative rounded-3xl sm:rounded-4xl overflow-hidden h-[340px] sm:h-[420px] group shadow-sm border border-hairline"
            >
              <img
                src="/images/generated/img_319202c571e24bb2bff0a0c8ebecb4df.png"
                alt="Townhouses on Clinic Road Sapele"
                className="property-card-img w-full h-full object-cover group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/80 via-charcoal/30 to-transparent"></div>
              <div className="absolute bottom-6 left-6 right-6 text-white flex items-end justify-between">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/20 text-white mb-2 inline-block">
                    Delta State Corridor
                  </span>
                  <h3 className="font-headline text-xl sm:text-2xl font-extrabold">
                    Clinic Road, Sapele
                  </h3>
                  <p className="text-xs text-white/80 mt-1 max-w-xs">
                    Elevated flood-free topography with direct river port and
                    Warri connectivity.
                  </p>
                </div>
                <Link
                  href="/neighborhoods/clinic-road-sapele"
                  aria-label="Explore Clinic Road Sapele guide"
                  className="w-11 h-11 rounded-full bg-white text-charcoal flex items-center justify-center hover:bg-persimmon hover:text-white nestly-press shrink-0"
                >
                  <ArrowUpRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 4. NIA & HUMAN SUPPORT (#nia) ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-16 sm:py-20"
          id="nia"
        >
          <div className="bg-soft-stone rounded-3xl sm:rounded-[36px] p-6 sm:p-12 lg:p-16 border border-hairline">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              {/* Left: Editorial text */}
              <div className="lg:col-span-6">
                <h2 className="font-headline text-3xl sm:text-5xl lg:text-[54px] font-extrabold leading-[1.05] tracking-tight text-charcoal mb-4 sm:mb-6">
                  Less searching.
                  <br />
                  <span className="text-persimmon">More finding.</span>
                </h2>
                <p className="text-base sm:text-lg text-muted-ink leading-relaxed mb-6 sm:mb-8 max-w-md">
                  Tell Nia your preferred location, bedroom count, and budget.
                  Ask for a human whenever you need physical inspection
                  accompaniment or legal title review.
                </p>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setIsNiaOpen(true)}
                    className="inline-flex items-center gap-3 px-7 sm:px-8 py-3.5 sm:py-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-base font-bold tracking-tight shadow-md nestly-press cursor-pointer"
                  >
                    <MessageSquare className="w-5 h-5" />
                    <span>Chat with Nia</span>
                  </button>
                </div>
                <p className="text-xs font-semibold text-muted-ink mt-4">
                  Human support when it matters.
                </p>
              </div>

              {/* Right: Custom WhatsApp Mockup */}
              <div className="lg:col-span-6 flex justify-center">
                <div className="w-full max-w-[400px] bg-white rounded-3xl p-5 shadow-lg border border-hairline">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-hairline mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-charcoal text-white flex items-center justify-center font-extrabold text-sm">
                        N
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-charcoal leading-none">
                          Nia
                        </h4>
                        <p className="text-[11px] text-muted-ink mt-1">
                          Nestly Assistant · Benin &amp; Delta
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-soft-stone text-muted-ink font-semibold">
                      Interactive Demo
                    </span>
                  </div>

                  {/* Messages */}
                  <div className="space-y-3 text-[13px] leading-snug">
                    <div data-nia-bubble className="flex justify-end">
                      <div className="max-w-[85%] bg-persimmon-soft text-charcoal rounded-2xl rounded-tr-xs px-3.5 py-2.5 font-medium">
                        I need a serviced 3-bed terrace in GRA Benin with
                        constant light under ₦4m.
                      </div>
                    </div>
                    <div data-nia-bubble className="flex justify-start">
                      <div className="max-w-[85%] bg-soft-stone text-charcoal rounded-2xl rounded-tl-xs px-3.5 py-2.5 font-normal">
                        I can search published listings by location, bedrooms,
                        and budget. What would you like me to look for?
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-hairline flex items-center justify-between">
                    <span className="text-xs text-muted-ink font-medium">
                      Ready to discuss your checklist?
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsNiaOpen(true)}
                      className="text-xs font-bold text-persimmon hover:underline cursor-pointer"
                    >
                      Open Assistant →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 5. VIEWING PROCESS (#how-it-works) ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline"
          id="how-it-works"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 sm:mb-14 gap-4">
            <div>
              <span className="text-[12px] font-extrabold uppercase tracking-widest text-muted-ink">
                Simple Process
              </span>
              <h2 className="font-headline text-3xl sm:text-[52px] font-extrabold leading-[1.08] tracking-tight text-charcoal mt-1">
                From shortlist
                <br />
                to doorstep.
              </h2>
            </div>
            <p className="text-sm font-medium text-muted-ink max-w-xs">
              A clear, three-step journey designed for Nigerian renting
              realities.
            </p>
          </div>

          {/* 3 Horizontal Rows with thumbnails */}
          <div className="space-y-4">
            {/* Row 01 */}
            <div
              data-step-row
              className="w-full bg-white rounded-3xl p-6 sm:p-7 border border-[#E5E2DA] hover:border-charcoal/25 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xs"
            >
              <div className="flex items-center gap-5 sm:gap-6">
                <span className="font-headline text-3xl sm:text-4xl font-extrabold text-charcoal/30 w-10 sm:w-12 shrink-0">
                  01
                </span>
                <div className="w-[64px] sm:w-[72px] h-[64px] sm:h-[72px] rounded-2xl overflow-hidden bg-soft-stone shrink-0 border border-hairline">
                  <img
                    src="/images/generated/img_b16cbd4db4884a038e93243e9b975b81.png"
                    alt="Balcony detail"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-headline text-lg sm:text-2xl font-bold text-charcoal">
                    Browse &amp; save freely
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-ink mt-0.5">
                    Compare listing photos and disclosed fee details
                    without creating an account.
                  </p>
                </div>
              </div>
              <Link
                href="/browse"
                aria-label="Browse properties"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-soft-stone hover:bg-persimmon hover:text-white text-charcoal flex items-center justify-center nestly-press shrink-0 self-end md:self-center"
              >
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Row 02 */}
            <div
              data-step-row
              className="w-full bg-white rounded-3xl p-6 sm:p-7 border border-[#E5E2DA] hover:border-charcoal/25 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xs"
            >
              <div className="flex items-center gap-5 sm:gap-6">
                <span className="font-headline text-3xl sm:text-4xl font-extrabold text-charcoal/30 w-10 sm:w-12 shrink-0">
                  02
                </span>
                <div className="w-[64px] sm:w-[72px] h-[64px] sm:h-[72px] rounded-2xl overflow-hidden bg-soft-stone shrink-0 border border-hairline">
                  <img
                    src="/images/generated/img_0c79e160286544189f5f68168d230479.png"
                    alt="Townhouse compound"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-headline text-lg sm:text-2xl font-bold text-charcoal">
                    Clarify the fine print with Nia
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-ink mt-0.5">
                    Review reported details on utilities, fees, and security,
                    then confirm anything important before proceeding.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNiaOpen(true)}
                aria-label="Ask Nia"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-soft-stone hover:bg-persimmon hover:text-white text-charcoal flex items-center justify-center nestly-press shrink-0 self-end md:self-center cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>

            {/* Row 03 */}
            <div
              data-step-row
              className="w-full bg-white rounded-3xl p-6 sm:p-7 border border-[#E5E2DA] hover:border-charcoal/25 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xs"
            >
              <div className="flex items-center gap-5 sm:gap-6">
                <span className="font-headline text-3xl sm:text-4xl font-extrabold text-charcoal/30 w-10 sm:w-12 shrink-0">
                  03
                </span>
                <div className="w-[64px] sm:w-[72px] h-[64px] sm:h-[72px] rounded-2xl overflow-hidden bg-soft-stone shrink-0 border border-hairline">
                  <img
                    src="/images/generated/img_21d26ecda7f74e63a2b5a318df70b1f1.png"
                    alt="Serviced apartment compound"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-headline text-lg sm:text-2xl font-bold text-charcoal">
                    In-person viewing with real staff
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-ink mt-0.5">
                    Meet an authorized Nestly agent at the gate. No wandering
                    down unpaved streets with strangers.
                  </p>
                </div>
              </div>
              <Link
                href="/inspection-request"
                aria-label="Book inspection"
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-soft-stone hover:bg-persimmon hover:text-white text-charcoal flex items-center justify-center nestly-press shrink-0 self-end md:self-center"
              >
                <Calendar className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ================= 6. GUIDES / PRACTICAL HELP (#guides) ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline"
          id="guides"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
            <div>
              <span className="text-[12px] font-extrabold uppercase tracking-widest text-muted-ink">
                Practical Guidance
              </span>
              <h2 className="font-headline text-3xl sm:text-[50px] font-extrabold leading-[1.08] tracking-tight text-charcoal mt-1">
                A little local knowledge
                <br />
                goes a long way.
              </h2>
            </div>
            <Link
              href="/neighborhoods"
              className="inline-flex items-center gap-2 text-sm font-bold text-charcoal hover:text-persimmon transition-colors"
            >
              <span>Explore rental guides</span>
              <span>↗</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Card */}
            <div
              data-guide-card
              className="lg:col-span-7 bg-white rounded-[28px] p-6 sm:p-7 border border-hairline shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="w-full h-[220px] sm:h-[260px] rounded-2xl overflow-hidden mb-5">
                  <img
                    src="/images/generated/img_790f21b75f6c4829b0e7c145c8ca6112.png"
                    alt="Upscale residential home in GRA Benin City"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-persimmon mb-2">
                  Checklist
                </span>
                <h3 className="font-headline text-xl sm:text-2xl font-bold text-charcoal mb-2">
                  What to check before an in-person viewing in Edo &amp; Delta
                </h3>
                <p className="text-xs sm:text-sm text-muted-ink leading-relaxed">
                  How to test water pumping pressures, verify prepaid BEDC
                  distribution phase stability, and inspect seasonal drainage
                  history during high-rain periods.
                </p>
              </div>
              <Link
                href="/neighborhoods/gra-benin-city"
                className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-charcoal hover:text-persimmon transition-colors group"
              >
                <span>Read practical guide</span>
                <ChevronRight className="w-3.5 h-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            </div>

            {/* Right Stack (2 Cards) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              <div
                data-guide-card
                className="bg-white rounded-[28px] p-6 border border-hairline shadow-sm flex-1 flex flex-col justify-between"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-ink block mb-2">
                    Legal &amp; Finance
                  </span>
                  <h4 className="font-headline text-lg sm:text-xl font-bold text-charcoal mb-2">
                    Understanding tenancy agreements: Caution vs legal fees
                  </h4>
                  <p className="text-xs text-muted-ink leading-relaxed">
                    Review rent and listed fees, including amounts that still
                    need confirmation before you proceed.
                  </p>
                </div>
                <Link
                  href="/terms"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-charcoal hover:text-persimmon transition-colors"
                >
                  <span>Fee transparency guide →</span>
                </Link>
              </div>

              <div
                data-guide-card
                className="bg-white rounded-[28px] p-6 border border-hairline shadow-sm flex-1 flex flex-col justify-between"
              >
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-ink block mb-2">
                    Regional Navigation
                  </span>
                  <h4 className="font-headline text-lg sm:text-xl font-bold text-charcoal mb-2">
                    Flood-free residential mapping in Sapele and Warri
                  </h4>
                  <p className="text-xs text-muted-ink leading-relaxed">
                    Why high-ground neighborhoods like Clinic Road and Effurun
                    GRA offer superior living during Delta State rainy seasons.
                  </p>
                </div>
                <Link
                  href="/neighborhoods/clinic-road-sapele"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-charcoal hover:text-persimmon transition-colors"
                >
                  <span>Explore topography guide →</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================= 7. LANDLORD STRIP ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-8 sm:py-10"
          id="contact"
        >
          <div className="bg-stone-card rounded-3xl p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 border border-hairline">
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="w-12 h-12 rounded-2xl bg-white border border-hairline flex items-center justify-center text-charcoal shrink-0">
                <HomeIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-headline text-lg sm:text-xl font-extrabold text-charcoal">
                  Have a place someone could call home?
                </h3>
                <p className="text-xs sm:text-sm text-muted-ink mt-0.5">
                  Submit property details for review. A submission does not
                  confirm publication or independent verification.
                </p>
              </div>
            </div>
            <Link
              href="/submit-property"
              className="px-6 sm:px-7 py-3 rounded-full bg-white hover:bg-charcoal hover:text-white text-charcoal border border-charcoal/20 text-xs font-bold uppercase tracking-wider nestly-press shrink-0 shadow-2xs"
            >
              Submit a property
            </Link>
          </div>
        </section>

        {/* ================= 8. FREQUENTLY ASKED QUESTIONS (#faq) ================= */}
        <section
          className="max-w-[1180px] mx-auto px-6 lg:px-8 py-20 lg:py-28 border-t border-hairline"
          id="faq"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
            <div className="lg:col-span-5">
              <span className="text-[12px] font-extrabold uppercase tracking-widest text-muted-ink">
                Clear Answers
              </span>
              <h2 className="font-headline text-3xl sm:text-[48px] font-extrabold leading-[1.08] tracking-tight text-charcoal mt-2 mb-4">
                A few things
                <br />
                you might be wondering.
              </h2>
              <p className="text-sm sm:text-base text-muted-ink leading-relaxed mb-6">
                Everything you need to know about browsing, physical
                inspections, and how we handle tenancy details in Edo and Delta.
              </p>
              <Link
                href="/faq"
                className="inline-flex items-center gap-2 text-sm font-bold text-persimmon hover:text-charcoal transition-colors"
              >
                <span>Read full FAQ knowledgebase</span>
                <span>↗</span>
              </Link>
            </div>

            <div className="lg:col-span-7 space-y-3.5">
              {HOME_FAQS.map((item, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div
                    key={idx}
                    className={`bg-white rounded-3xl border transition-colors duration-200 ${
                      isOpen
                        ? "border-charcoal/25 shadow-xs"
                        : "border-hairline hover:border-charcoal/20"
                    }`}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      className="w-full p-5 sm:p-6 flex items-center justify-between text-left text-base sm:text-lg font-bold text-charcoal cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon rounded-3xl"
                    >
                      <span>{item.q}</span>
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 text-base font-bold shrink-0 ml-4 ${
                          isOpen
                            ? "rotate-45 bg-persimmon text-white"
                            : "bg-soft-stone text-charcoal"
                        }`}
                      >
                        +
                      </span>
                    </button>
                    <div
                      className={`grid transition-all duration-250 ease-out ${
                        isOpen
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-1 border-t border-hairline text-xs sm:text-sm text-muted-ink leading-relaxed font-normal">
                          {item.a}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= 9. CLOSING CTA BANNER ================= */}
        <section className="max-w-[1180px] mx-auto px-6 lg:px-8 py-12 sm:py-16">
          <div className="relative w-full rounded-3xl sm:rounded-5xl overflow-hidden h-[380px] sm:h-[440px] flex items-center justify-center text-center p-6 sm:p-8 bg-charcoal shadow-lg">
            <img
              src="/images/generated/img_cf5daf1e9cf9439499d9088aa14ce3f9.png"
              alt="Peaceful Nigerian residential compound dusk exterior"
              className="absolute inset-0 w-full h-full object-cover opacity-45 mix-blend-luminosity"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/50 to-charcoal/80"></div>
            <div className="relative z-10 max-w-xl mx-auto">
              <h2 className="font-headline text-3xl sm:text-[54px] font-extrabold text-white leading-[1.08] tracking-tight mb-6 sm:mb-7">
                Make room for
                <br />
                your next chapter.
              </h2>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href="/browse"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-persimmon hover:bg-persimmon-hover text-white text-base font-bold tracking-tight shadow-xl nestly-press"
                >
                  <span>Browse homes</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsNiaOpen(true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-base font-semibold border border-white/20 nestly-press cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Ask Nia a question</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Floating Nia AI Widget */}
      <NiaWidget
        isOpenExternal={isNiaOpen}
        onCloseExternal={() => setIsNiaOpen(false)}
      />

      {/* 4-Column Footer */}
      <Footer onOpenNia={() => setIsNiaOpen(true)} />
    </div>
  );
}