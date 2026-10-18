# Public-page editorial image refresh

Prepared 2026-10-18 on feature/editorial-image-refresh. This is a separate review branch; it does not change PR #3, Supabase inventory, pricing, authentication, dispatch, or n8n.

## Coverage

All 19 public route files and the shared header/footer were inspected for image placements.

| Pages | Treatment |
|---|---|
| Home | Hero, room vignette, introduction, neighbourhood panels, process thumbnails, guide card, closing CTA |
| About | Architecture and interior pairing |
| How It Works | Four process images; alt text describes the photograph rather than implying it depicts a chat UI or attended inspection |
| Neighbourhood index and detail | Local optimized images; legacy database image paths resolved by a small exact-match adapter without database writes |
| Submit Property | Existing image-guidance references refreshed; detail label no longer claims to show a meter box |
| Browse, property detail, Saved, inspection request | Existing listing galleries preserved; inspection summary still uses the selected property's photograph |
| Contact, FAQ, confirmation, legal, 404, service-unavailable | Existing text/form layouts preserved; no decorative photography added |

## Sources

Editorial photography is visual context, not evidence of an available property, local geography, a completed inspection, or ownership. Captions and alt text were adjusted accordingly. These photographs were not assigned to the 25 classroom listing galleries.

Unsplash license: https://unsplash.com/license . The six named photo pages were inspected and stated free use under that license. The two older CDN photographs have working Unsplash source URLs; their photographer/photo-page attribution remains unresolved and is recorded rather than invented.

| Asset | Credit | Source | CDN original |
|---|---|---|---|
| home-terrace / terrace-detail | Alef Morais | https://unsplash.com/photos/BnRBFRv2WZA | https://images.unsplash.com/photo-1766603636671-484c4911a84b |
| sunlit-living-room | Unsplash photograph; photographer attribution not established | https://images.unsplash.com/photo-1600210492486-724fe5c67fb0 | https://images.unsplash.com/photo-1600210492486-724fe5c67fb0 |
| architectural-interior | Unsplash photograph; photographer attribution not established | https://images.unsplash.com/photo-1600607687920-4e2a09cf159d | https://images.unsplash.com/photo-1600607687920-4e2a09cf159d |
| tropical-residence | You Le | https://unsplash.com/photos/I7fSJgJh3w8 | https://images.unsplash.com/photo-1768721301742-80de5237d91c |
| garden-entry | SERGEI BEZZUBOV | https://unsplash.com/photos/Pfp0MP8QB7M | https://images.unsplash.com/photo-1766937754720-4d30de201fd1 |
| neutral-detail | Abaddy Ghanem | https://unsplash.com/photos/j_S8cdk7yK8 | https://images.unsplash.com/photo-1767720580810-58be50f89bf8 |
| modern-facade | Valentin Lacoste | https://unsplash.com/photos/wPC6PljvCt4 | https://images.unsplash.com/photo-1778166166309-d61053ea331c |
| warm-living-room | Clay Banks | https://unsplash.com/photos/KL_xnnjbRgs | https://images.unsplash.com/photo-1757792859308-b8d2115a0010 |

## Asset preparation and compatibility

Nine local 1600 × 1000 WebP assets, eight source photographs and one intentional terrace-detail crop. Sources downloaded at 2000 pixels wide; no upscaling. Total new asset bytes: 1,852,334. Warm neutral interiors, tropical greenery, and contemporary architecture were selected to suit the existing palette. Legacy PNGs remain for unchanged staff/history references and rollback. Existing component sizes, rounded corners, GSAP selectors, gallery logic, property morph targets, and API contracts are unchanged. Home hero requests high priority; remaining static editorial images use native lazy loading and async decoding.

## Verification and release status

Local: decoded each source and output image, checked dimensions and unique asset paths, visually reviewed a source contact sheet, and audited the public-route image references. esbuild transpilation of eight touched TS/TSX source files passed. Legacy-path/pass-through compatibility checks passed 12/12. A full application build was not run.

Staging: pending a successful preview deployment and browser review of crops, loading, mobile layouts and image accessibility.

Live: not applied by this branch. Do not describe this as a production visual pass. Merge/reconcile with current main and PR #3 after review. No provider messages, database edits, hosting configuration changes, recordings, screenshots, or PDF deliverables.

Rollback: revert this branch's commit; legacy assets and database image paths remain intact.
