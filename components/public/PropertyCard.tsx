'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import gsap from 'gsap';
import { Property } from '@/lib/types';
import { useSavedHomes } from '@/lib/saved-homes-context';
import { usePropertyTransition } from '@/lib/property-transition-context';
import { prefersReducedMotion } from '@/lib/motion';
import { Heart, Calendar, ArrowRight } from 'lucide-react';

interface PropertyCardProps {
  property: Property;
  featured?: boolean;
  onBeforeUnsave?: (propertyId: string, cardElement: HTMLElement | null) => boolean;
}

export function PropertyCard({
  property,
  featured = false,
  onBeforeUnsave,
}: PropertyCardProps) {
  const { isSaved, toggleSave } = useSavedHomes();
  const { triggerPropertyTransition } = usePropertyTransition();
  const saved = isSaved(property.id);
  const verificationStatusRecorded = property.verificationBadge !== 'Verification status not provided';

  const cardRef = useRef<HTMLElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const heartBtnRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  const detailHref = `/property/${property.id}`;

  const handleDetailNavigation = (e: React.MouseEvent<HTMLElement>) => {
    triggerPropertyTransition(e, {
      propertyId: property.id,
      imageSrc: property.featuredImage,
      title: property.title,
      cardImageElement: imageContainerRef.current,
      targetHref: detailHref,
    });
  };

  const handleSaveToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (saved && onBeforeUnsave) {
      const handled = onBeforeUnsave(property.id, cardRef.current);
      if (handled) return;
    }

    const willBeSaved = !saved;
    toggleSave(property.id);

    if (!prefersReducedMotion() && heartBtnRef.current) {
      gsap.fromTo(
        heartBtnRef.current,
        { scale: 0.82 },
        { scale: 1, duration: 0.36, ease: 'back.out(2.6)' }
      );
      if (willBeSaved && ringRef.current) {
        gsap.fromTo(
          ringRef.current,
          { scale: 0.7, opacity: 0.75 },
          { scale: 1.75, opacity: 0, duration: 0.44, ease: 'power2.out' }
        );
      }
    }
  };

  return (
    <article
      ref={cardRef}
      data-property-card={property.id}
      className={`property-card property-card-hover bg-white rounded-3xl p-4 border border-hairline shadow-[0_2px_8px_rgba(0,0,0,0.04)] group flex flex-col justify-between ${
        featured ? 'lg:scale-[1.02] border-persimmon/30 ring-1 ring-persimmon/20' : ''
      }`}
    >
      <div>
        {/* Photo Container */}
        <div
          ref={imageContainerRef}
          data-card-image-container={property.id}
          className="relative w-full h-[280px] sm:h-[320px] rounded-2xl overflow-hidden mb-4 bg-soft-stone"
        >
          <Link
            href={detailHref}
            onClick={handleDetailNavigation}
            tabIndex={-1}
            aria-hidden="true"
            className="block w-full h-full focus:outline-none"
          >
            {property.featuredImage ? (
              <img
                src={property.featuredImage}
                alt={property.title}
                className="property-card-img w-full h-full object-cover"
                loading="lazy"
                onError={(event) => {
                  const image = event.currentTarget;
                  if (image.dataset.fallbackAttempted) {
                    image.style.visibility = 'hidden';
                    return;
                  }
                  image.dataset.fallbackAttempted = 'true';
                  const fallback = property.galleryImages?.find(
                    (source) => source && source !== property.featuredImage,
                  );
                  if (fallback) image.src = fallback;
                  else image.style.visibility = 'hidden';
                }}
              />
            ) : null}
          </Link>

          {/* Top Left Badge: Verification Status */}
          <div className="pointer-events-none absolute top-3 left-3 px-3 py-1 rounded-full bg-white/95 backdrop-blur-sm text-[11px] font-extrabold tracking-wider uppercase text-charcoal flex items-center gap-1.5 shadow-2xs">
            <span className={`w-1.5 h-1.5 rounded-full ${verificationStatusRecorded ? 'bg-emerald-500' : 'bg-muted-ink/50'}`}></span>
            <span>{property.verificationBadge}</span>
          </div>

          {/* Top Right: Bookmark / Save Button */}
          <button
            ref={heartBtnRef}
            type="button"
            aria-label={saved ? `Remove ${property.title} from saved` : `Save ${property.title}`}
            aria-pressed={saved}
            onClick={handleSaveToggle}
            className={`absolute top-3 right-3 w-10 h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors duration-150 shadow-2xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon ${
              saved
                ? 'bg-persimmon text-white'
                : 'bg-white/90 text-charcoal hover:text-persimmon hover:bg-white'
            }`}
          >
            <span
              ref={ringRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-persimmon opacity-0"
            />
            <Heart
              className={`w-4 h-4 transition-colors duration-150 ${saved ? 'fill-white stroke-white' : ''}`}
            />
          </button>

          {/* Bottom Left Pill: Neighborhood */}
          <div className="pointer-events-none absolute bottom-3 left-3 px-3 py-1 rounded-full bg-charcoal/85 text-white text-xs font-medium tracking-tight backdrop-blur-xs">
            {property.neighborhood}, {property.city}
          </div>

          {/* Bottom Right Pill: Status */}
          <div className="pointer-events-none absolute bottom-3 right-3 px-2.5 py-0.5 rounded-full bg-white/90 text-[10px] font-bold text-charcoal uppercase tracking-wider">
            {property.inspectionStatus}
          </div>
        </div>

        {/* Content Body */}
        <div className="px-1.5">
          <Link
            href={detailHref}
            onClick={handleDetailNavigation}
            className="group-hover:text-persimmon transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-persimmon rounded-md inline-block"
          >
            <h3 className="font-headline text-lg sm:text-xl font-bold text-charcoal line-clamp-1 mb-1">
              {property.title}
            </h3>
          </Link>

          <p className="text-xs text-muted-ink mb-3 font-medium">
            {property.bedrooms} Beds · {property.bathrooms} Baths{property.powerRating ? ` · ${property.powerRating.split(' ')[0]} Power` : ''}
          </p>

          <p className="text-xs text-charcoal/70 line-clamp-2 leading-relaxed mb-4">
            {property.tagline}
          </p>
        </div>
      </div>

      {/* Pricing & Actions Footer */}
      <div className="pt-3 border-t border-hairline px-1.5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-ink font-semibold block">
              Annual rent
            </span>
            <p className="font-headline text-2xl font-extrabold text-charcoal">
              {property.priceFormatted}
              <span className="text-xs font-normal text-muted-ink">/yr</span>
            </p>
          </div>

          <Link
            href={`/inspection-request?property=${property.id}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-soft-stone hover:bg-persimmon hover:text-white text-charcoal text-xs font-bold tracking-tight nestly-press"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Book Visit</span>
          </Link>
        </div>

        <Link
          href={detailHref}
          onClick={handleDetailNavigation}
          className="w-full py-2.5 px-4 rounded-xl bg-warm border border-hairline hover:border-charcoal/30 text-charcoal text-xs font-bold flex items-center justify-center gap-1.5 nestly-press group/btn"
        >
          <span>View Property &amp; Video Tour</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-ink group-hover/btn:translate-x-1 transition-transform duration-150" />
        </Link>
      </div>
    </article>
  );
}
