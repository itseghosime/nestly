import type { NeighborhoodGuide } from '@/lib/types';

export type NeighborhoodDatabaseRow = {
  id: string;
  slug: string;
  name: string;
  state: NeighborhoodGuide['state'];
  city: string;
  hero_image: string;
  tagline: string;
  average_annual_rent_2bed: string | number | null;
  average_annual_rent_3bed: string | number | null;
  power_reliability: string;
  security_rating: string;
  road_network: string;
  overview: string;
  highlights: string[];
  recommended_for: string[];
  popular_streets: string[];
};

export function mapNeighborhoodRow(row: NeighborhoodDatabaseRow): NeighborhoodGuide {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    state: row.state,
    city: row.city,
    heroImage: row.hero_image,
    tagline: row.tagline,
    averageAnnualRent2Bed: String(row.average_annual_rent_2bed ?? ''),
    averageAnnualRent3Bed: String(row.average_annual_rent_3bed ?? ''),
    powerReliability: row.power_reliability,
    securityRating: row.security_rating,
    roadNetwork: row.road_network,
    overview: row.overview,
    highlights: row.highlights ?? [],
    recommendedFor: row.recommended_for ?? [],
    popularStreets: row.popular_streets ?? [],
  };
}
