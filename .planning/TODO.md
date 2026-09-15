---
type: todo
branch: main
task: post-anki open items
state: open
updated: 2026-09-04
---
# Run todo

## agentic-framework-and-tool-principles

### Scope
- A written, grounded set of tool-call and agent/subagent conventions for post-anki's own AI framework, drawing on real lessons from building and studying other agent harnesses
- A persistent memory solution for post-anki's own AI framework, and the agents/subagents this actually needs, built out where genuinely missing
- Out of scope: Rewriting an existing, working agent from scratch just to match a new convention — apply this to new/missing pieces and real defects, not a wholesale rewrite

### Coding tasks
- [x] Replace 3 duplicated ad-hoc conversation-history formatters with one shared, tested one
- [x] Write a grounded doc on this app's own agent/tool-call conventions (model tiers, retry, cost logging, memory)

### Notes
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)


## shareable-browser-search

### Scope
- The post-anki web app supports a shareable URL for a search or browse state, so a link can be sent or bookmarked and reopens the same view
- Out of scope: Adding new search capabilities beyond what already exists — only making the existing search/browse state linkable

### Coding tasks
- [x] Make the notes search and filters shareable and bookmarkable via the page URL

### Notes
- Global search lives in the root layout, not a route — not linkable, out of scope.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)


## ingestion-progress-visibility

### Scope
- When a new URL or doc page is added as a source, show clear processing state: which step is running, a rough progress estimate, and plain-language descriptions with no technical jargon
- Show a running count of cards generated so far, with cards and study material visible immediately in the post-anki browser as they land, not only once everything finishes
- Out of scope: Changing the underlying ingestion pipeline's actual steps — only making its existing state and output visible as it happens

### Coding tasks
- [x] Show plain-language progress instead of a raw status word while a course is being made
- [x] Show a running count of cards generated so far across the whole course, not just per topic

### Notes
- StructureDraftPending already auto-refreshes every 2.5s while a draft is pending — not a gap.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)


## instant-study-cards

### Scope
- Generate a topic's cards (concept + rephrased-answer variants) automatically once its content is ready, not only when a learner opens it and clicks generate
- Trigger generation across many topics without wasted duplicate work or overwhelming the LLM queue
- Out of scope: Rebuilding the cards agent's variant-generation approach itself — the concept + 3-5 rephrased-variants design already exists and stays as-is

### Coding tasks
- [x] Skip starting new card generation when a topic's cards are already ready or in progress
- [x] Start generating cards for topics a learning-list release just made available
- [x] Start generating a topic's cards once course structure is confirmed, not on first open

### Notes


Business and architecture-level open items only. Small mechanical gaps get fixed directly.

Each root item below is one separate autonomous session, worked sequentially — not batched.
- A newly created bare topic has no content yet — no valid trigger point at creation.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)

## Wishlist for the night

- [ ] Simplify the dashboard to show only the courses I actually started — STUCK, needs a human
      look. The home page is proven never to invent courses from taxonomy data; the separate
      dashboard page still has no such guarantee. Work sits on branch
      dashboard-self-initiated-only.
  - [ ] Diagnose why the dashboard page can invent courses from taxonomy data unlike the home page
    - [ ] Compare the home page's course-list query against the dashboard page's
    - [ ] Identify where taxonomy-derived rows leak in as pseudo-courses
  - [ ] Apply the home page's "never invent from taxonomy" guarantee to the dashboard page
  - [ ] Add a locked e2e test, then get human confirmation of the visual result before merging
- [x] One easy-to-manage dashboard tree of subjects, courses, modules and topics. Built and
      verified on branch dashboard-unified-tree, NOT yet merged — the live app still shows the
      old separate dashboard page.
- [ ] Drag a course card onto a different subject to move it there. The dropdown alternative
      works; the drag itself fails intermittently under independent review and needs a human
      watching a real browser to finish diagnosing.
  - [ ] Reproduce the intermittent drag failure in a real browser session
    - [ ] Capture exact repro steps and failure rate
  - [ ] Diagnose root cause (DnD timing vs hydration, or an event-listener race)
  - [ ] Fix, then confirm stability across repeated manual tries — needs human confirmation
- [ ] Make it easy to add sources to a course — STUCK, needs a human look. The paste-a-docs-link
      flow works, but review found a second place elsewhere that fetches a user-supplied address
      without the same protection, plus no test coverage for the new discovery step. Work sits on
      branch curriculum-add-sources-easily.
  - In progress as item 10 of the active autonomous batch, GitHub issue #103 — no separate
    breakdown here to avoid duplicate tracking.
- [ ] Let a module or topic suggest its own children from web search — STUCK, needs a human look.
      Built and verified; blocked on citation links rendering without a safe-address check, a
      weakness that already exists in four other places. Work sits on branch
      module-topic-expand-web-search.
  - [ ] Inventory every citation-link render site missing the safe-address check (4 existing + this one)
  - [ ] Apply the existing safe-address check uniformly across all 5 sites
  - [ ] Re-verify the web-search suggestion feature end-to-end once citations are guarded
  - The safe-address check itself ships as item 10 of the active autonomous batch, issue #103 —
    this item is the feature that check unblocks.
- [ ] Let me chat with the structure of my knowledge — move things, merge them, reorganise.
  - [ ] Scope which reorganize operations ship first (move, merge, split, rename) vs later
  - [ ] Design the chat-driven interaction, with confirmation before any destructive move
  - [ ] Implement the backend reorganize operations, wired to the chat surface
    - [ ] One deriver per operation (move/merge/split), unit-tested in isolation
    - [ ] Chat tool-call wiring that confirms before calling a destructive operation
  - [ ] FE surface plus e2e coverage for at least the move and merge paths
- [ ] Update two locked e2e tests for curriculum structure-shaping pipeline stage.
  - [ ] Identify the two locked tests and what changed in the pipeline stage
  - [ ] Update their assertions to match current behavior without weakening coverage
- [ ] Add subject/tag split fast-follow to ontology-split-merge; include cycle guard.
  - [ ] Review ontology-split-merge's existing split/merge implementation
  - [ ] Add the fast-follow split path for subject/tag
  - [ ] Add a cycle guard so a split/merge chain can't cycle back on itself
- [ ] Connect post-anki to the-me-agent vault via MCP for mentor context.
  - [ ] Confirm the-me-agent's MCP surface and auth model
  - [ ] Wire an MCP client into post-anki's mentor/Socratic context assembly
  - [ ] Scope which vault data is safe and useful to pull in per session
- [ ] Recommend courses from the-me-agent's learning map, with accept/later/dismiss.
  - Depends on the MCP connection above landing first.
  - [ ] Define the recommendation surface — where it's shown, how often
  - [ ] Backend: pull candidate topics from the-me-agent's learning map
  - [ ] FE: accept/later/dismiss actions, with the choice persisted
- [x] Add one daily Telegram touchpoint digesting all practice surfaces.
  - [x] Scope what "all practice surfaces" means for the digest (due queue, probes, gaps)
  - [x] Backend: compose the daily digest message
  - [x] Wire into the existing Telegram bot's scheduled-send mechanism
- [ ] Merge Tauri desktop app worktree once Rust toolchain is installed.
      [→ .claude/worktrees/tauri-desktop-app]
  - Manual step (install the Rust toolchain) blocks this — not a coding session on its own.

## Decisions to make

- [x] Merge the courses home page and the dashboard into one, using the dashboard's design.
      Implemented; drag-and-drop between subjects is not yet reliable and is tracked separately.
- [ ] Register the drag-and-drop library in the shared tech-stack registry, which lives in
      another repository this run deliberately did not touch.
  - Manual, cross-repo — not a post-anki coding session.
- [ ] Turn on live-updating sync in production, or remove it entirely. It was deployed once and
      has never passed a health check since, so it currently serves no traffic. Check real
      billing before assuming it costs nothing.
  - [ ] Decide: keep and fix, or remove — needs a human call before either path starts
  - [ ] If keeping: verify the health check, set the DB secret, enable the feature switch
  - [ ] If removing: strip the feature flag and its dead code
- [ ] Splitting a subject, course or tag into pieces needs product design first: how does the app
      decide which existing content goes where?
- [ ] When discovering doc-site sources for an existing course, should candidates be saved
      immediately and go through the same approval flow as new courses, or be reviewed in the
      browser and submitted only once accepted? Currently the reversible second option. Revisit
      if it feels wrong in practice.

## To review / clarify

- [x] Review suggestions for the knowledge map can come back empty with no error — it just looks
      like nothing happened.
  - Fixed as item 8 of the autonomous batch, issue #103 — a completed review with zero results
    now says so explicitly.
- [x] Adding more source material to a course can silently delete modules merged in from another
      course, with no warning.
  - Fixed as item 6 of the autonomous batch, issue #103 — merge-provenance now locks a module
    against deletion the same way learner progress does.
- [x] Retrying research on a course that absorbed another can delete the absorbed course's
      original source links.
  - Fixed as item 7, issue #103 — `sources.mergedFromCurriculumId` added (migration
    0050_happy_killraven), retry-research now spares merged-in sources.
- [x] A retry-research pass has no ordering guarantee over which surviving source becomes the new
      entry point, so it could in principle pick an absorbed course's URL over the target's own.
      Not data loss, surfaced while fixing the item above — needs a look separately.
- [ ] A manual scan for new docs can return nothing while a scheduled scan runs for a different
      subject, because scans are serialised across the whole app instead of per subject.
  - In progress as item 9 of the active autonomous batch, issue #103.
- [ ] The mobile app has two narrow address-safety gaps around local development and non-secure
      connection types. Low real-world risk, not yet hardened.
  - [ ] Identify the two gaps precisely (local-dev addresses, non-secure connection types)
  - [ ] Harden both, matching the safe-address check pattern shipping as issue #103 item 10

## Manual steps

- [ ] Wire the API's database-backed test suite into the build pipeline.
  - [ ] Confirm which test suite/config needs CI wiring (the integration config)
  - [ ] Add it to the existing CI workflow, with a real DB service in CI
  - [ ] Confirm it runs green in CI before merging
- [ ] If live sync goes to production: set its database secret, then turn on the feature switch.
- [ ] The cloud development database is missing recent updates, so the board fails to load
      against it. Needs someone with access to apply them.
- [ ] Three database updates from the concurrency work exist only locally, not in the cloud.
- [ ] Uncommitted fixes sitting in the separate end-to-end test repo need reviewing and either
      committing or discarding by hand.
- [ ] A repeated-click workaround in the tag-picker end-to-end test can probably be simplified now
      that the underlying timing bug is fixed.
- [ ] Confirm Playwright gotcha notes got committed in verification-repo (outside this repo's
      autonomy).

## Post-deploy checks

- [ ] Once live sync is running: confirm a long-lived connection is not cut short by a timeout.
- [ ] Once live sync is running: confirm an unauthorised data request is rejected against the real
      production address, not just locally.

## Resolved

- 2026-08-05 — TODO.md wrongly implied an unmerged branch was live; corrected.
- 2026-08-05 — Tests polluted the live local database with fixtures; they now run against an
  isolated throwaway database.
- 2026-08-05 — Courses could only be reorganised by deleting and recreating them; added a proper
  move-to-another-subject action.
- 2026-08-05 — A stale tracking bug permanently hid one database update locally, breaking
  duplicate-subject detection.
- 2026-08-01 — Concurrent phrase-bank generate and grade calls could deadlock.
- 2026-08-01 — A knowledge-map review with zero suggestions silently looked like nothing happened;
  now fails loudly.
- 2026-08-01 — Creating a course during a concurrent subject merge could orphan it.
- 2026-08-01 — Tag assignments needed a manual page reload to appear.
- 2026-08-01 — A server-only import could silently break the web app in production; the build now
  catches it.
- 2026-08-01 — Double-clicking accept or reject on a doc-scan suggestion could create a duplicate
  knowledge-map entry.
- 2026-08-01 — Merging two subjects left the losing subject's pending suggestions stuck and
  invisible forever; they now carry over.
- 2026-08-01 — Deleting a subject during a concurrent merge could destroy or orphan courses.
- 2026-08-01 — Deleting a subject could hang the app under load by holding two database
  connections per delete; now uses one.
- 2026-08-01 — An exhausted connection pool could hang forever with no error; now fails loudly.
- 2026-08-01 — Four database-backed tests were silently not running in either configuration.
- 2026-08-01 — Investigated a flaky course-merge test; traced to a known rendering timing issue,
  not a new bug.
- 2026-08-01 — Confirmed a real timing gap where controls far down a page look clickable before
  the app has attached their handlers.

## data-integrity-under-regeneration

### Scope
- Every module/topic/source mutation path (regenerate, retry-research, merge, clear) preserves content it doesn't own
- Extend merge-provenance protection to any remaining unprotected bulk-delete/regenerate call site
- Add regression tests proving specific content survives a specific mutation
- Out of scope: new merge/regenerate features themselves — only hardening existing mutation paths against data loss

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15) — deep audit found no unguarded bulk-delete/regenerate path.

## safe-address-hardening

### Scope
- Every URL reaching the browser or getting server-fetched passes through isSafeSourceUrl/guardedFetchText
- Audit new call sites as they're found
- Out of scope: the two unmerged branches (curriculum-add-sources-easily, module-topic-expand-web-search) and building a new safety mechanism — only applying the existing one consistently

### Coding tasks
- [x] Add missing link-safety tests for the remaining 4 components

### Notes
- Mobile gap already fixed pre-run — assertSecureUrl in client.ts blocks non-loopback HTTP.
- 4 components rely only on the shared safeHref unit test, no dedicated component test yet.
- Completed items archived to .planning/LOG.md.
- Route file curriculum.$curriculumId.tsx has no dedicated safeHref test — no route-test pattern exists yet.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)

## study-prioritization

### Scope
- What's the single best next thing to study across every subject, at any moment
- Due-today queue, gap triage, cross-subject ranking, priority review accuracy
- Out of scope: new study modalities — only ranking/selection logic

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Ceiling-relative depth ranking and the dismissed-gap check-in revisit path are both intentional, not bugs.
- No cross-subject ranking exists yet — needs a human call on what the ranking weighs first.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)

## calibration-and-depth-accuracy

### Scope
- How accurately the app senses what depth a learner is actually at
- Calibration quiz quality, depth election correctness, go-deeper accuracy, headroom-offer correctness
- Out of scope: new quiz question types — only depth-signal accuracy

### Coding tasks
- [x] After calibration, recommend a short or long course from per-topic depth.
- [x] Stop single-question calibration electing deep depth off one lucky guess

### Notes
- Open: should near-perfect (not flawless) multi-question accuracy elect deep? Needs a human call.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)

## doc-site-ingestion

### Scope
- Learn-from-a-doc-site's own remaining scope: source granularity, module/topic sizing, source-discovery review flow
- Extending to other source types over time
- Out of scope: rebuilding the crawler itself — reuses gatherDocSiteCandidates as-is

### Coding tasks

### Notes
- Source triage already exists: SourceApprovalPanel gates candidates pre-structure.
- Out of scope: restoring approve/reject decisions across a retry — no record of prior decisions exists to restore.
- Completed items archived to .planning/LOG.md.
- Crawl fallback caps at 8 links with no signal — no message channel exists to surface it.
- Entry-point ordering is already deterministic — resolveRetryResearchSource prefers own sources; flat note is stale.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)

## llm-cost-observability

### Scope
- Every LLM call site is tiered/bounded appropriately and its cost is visible
- Retry/backoff discipline, context growth, caching across curriculum/probe/lecture/study-material generation
- Out of scope: changing which model each call uses — only cost visibility and guardrails, not model selection policy

### Coding tasks
- [x] Cap chat transcripts sent to every LLM call at a bounded turn count
- [x] Surface the new token-usage columns on the admin observability page
- [x] Extend llm_call_events recording to the ~17 other agent.generate call sites with none
- [x] Capture real token usage on llm_call_events for its 3 existing call sites

### Notes

## discovery-and-navigation

### Scope
- Finding and organizing content once the knowledge base outgrows a flat list
- Global search, dashboard, domain map, tagging
- Out of scope: new content types — organizing what already exists

### Coding tasks
- [x] Fix the study-session and learning-path detail pages never actually rendering
- [x] Fix the category, priority-review, recommendations, and domain-map pages never actually rendering
- [x] Let categories be dragged onto each other to nest, with a confirm warning.
  - [x] Phase 1: Nest one category under another on the backend
  - [x] Phase 2: Drag categories and curricula onto categories, with confirm

### Notes
- CORS bug fixed (WEB_ORIGIN header, server.ts:261) — was blocking browser-side fetches.

## chat-driven-reorganization

### Scope
- Natural-language move/merge/split/rename of the knowledge structure via chat
- Confirmation before any destructive reorganize action
- Out of scope: non-reorganize chat features (Socratic dialogue, Q&A) — those are separate directions

### Coding tasks
- [x] Add a rename control to the curriculum detail page
- [x] Let a curriculum, subject, or category be renamed.

### Notes
- Blocked: the only tool-calling chat surface is contractually read-only; needs a confirmation UX and a human decision.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15) — blocked pending human call, see above.

## cross-surface-practice

### Scope
- Letting the learner practice and get nudged from wherever they already are
- Telegram digest, mobile study app, Chrome extension capture consistency
- Out of scope: building a brand-new surface from scratch — hardening/extending existing ones

### Coding tasks
- [x] Let a mentor-subject learner practice probe questions from the mobile app
- [x] Let the learner record and submit a voice note from the app

### Notes
- Chrome extension is unmerged on an abandoned branch — needs a human call on landing it

## the-me-agent-integration

### Scope
- Connecting post-anki to the-me-agent's vault/learning-map via MCP for mentor context and course recommendations
- Out of scope: changes to the-me-agent itself — post-anki's side of the integration only

### Coding tasks

### Notes
- MCP is stdio-only; post-anki runs on Cloud Run — no prod path without a networked transport
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-12)

## e2e-reliability

### Scope
- Automated coverage for user-facing flows is reliable and non-flaky
- Fixing known-flaky tests, hydration-wait timing, locked-test maintenance
- Out of scope: writing coverage for brand-new features — this is fixing what already exists

### Coding tasks
- [x] Fix waitForHydration to wait for real hydration, not router presence

### Notes

## curriculum-structure-quality

### Scope
- Drafted course structure (module/topic sizing, granularity) is trustworthy without manual re-editing
- Source-discovery review flow decision follow-through
- Out of scope: the ingestion mechanism itself (doc-site-ingestion's job) — this is about quality of what gets drafted

### Coding tasks
- [x] Make lecture depth (awareness/working/deep) actually change what gets written.

### Notes
- No grounded gaps found yet — swept structure code, prompts, editing tools.

