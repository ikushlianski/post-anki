---
type: todo
branch: main
task: post-anki open items
state: open
updated: 2026-08-05
---
# Run todo

Business and architecture-level open items only. Small, mechanical, code-level gaps get fixed
directly rather than parked here — `LOG.md` has the narrative of what's been fixed and when.

## Wishlist for the night

- [x] Easy to manage dashboard: subjects/curricula/modules/topics now render as one tree at `/`,
      `/dashboard` redirects there, and the nav has a single entry point — verified 2026-08-05 by
      an independent review-playwright sweep (S1/S2/S5 PASS every run). [→ .planning/dashboard-unified-tree/]
- [ ] Drag a curriculum card onto a different subject to move it there (the richer alternative to
      the "Move to…" dropdown, which itself works fine — S5 verified). Both drag scenarios (S3:
      drop on an eligible subject, S4: drop on an ineligible one) still fail intermittently under
      review-playwright's own independent sweep — 1/3 to 2/3 of full-sweep runs, same mid-drag
      `dropTargetActive` assertion, two different suspected causes neither fully confirmed: S3
      only fails when run right after S4 (a worker/file-order position effect, not a per-test
      timing issue); S4 tracks a long idle hold before its third hover in one continuous drag
      (`@dnd-kit/core` collision re-measurement timing). Full investigation:
      `.planning/dashboard-unified-tree/decisions.md`. Needs a follow-up session with a clean
      machine and a headed browser to finish root-causing — an unattended run can't observe this
      directly.
- [ ] Easy to start adding sources to a curriculum, like turbopuffer docs — STUCK, needs a human
      look, not another automatic retry (2026-08-05). The discovery flow itself works (pasting a
      docs URL and reviewing found pages is built and passing its own tests three times over,
      including after a security fix), but an independent adversarial review found a second,
      unguarded path elsewhere in the code that fetches a user-supplied URL without the same
      protection the new flow got — the kind of gap this project treats as a real security issue,
      not a nitpick — plus no test coverage yet for the new fetch-discovery endpoint. Branch
      `curriculum-add-sources-easily` has all the work, uncommitted, untouched, ready for a human to
      review and finish; full detail in `.planning/curriculum-add-sources-easily/`.
- [ ] Easy to expadn the module/topic so it suggests children based on web search
- [ ] Easy to chat with the structure of my knowledge, move stuff, merge etc.

## Decisions to make

- [x] Merge the "Curricula" home page and the "Dashboard" page into one — user prefers the
      Dashboard's design as the base. Should also support drag-and-drop of curricula between
      subjects, as a richer alternative to the "Move to…" button just added. Implemented
      2026-08-05 (`.planning/dashboard-unified-tree/`, unattended run): `/` now shows the full
      merged tree, `/dashboard` redirects, the "Move to…" dropdown still works. Drag-and-drop
      itself is NOT yet reliable — see the split-out wishlist item above — correcting
      implement-playwright's own self-report here, which understated it as 4/5 green; an
      independent review-playwright sweep found only 3/5 (S1/S2/S5) actually clean.
- [ ] Add `@dnd-kit/core` to `ai-dev`'s `tech-stack-registry.md` under post-anki's row — introduced
      by the `dashboard-unified-tree` plan as the drag-and-drop library for the merged
      dashboard/curricula page; this repo's planning run deliberately did not edit the `ai-dev`
      repo directly (out of scope for a post-anki-only run).
- [ ] Turn on Electric sync (live-updating UI) in production? Fact-checked 2026-08-05: it was
      deployed once, 2026-07-16, and has never passed its health check since — currently dead,
      not serving any traffic. Configured to always keep one instance running, which is the
      normal trigger for ongoing cost, though a container that's never actually started
      successfully typically isn't billed the same way a healthy one is — check the GCP Billing
      console directly for the real number rather than assuming either way. Decide: fix and turn
      on, or remove it from the infrastructure entirely.
- [ ] Splitting a subject/course/tag into multiple pieces needs real product design first — how
      does the app decide which existing content goes to which new piece?
- [ ] `curriculum-add-sources-easily` planning hit a genuine fork with no backing GitHub issue
      (classified by fork-classifier-factory, not defaulted): when a user discovers doc-site
      sources for an EXISTING curriculum (the new "paste a docs URL" flow), should the discovered
      candidates be persisted immediately as `pending` sources reusing the same
      approval-state-machine UI curriculum creation already has (`awaiting_source_approval` +
      `SourceApprovalPanel`), or returned to the browser for review with no persistence and
      resubmitted through the existing add-sources endpoint? The classifier flagged this
      genuine (it changes the shape of a core business entity — the source-draft schema) even
      though one option is clearly lower-risk. Plan proceeded with the reversible placeholder
      (ephemeral review, no persistence, no `curriculum.status` coupling) — see
      `.planning/curriculum-add-sources-easily/spec.md`'s Decisions made autonomously #1 for the
      full reasoning. Revisit if the ephemeral approach turns out to feel wrong in practice.

## To review / clarify

- [ ] The AI-generated "which parts of your knowledge map need review" suggestions can come back
      empty and the app shows no error — it just looks like nothing happened.
- [ ] Adding more source material to an existing curriculum can silently delete modules that were
      merged in from a different curriculum earlier — no warning, no confirmation.
- [ ] Retrying research on a curriculum that absorbed another one via merge can delete the
      absorbed curriculum's original source links.
- [ ] Manually triggering a "scan for new docs" check can return an empty result while a
      scheduled scan is already running for a different subject, because scans are serialized
      across the whole app rather than per subject.
- [ ] Mobile app has two narrow URL-safety gaps: doesn't recognize the Android emulator's loopback
      alias, and only blocks plain `http`, not other non-secure schemes. Low real-world risk,
      not yet hardened.

## Manual steps

- [ ] API's integration test suite isn't wired into CI yet — needs a Postgres service added to
      the pipeline config.
- [ ] If Electric goes to production: set its database secret, then flip the
      `PROD_ELECTRIC_ENABLED` switch.
- [ ] The Neon **dev** branch (cloud, not local) is missing recent migrations — loading the board
      against it fails. Needs someone with Neon access to run the migration.
- [ ] Three migrations from the concurrency-hardening work are only applied locally, not on Neon
      dev/prod yet.
- [ ] Uncommitted fixes sitting in `verification-repo` (outside this session's reach) need
      reviewing and committing or discarding by hand.
- [ ] A 3-attempt click-retry workaround in the tag-picker's e2e test can likely be simplified
      back to a single click now that the underlying hydration-timing bug is fixed — needs
      confirming in `verification-repo`.

## Post-deploy checks

- [ ] Once Electric is live: confirm a real long-lived connection isn't cut short by a default
      timeout somewhere in the request chain.
- [ ] Once Electric is live: confirm an unauthorized table request is correctly rejected against
      the real production URL, not just locally.

## Resolved

- 2026-08-05 — Integration tests polluted the live local database with test fixtures — 25 test
  files now run against an isolated throwaway database instead.
- 2026-08-05 — Curricula could only be reorganized by deleting and recreating them — added a
  proper "move to a different subject" action.
- 2026-08-05 — A stale migration-tracking bug was permanently hiding one migration from the
  local database, breaking the duplicate-subject-detection feature — root-caused and fixed.
- 2026-08-01 — Concurrent phrase-bank generate/grade calls could deadlock — closed.
- 2026-08-01 — A domain-map review with zero suggestions silently looked like nothing happened —
  now fails loudly instead.
- 2026-08-01 — Creating a curriculum during a concurrent subject merge could orphan it — closed.
- 2026-08-01 — Tag assignments didn't show up in the UI without a manual page reload — fixed.
- 2026-08-01 — A Node-only import could silently break the web app in production — CI now catches
  this before it ships.
- 2026-08-01 — Double-clicking accept/reject on a doc-scan suggestion could create a duplicate
  knowledge-map entry — closed.
- 2026-08-01 — Merging two subjects left the losing subject's pending review suggestions stuck
  and invisible forever — now carried over to the surviving subject.
- 2026-08-01 — Deleting a subject during a concurrent merge could destroy or orphan curricula —
  closed.
- 2026-08-01 — Deleting a subject could hang the whole app under load by holding two database
  connections per delete — now uses one.
- 2026-08-01 — An exhausted connection pool could hang forever with no error — now fails loudly
  after 10 seconds.
- 2026-08-01 — Four database-backed tests were silently not running in either test config — fixed.
- 2026-08-01 — Investigated a flaky curriculum-merge test — traced to a real, already-known
  rendering timing issue, not a new bug.
- 2026-08-01 — Measured and confirmed a real timing gap where far-down page controls look
  clickable before React has actually attached their handlers.
</content>
