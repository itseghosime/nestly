# Property gallery repair — 2026-10-18

## Reproduction
User screenshots and live DOM inspection of the 12-photo Adesuwa Grove listing showed a full-page spinner before the hero mounted, and a 1,932px thumbnail column alongside a 480px hero. The enormous carousel region also affected its viewport visibility gate.

## Changes
- A minimal, temporary navigation preview contains the card's photo/title only. It does not cache auth, fees, availability, private contacts or listing permissions. Detail data still comes from a fresh API request. A 404/error clears the transition and shows the existing error state.
- The loading view reserves the real gallery geometry and presents that cached photo immediately. Direct loads use a skeleton. Reduced-motion navigation can use the preview without spatial animation.
- The morph re-resolves its destination while React replaces the loading shell with the validated gallery; the source's actual loaded fallback image is used.
- Gallery cover ordering prevents the hero jumping to a different first photo at handoff. An unrelated preview URL cannot enter another property's gallery.
- All photos remain accessible through a bounded strip: vertical at desktop, horizontal on mobile. Main hero stays 340px below sm and 480px from sm upward. Only the strip scrolls to follow the active thumbnail.
- Decode prewarming covers next/previous photos; lazy thumbnails avoid eagerly fetching every remote image on arrival.

## Verification
Local: esbuild syntax/transpilation and six executable photo-order assertions passed. Five equivalent Vitest cases are committed for the full repository suite. Build/preview/live browser results are appended to BUILD_LOG.md after observed tests. Do not claim slowed-network or mobile behavior is verified without an actual corresponding check.

## Coordination and rollback
PR #3 must preserve this repair when integrating main, alongside the editorial images and guide fixes. Revert this change's commit to restore previous UI; there is no data/schema rollback. n8n and provider configuration are untouched.
