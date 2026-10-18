-- Add the four missing editorial guides; preserve any guide concurrently created under these slugs.
-- DML only. Not a schema migration; no RLS, property, customer or workflow changes.
insert into public.neighborhoods (id, slug, name, state, city, hero_image, tagline, average_annual_rent_2bed, average_annual_rent_3bed, power_reliability, security_rating, road_network, overview, highlights, recommended_for, popular_streets, active)
select id, slug, name, state, city, hero_image, tagline, average_annual_rent_2bed, average_annual_rent_3bed, power_reliability, security_rating, road_network, overview, highlights, recommended_for, popular_streets, active
from jsonb_to_recordset($guides$
[
  {
    "id": "7bf5dcd6-6a7c-4c6b-9ed5-5db75e663001",
    "slug": "gra-benin-city",
    "name": "Government Reserved Area (GRA)",
    "state": "Edo",
    "city": "Benin City",
    "hero_image": "/images/editorial/home-terrace.webp",
    "tagline": "Compare established residential streets, compound layouts, and everyday routes in Benin City's GRA.",
    "average_annual_rent_2bed": null,
    "average_annual_rent_3bed": null,
    "power_reliability": "Confirm the meter, supply pattern and backup-power terms for the individual property.",
    "security_rating": "Ask about gate access, lighting, visitor rules and the compound's own arrangements.",
    "road_network": "Inspect the approach road and drainage at the specific address.",
    "overview": "GRA is a useful starting point for a Benin City home search when you want to compare addresses around the Airport Road, Ihama Road and Adesuwa Road axes. Start with your daily destinations, then compare the actual street and compound rather than relying on the GRA label alone. A quieter side street, an independent flat and a serviced development can offer very different experiences within the same wider area. During a viewing, check the approach road, parking arrangement, drainage, water supply and the full annual cost. Ask for the property's location pin and inspect the route at the time you normally travel.",
    "highlights": [
      "Compare the entrance and parking allocation: shared compounds and self-contained plots have different visitor rules.",
      "Ask who maintains the borehole, water tank and drainage, and whether those costs appear in the service charge.",
      "Test mobile data and the meter arrangement inside the actual unit; an area name does not establish power or internet reliability.",
      "Check access to your chosen school, workplace, shopping and healthcare destinations using the specific address."
    ],
    "recommended_for": [
      "Households comparing established Benin City addresses",
      "Professionals prioritising their daily commute",
      "Renters comparing private and shared compounds"
    ],
    "popular_streets": [
      "Airport Road",
      "Ihama Road",
      "Adesuwa Road",
      "Boundary Road"
    ],
    "active": true
  },
  {
    "id": "7bf5dcd6-6a7c-4c6b-9ed5-5db75e663002",
    "slug": "ugbor-airport-road",
    "name": "Ugbor & Airport Road Corridor",
    "state": "Edo",
    "city": "Benin City",
    "hero_image": "/images/editorial/terrace-detail.webp",
    "tagline": "Explore the Ugbor axis with a practical focus on access roads, drainage, and the space your household needs.",
    "average_annual_rent_2bed": null,
    "average_annual_rent_3bed": null,
    "power_reliability": "Confirm the meter, supply pattern and backup-power terms for the individual property.",
    "security_rating": "Ask about gate access, lighting, visitor rules and the compound's own arrangements.",
    "road_network": "Inspect the approach road and drainage at the specific address.",
    "overview": "Ugbor and the wider Airport Road axis provide a range of addresses to compare within Benin City. Treat the corridor as a search area, not a single uniform neighbourhood: a property's side road, drainage and access arrangements matter as much as its advertised location. If space is a priority, ask for the actual bedroom dimensions, parking allocation and any shared outdoor areas before arranging a viewing. Check the access route during busy periods and ask how it behaves after heavy rain. Confirm separately whether water, backup power, refuse collection and gate services are included in rent or billed through a service charge.",
    "highlights": [
      "Request the exact location pin and a description of the final approach road, including any unpaved section.",
      "Inspect drainage outlets and ask the caretaker about water entry into the compound after heavy rain.",
      "Check room measurements, ventilation, mosquito screens and water pressure at the unit.",
      "Compare service-charge inclusions in writing; do not assume a new-looking building includes backup electricity."
    ],
    "recommended_for": [
      "Households comparing space and compound arrangements",
      "Renters searching along Ugbor and Airport Road",
      "People who want to assess access conditions before committing"
    ],
    "popular_streets": [
      "Ugbor Road",
      "Airport Road",
      "Etete Road",
      "Ugbor-Amagba Road"
    ],
    "active": true
  },
  {
    "id": "7bf5dcd6-6a7c-4c6b-9ed5-5db75e663003",
    "slug": "clinic-road-sapele",
    "name": "Clinic Road & Central Sapele",
    "state": "Delta",
    "city": "Sapele",
    "hero_image": "/images/editorial/garden-entry.webp",
    "tagline": "Plan a Sapele home search around your daily destinations, street access, and the practical condition of each compound.",
    "average_annual_rent_2bed": null,
    "average_annual_rent_3bed": null,
    "power_reliability": "Confirm the meter, supply pattern and backup-power terms for the individual property.",
    "security_rating": "Ask about gate access, lighting, visitor rules and the compound's own arrangements.",
    "road_network": "Inspect the approach road and drainage at the specific address.",
    "overview": "Use Clinic Road and central Sapele as starting points for comparing available homes within Sapele, Delta State. Shortlist by the places you actually need to reach, then inspect the final approach to each address. Central locations can differ considerably in traffic, evening activity and shared-compound arrangements. Ask the owner or agent to identify the water source, meter, drainage route and any recurring communal charges. For any property, inspect for water marks, damp and drainage obstructions instead of assuming that a particular road or district is flood-free. Confirm the street name and location pin before travelling for a viewing.",
    "highlights": [
      "Check the entrance width, parking allocation and whether vehicles can leave independently.",
      "Visit at a representative time to assess road traffic, nearby activity and bedroom noise.",
      "Inspect ceilings, wall bases and external drainage for signs of leaks or persistent damp.",
      "Request a written breakdown of rent, agency, legal, caution and recurring service charges before paying."
    ],
    "recommended_for": [
      "People relocating within Sapele",
      "Households comparing central addresses",
      "Renters prioritising compound condition and total cost"
    ],
    "popular_streets": [
      "Clinic Road",
      "Old Warri Road"
    ],
    "active": true
  },
  {
    "id": "7bf5dcd6-6a7c-4c6b-9ed5-5db75e663004",
    "slug": "effurun-gra-warri",
    "name": "Effurun GRA & PTI Corridor",
    "state": "Delta",
    "city": "Warri / Effurun",
    "hero_image": "/images/editorial/modern-facade.webp",
    "tagline": "Compare homes around Effurun and the PTI axis using the exact address, commute, and compound services.",
    "average_annual_rent_2bed": null,
    "average_annual_rent_3bed": null,
    "power_reliability": "Confirm the meter, supply pattern and backup-power terms for the individual property.",
    "security_rating": "Ask about gate access, lighting, visitor rules and the compound's own arrangements.",
    "road_network": "Inspect the approach road and drainage at the specific address.",
    "overview": "Effurun, including the PTI Road axis, is a practical search area for people comparing homes in the wider Warri–Effurun area. The Petroleum Training Institute is located on PTI Road in Effurun, but proximity to a named landmark should always be checked from the property's actual location. Compare your commute, road access and the immediate surroundings of each compound. Ask about parking, gate hours, visitor access, waste collection and responsibility for shared equipment. Electricity, water and security arrangements vary by property; inspect them and request the relevant charges and rules in writing rather than relying on an area-wide rating.",
    "highlights": [
      "Test the route to your own workplace or study destination at the time you expect to travel.",
      "Confirm whether the address is in Effurun or another part of the wider Warri area before comparing commute times.",
      "Ask about gate access, visitors and shared facilities without assuming that a gated compound guarantees security.",
      "Check the water source, meter and backup-power rules, including any separate fuel or maintenance contributions."
    ],
    "recommended_for": [
      "People studying or working around the PTI axis",
      "Households comparing Warri and Effurun addresses",
      "Renters who need clear access and service-charge arrangements"
    ],
    "popular_streets": [
      "PTI Road",
      "Jakpa Road",
      "Airport Road"
    ],
    "active": true
  }
]
$guides$::jsonb) as guide(id uuid, slug text, name text, state text, city text, hero_image text, tagline text, average_annual_rent_2bed numeric, average_annual_rent_3bed numeric, power_reliability text, security_rating text, road_network text, overview text, highlights text[], recommended_for text[], popular_streets text[], active boolean)
on conflict (slug) do nothing
returning slug;
