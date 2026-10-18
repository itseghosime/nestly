# Neighbourhood guide repair — 2026-10-18

## Reproduced cause
Live Supabase contained zero rows in public.neighborhoods. The directory rendered four fixture cards while the detail route queried Supabase. The public directory API returned an empty array and all four linked guide APIs returned 404.

## Repair
The directory now reads fetchNeighborhoods, sharing the published database source with detail pages, with loading, empty, search-empty and retry states. The detail API distinguishes a query failure (503) from a missing/inactive guide (404). Existing images, rounded layouts, motion hooks, property galleries and Nia actions are preserved. Nearby properties are requested by the guide's city, including both Warri and Effurun, rather than filtering only the first unfiltered result page.

Four editorial guides cover GRA Benin, Ugbor/Airport Road, Clinic Road/Sapele and Effurun/PTI. Copy focuses on viewing questions and comparisons, without inventing rent averages, electricity hours, safety ratings, inspection slots or flood certification. Empty rent benchmarks remain null in the database. Fixture copy is aligned only for explicitly enabled demo mode; connected mode never uses it as a silent fallback.

supabase/content/neighborhood-guides.sql is an idempotent DML seed, not a schema migration. It inserts four missing slugs and does not overwrite an existing guide, alter RLS, change listings or touch WF01/WF03. Run only against the existing linked project. scripts/check-neighborhood-guides.mjs performs read-only directory/detail/content/image/filter/404 checks against an explicit origin.

## Content sources and limits
- Edo State Government, GRA road/drainage context: https://edostate.gov.ng/obaseki-inspects-ongoing-drainage-road-construction-at-owina-central-road/
- Edo State Government, Ugbor drainage context: https://edostate.gov.ng/obaseki-inspects-integrated-drainage-project-reassures-on-curtailing-flooding-in-benin/
- Petroleum Training Institute, official Effurun address: https://pti.edu.ng/contact-us/
- Sapele's broad city/state context: https://en.wikipedia.org/wiki/Sapele,_Nigeria

Historical infrastructure reporting establishes context, not present road condition, flood protection or power availability. General viewing guidance is Nestly editorial advice. Street names follow the existing search categories and should be confirmed against the precise property address. Photography is editorial architecture rather than evidence of the named locality.

## Verification
Before repair, live: directory API 200 with zero rows; four guide endpoints 404; linked table empty. Post-change local, preview and live checks are recorded in BUILD_LOG.md when actually run. A full mobile/browser interaction audit is a separate task.

## Copilot handoff
Reconcile PR #3 with current main after this repair and PR #4. Preserve the API-backed directory, four guide slugs, honest infrastructure copy, new images, and Telegram changes. Rerun final combined-head checks, public form retry/receipt and authenticated staff flows; review dependency advisories and document remaining release blockers. Leave n8n unchanged.
