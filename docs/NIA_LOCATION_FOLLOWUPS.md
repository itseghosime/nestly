# Nia location replies and n8n capacity — 29 October 2026

## Report and diagnosis

Telegram screenshot showed /start → Okay → Lagos → Uselu → “I just said Uselu” → “Don't you have available houses at Uselu?” → GRA. Nia repeatedly asked for an area and eventually returned empty results without explaining its filters.

The existing Production NIA_N8N_ENABLED flag is true. A manual, synthetic execution of the existing WF02 Nia Plan Webhook was rejected before execution with “Execution limit reached.” No execution was created and no Telegram send occurred. No workflow executions were returned for the screenshot window; that alone is not evidence of a successful/failed request trace. The exact historic message execution cannot be proven from the screenshot. The currently exhausted execution capacity is confirmed.

The code's local fallback lacked Uselu/Lagos as recognized locations, discarded the fact it had asked for an area, kept filler/place words as amenity filters, and interpreted unqualified plural “houses” as the specific house type. Read-only linked database aggregates: 26 public listings overall; Uselu 0, Lagos 0, GRA 3 (two apartments and one duplex). These counts are a point-in-time read, not invented results or a promise of future availability.

## Fix

- Recognize Uselu, Lagos, Nigerian states and common cities as literal search locations. Keep requested compound scope such as GRA Lagos and Wuse Abuja; never substitute Benin for an outside area. Nearby landmarks after off/near/close-to do not replace the primary area.
- Save awaiting_location after an area prompt. Accept a bounded short place answer or “I just said …” correction in that context. Preserve existing budget, bedrooms, type, amenities and explicit round-the-clock solar requirements. This is bounded fallback parsing, not a claim of exhaustive Nigerian geographic knowledge.
- Strip conversational filler and stale recognized location words from amenity filters. Genuine solar/parking etc. remain binding. Social chat, questions and amenity-only replies are not mistaken for a location answer.
- Treat unqualified “available houses” as general homes; bedroom-qualified/specific house requests retain the house filter. Empty results display an active type restriction rather than hiding it. A no-match claim follows a real public-property query; database errors still fail as unavailable rather than pretending there were no listings.
- Keep database-grounded search results from being overwritten by a second conversational AI question. Website and Telegram share the corrected handler. No ownership, fee, delivery, auth, database schema or workflow change.

## Evidence and remaining blocker

Local full suite: 410 passed, 16 live skipped; both TypeScript checks passed; full lint 0 errors/33 existing image warnings and focused lint passed. Fourteen new regressions use actual Supabase client filter serialization with synthetic database fetches and an unavailable n8n planner. They cover the exact screenshot chain, no unnecessary second AI request, contextual unknown places, compound geography, preserved requirements, genuine type constraints, social exclusions, stale keywords and database failure.

The linked Supabase checks were read-only aggregate queries. No customer messages/data were changed, no chat was replayed, and no Telegram message/real model reply was generated. Local tests are not a live Telegram acceptance test. Final Production deployment is reported separately.

n8n execution capacity remains an external blocker for full model interpretation/conversation. No plan upgrade, billing action, credential edit or workflow publication was performed. Existing active WF02 version ed5973dc-b2a6-488a-909c-442375217ec3 and newer draft 71850821-0cd5-43f4-ad7b-94c5ad84bd51 were inspected but preserved. Once capacity is restored, deliberately test new customer messages rather than replaying old updates. This fix lets recognized/contextual location searches continue through the grounded fallback in the meantime.
