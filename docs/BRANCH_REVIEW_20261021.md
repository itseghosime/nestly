# Branch review and cleanup — 21 October 2026

User authorized reviewing all 28 remote branches, merging ready changes and deleting integrated branches. No local branches, worktrees, unstaged edits or stashes were changed.

## Result

24 already-integrated remote branches deleted and independently confirmed absent through the GitHub branches API. Main and the two active draft workstreams retained. The remaining evidence branch is prepared for a documentation-only merge; final merge/deletion will be recorded separately.

## Deletion evidence and recovery references

Branches were removed only after proving the head is an ancestor of main, or the head exactly matches a merged PR whose recorded squash/merge commit is an ancestor of main. Squash-merged branches were not merged again. SHAs below preserve recovery references.

| Deleted branch | Prior head SHA | Integration evidence |
|---|---|---|
| add-staff-lead-submissions-20261020 | f21222b8693494bb0eb53b8c8a0a5ebc469c4089 | Head is an ancestor of main; merged PR #23 |
| feat/nia-n8n-conversation | 900fd9090a1006e0c79ea8c6af2a3c2d705a915f | PR #7 merged at a26177dda2d77930b81cb0226b8574027380765f; that commit is in main |
| feature/editorial-image-refresh | 207a108d1dd222bbd8e644483b8206643247f3c3 | PR #4 merged at b67bcb9b71230192feb8a4782d1f4b13de5e09ee; that commit is in main |
| feature/production-readiness-audit | 155d610e1ac9d1d058260ad1c29d679ffb2b448a | Head is an ancestor of main; merged PR #3 |
| feature/public-release-polish | 8cdacc51716a548ba8695bc92e1ee703dbb98daa | Head is an ancestor of main; merged PR #2 |
| feature/telegram-integration | fe173f6b9aa08d8a20831e60fb0edc0e0ea1fc89 | Head is an ancestor of main; merged PR #1 |
| fix/ios-input-focus-zoom | 61776b20ef12ea339001c3df0fdc95b24d002fc9 | PR #8 merged at f463e4a075eac5d2af4c1c7094d58b4667d9cd90; that commit is in main |
| fix/neighborhood-guides | 739e0d1dd477eef4c64ef78f99b36d55edcc49a6 | PR #5 merged at faefc5a8828839608e941055558637a3e985b41e; that commit is in main |
| fix/nia-conversation-and-chat-text | 915eee83cee71e5c09c8435c6da33f397cae2442 | PR #9 merged at aef8dfe760c42c9bec035990803a23d4e482a5ef; that commit is in main |
| fix/nia-relay-auth | 849610e08dcc13fcd1f2b5c049a47e53706a46dc | PR #10 merged at 8e8b4cc4a522581e3780d72cc4e8269b4d1ac3b2; that commit is in main |
| fix/nia-website-conversation | f463e4a075eac5d2af4c1c7094d58b4667d9cd90 | Head is an ancestor of main |
| fix/property-gallery-continuity | f3655226f12886a0029431cdedf0740ecc3ba73a | PR #6 merged at 18a2e84bc1236e0e0423d3d1f602eda7657e87ae; that commit is in main |
| fix/remove-unverified-signin-claims | 98246fd1deff283037ebcac55f967afde890c387 | Head is an ancestor of main; merged PR #14 |
| fix/staff-dashboard-data-and-select-spacing | cc75d0ae958eb3262ef36f48fd100a2111c52f08 | Head is an ancestor of main; merged PR #22 |
| fix-cancel-rescheduled-inspections-20261020 | 7a56d8600cc4006aa95d221fdb3c750c8d701047 | Head is an ancestor of main; merged PR #21 |
| pr3-readiness-review-20261018 | 1373c14e7e870939d3d934cfdeb256dbe476fc1a | Head is an ancestor of main |
| release/final-production-recheck | 8d50f5588158861dfdf5cee071e1e39e2f364561 | Head is an ancestor of main; merged PR #13 |
| release/inspection-property-detail-investigation-20261020 | 23f0c3009613ee5631e8c51f1b07a79807f382ca | Head is an ancestor of main; merged PR #19 |
| release/log-pr16-production-deploy-20261020 | 2fe0f0681c8f7f68afca18592dddfeb13911222c | Head is an ancestor of main; merged PR #17 |
| release/notification-read-state-and-safe-retries-20261020 | 93544e708cc4e9d5e1596e1ac6fc38b6da1e49b5 | Head is an ancestor of main; merged PR #20 |
| release/post-merge-verification | 77a4e17e489d49c36b00a2de0869b3f5e56fc7c4 | Head is an ancestor of main; merged PR #11 |
| release/production-alias-recheck | 74dcab74219a3724379a903ccc0286e6ed807b95 | Head is an ancestor of main; merged PR #12 |
| release/production-form-evidence-20261020-pr | f285ba7d71e39c35929db4ac187c000045fc9522 | Head is an ancestor of main; merged PR #16 |
| release/signin-production-verification | 167f85aee7e83d6112d1d15f6ce951184676cfde | Head is an ancestor of main; merged PR #15 |

## Retained work and required corrections

### feature/staff-operations-completion — draft PR #25
Reviewed head 352b5059728f328b1ff4444677b43c5067afbb25. Preview build passed previously, but its new unit tests, application/test typechecks and functional mutation flow have not been independently run in this cleanup. Keep draft; do not delete active work.

Required before merging this first slice:
- Run new/existing tests, both typechecks, lint and build on the exact head.
- Verify allowed and denied lead updates, revision conflicts and retries against the intended database policies.
- Verify response diagnostics omit message/history/identity/secret values.
- Make the PR's first-slice scope explicit. Settings, audit coverage, submission-to-draft conversion, uploads and lifecycle work remain assigned to Copilot; do not claim the whole backend half finished.
- Reconcile the shared BUILD_LOG.md after the evidence merge without erasing either branch's entries.

### feature/release-ui-completion — draft PR #26
Reviewed head 75cdb5cd1dc26404dee0ca3e8c0b5e81f7b5406b. The original unstable onClose callback dependency and duplicate Nia Escape listener were corrected. Keep draft for remaining findings:
- Three lifecycle/focus/Escape regression cases manually simulate behavior without mounting useDialogA11y. Replace them with actual hook mounting/rerender/DOM-event tests that fail on the original defect.
- Scroll acquisition only runs on isOpen change, so changing lockScroll while an open Nia panel crosses mobile/desktop leaves its lock state stale. Respond to lockScroll changes without restarting initial focus.
- Scrollbar compensation replaces existing padding rather than adding it; preserve computed padding plus compensation while locked and exact original inline styles on final release.
- Reference-counted scroll locking does not by itself arbitrate focus/Escape between overlapping dialogs; verify only the topmost modal owns them.
- Retain reproducible browser scripts for reported checks. Distinguish source review, local browser checks, Preview and Production. Normal-build portability and authenticated staff layout evidence still need precise records.

### docs/post-deployment-release-evidence-20261020
Originally PR #24 was merged, but this branch gained two later commits: 5bfb84b (useful verification evidence) and 5c89697 (inbox reformatting plus accidental 'flex wrap'). Do not delete until the newer evidence is integrated. This cleanup restores the inbox to main's exact blob, preserving evidence and excluding accidental code churn. Final diff must contain documentation only.

## Boundaries

No new tests were run during this cleanup; ancestor/PR/changed-file checks are repository evidence, not runtime verification. No provider messages, webhook replays, emails, database migrations/data edits, n8n changes, screenshots, recordings or PDFs. Existing Production runtime remains unchanged by the documentation-only merge.
