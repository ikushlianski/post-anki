---
type: todo
branch: main
task: post-anki open items
state: open
updated: 2026-09-04
---
# Run todo

## classic-anki-review

### Scope
- Paste text, approve suggested bits, review them as classic Anki cards
- Review shows question, reveals answer, learner self-grades Again/Hard/Good/Easy
- Self-grades drive the existing bit schedule; queue serves due cards
- Pipeline runs after paste without manual scan calls
- Out of scope: Replacing the typed-answer LLM-graded mode; it stays as a separate mode

### Coding tasks
- [ ] Add Anki review mode: show answer, then self-grade Again/Hard/Good/Easy
- [ ] Serve only due or never-reviewed cards in the unscoped review queue
- [ ] Hide bit text above the question in Anki review mode
- [ ] Run bit detection and question generation right after paste
- [ ] Link review page from sidebar and add-knowledge success, with pending count
- [ ] Refresh review page so bits awaiting questions become approvable
- [ ] Add bulk approve on the knowledge-bit review page
- [ ] Add simple front/back basic-card variant for plain recall facts
- [ ] Keyboard shortcuts: Space reveals answer, 1-4 grade the card
- [ ] Show the next interval on each grade button, like Anki
- [ ] Add minute-level learning steps for new and failed cards
- [ ] Cap new cards per day and show due and new counts
- [ ] Undo the last grade with one click or keystroke
- [ ] Show session progress and an end-of-session summary
- [ ] Show done-for-today screen with next due time when queue empty
- [ ] Edit a card's question or answer during review
- [ ] Suspend or bury a card from the review screen
- [ ] Flag leeches after repeated failures and suspend them automatically
- [ ] Approve or reject suggestions by keyboard; approve all from a source
- [ ] Hide the chat panel until the answer is revealed

### Notes
- Gap analysis: .planning/anki-scenario-review/report.md


## exam-prep-from-sources

### Scope
- Add a link as a knowledge source, not just pasted text
- Out of scope: Multi-page doc-site crawling stays frozen - single-link fetch only
- Reuse the existing paste-to-cards pipeline for link content, same tagging and placement
- Add a timed mock-exam practice mode with a score summary at the end

### Coding tasks
- [x] Add a timed mock-exam mode that scores answers and shows a summary
- [x] Let a learner pick exam mode alongside existing practice modes

### Notes
- Completed items archived to .planning/LOG.md.
- Full scope shipped as of 2026-10-04: link-as-source, timed exam mode with score summary, and a dedicated exam-start entry point all already existed in the codebase — this direction's own Notes were stale, not the backlog


## aws-electric-fargate-deploy

### Scope
- Move the API backend to AWS ECS Fargate, not Lambda
- Out of scope: Splitting into multiple sync tasks before a second real app with its own database exists
- Lambda doesn't fit the API's fire-and-forget background work (card compile, curriculum create)
- Self-host Electric sync on one shared, reusable Fargate service in the same ECS cluster
- Keep the Telegram bot webhook and the SSR web app on GCP Cloud Run for now
- Reuse the existing AWS Route53 domain for the new backend

### Coding tasks
- [ ] Replace the Pulumi AWS stack with Serverless Container Framework for Fargate
- [ ] Shut down the live GCP backend once AWS is deployed and verified
- [ ] Set up AWS credentials and the secrets the new backend needs
- [ ] Deploy the Fargate services and confirm the API and sync both come up healthy
- [ ] Point the custom domain at the new backend once everything else works

### Notes
- Completed items archived to .planning/LOG.md.
- Bot can't run locally without a Telegram bot token and webhook secret
- Scope decision changed: web and bot now move to AWS too, GCP is being retired
- EXHAUSTED-AT-SCOPE (round 1, 2026-10-02) - IaC complete end to end, only live AWS credentials and manual cutover remain
- Open decision: SCF can't route Electric privately — pick Pulumi, SCF+shared-secret, or wait for SCF


## mcp-content-access

### Scope
- Expose post-anki's decks and course/module/section knowledge items through an MCP server, so any MCP client can read a learner's content
- Read-only access first: list/browse/search decks, courses, modules, sections, and individual knowledge items
- Out of scope for now: MCP write access (creating/editing content), auth beyond the app's existing per-user model
- Out of scope: Building a new UI for this — MCP clients are the interface

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Pre-existing: unset API_SHARED_SECRET lets every request through — confirm prod always sets it
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-30)


## spaced-repetition-scheduling

### Scope
- Per-knowledge-bit review scheduling with a simple SM-2-style interval, ease factor, and due date, rolled up to topic, module, and curriculum for a due count
- Out of scope: Cross-subject ranking or priority weighting across different topics - that is study-prioritization's own open call

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Balance goal: no due-pile guilt, but no skimming past a bit before it is truly known
- Checked: schedule updates per variant answer, not per bit/session — matches Scope wording, not a bug
- getDueCountsForTopics has no caller — built for a scoped detail view never shipped


## prose-knowledge-fisher

### Scope
- Accept raw prose or a Notion database as a knowledge source, not just structured rows
- Auto-detect distinct knowledge bits inside a block of prose
- Auto-tag each bit from one shared taxonomy of roughly 20-50 tags, reusing and growing it rather than inventing tags per bit
- Place each bit into the existing subject-curriculum-topic hierarchy, same as any other card
- Generate a few question variants per bit (open Wh-questions, fill-in-the-blank, others) probing the why, not just the fact
- Ask follow-up questions as a knowledge fisher persona that digs for the reasoning behind a fact
- Track per-tag and per-topic knowledge strength from how the learner answers, and update it as new answers come in
- Use that tracked strength to advise the learner where to go deeper
- Out of scope: The existing Biz Education Notion pipeline and generic notion-deck-connectors router stay separate pipelines
- Embed submitted knowledge bits and AI-generated Q&A into the existing vector pipeline, traceable back to their source bit

### Coding tasks
- [x] Hide a rejected bit from the admin placement-suggestions queue too
- [ ] Hold new knowledge bits as pending until the learner approves each one
  - [x] Phase 1: approval column and approve/reject/edit API
  - [x] Phase 2: block learner-facing surfaces
  - [ ] Phase 3: review screen
- [x] Generate a fill-in-the-blank variant for each knowledge bit
  - [ ] Phase 1: schema and migration
  - [x] Phase 2: fill-blank agent and repo
  - [ ] Phase 3: orchestrator and route
  - [ ] Phase 4: tests
- [x] Feed prose-sourced bits into the existing per-topic knowledge tracking
- [ ] Finish Notion-database ingestion (stuck, see accept-notion-source/todo.md)

### Notes
- Completed items archived to .planning/LOG.md.
- Per learning-brain's rule, deepen advice stays pull-only — never a push notification or a waiting-count badge
- Reuse tags table (schema.ts:791), biz-education's classifier, gap-mastery, and domain-recommendations — don't rebuild
- Default call: reordered items by dependency, rewrote 4 toward reuse after an overlap audit
- Embeddings: cheapest provider. Classification/placement calls: cheapest model that can classify + search, below cheap-tier if one exists
- STUCK (2026-09-24): tag-taxonomy-cap hit 3 review FAILs — don't re-attempt, work the 4 split-out items
- Stuck (2026-09-24): accept-notion-source hit 3 review failures — do not re-dispatch
- Stuck (2026-09-24): fill-in-the-blank-variant hit 3 review-factory FAILs, don't re-dispatch. Code landed unreviewed in a395949 (swept by an unrelated mark-done); one more regex bug found and fixed manually after that (f6fe80f) — needs a fresh review pass before trusting it fully
- Resolved (2026-09-24): follow-up-question — Pass 1 FAIL fixed fail-soft, Pass 2 PASS; advisor then found the prompt was kind-blind
- Blocked (2026-09-24): topic-tracking item — progressMaturity is gap-derived, no safe write path for bits
- Fresh review of fill-in-the-blank ran: FAIL on correctness and tests, 4th straight failure, stuck
- Possible unblock for topic-tracking: read-time fold of bit attempts, no progressMaturity write — needs human sign-off.
- EXHAUSTED-AT-SCOPE (round 2, 2026-10-02) - fill-blank and notion-ingestion stuck, topic-tracking needs human sign-off per its own plan folder
- Checked live: cheaper OpenRouter models split sentences into bad fragments — keeping deepseek-v4-flash


## biz-education-distiller

### Scope
- Every 15 min, pull up to 20 PA-tagged Biz Education items not yet marked synced
- Skip any item that contains a question
- Classify each with a cheap AI model: fits an existing deck, or needs a new one
- Fit items become facts linked to that topic; unplaced items land in an inbox with a suggested hierarchy spot
- Mark a Notion row synced via a real Notion property once processed — never remove or archive it
- Out of scope: The generic notion-deck-connectors router and its facts/CRM routing — this is a separate, Biz-Education-specific pipeline

### Coding tasks
- [ ] Wire NOTION_TOKEN into the deployed API before the 15-min job goes live

### Notes
- Completed items archived to .planning/LOG.md.
- Confirm Notion's Tags filter is case-sensitive — a lowercase "pa" tag might now be silently excluded
- Biz Education data source: collection://3cddec4d-fc6e-805c-93ea-000bc235a121, real Tags option is PA.
- A cheap OpenRouter tier already exists (tierToModelId 'cheap' = deepseek-v4-flash) — reuse it, don't add a new model.
- Marking synced needs a write-capable Notion token — current one may be read-only.
- PostAnki Synced (date) property already added to Biz Education — read/filter on it, don't recreate.
- Confirm apps/api's own NOTION_TOKEN can write pages.update before wiring the sync-mark step.
- EXHAUSTED-AT-SCOPE (round 1, 2026-10-02)


## notion-deck-connectors

### Scope
- Configure a Notion page or database as the source for one deck's cards
- Support both a plain paragraph-style page and a table/database-style page
- Each connector runs on its own schedule (nightly, daily, or manual), unattended
- Each connector has its own configurable rules: which items it pulls (e.g. by tag), and whether it removes or keeps an item in Notion once imported
- New cards from a connector feed into the same vectorize-and-label pipeline as any other card
- Out of scope: Automated multi-module course generation from an arbitrary link — stays frozen; non-Notion connectors for now

### Coding tasks
- [ ] Pull the two seed Notion pages read-only and inspect their shape

### Notes
- Completed items archived to .planning/LOG.md.
- Seed-page pull stalled this session — Notion MCP not logged in, needs human /login
- Schedule is a 15-min macOS LaunchAgent with a read-only Notion token, no deploy — off means skipped, never replayed.
- Open: approve @notionhq/client (official SDK, read-only token) for the app-side pull — not in TECH-STACK-BY-PROJECT.md yet.
- Notes become facts, not cards — the two 'into individual cards' items are met by the fact route.
- Blocked on the Notion MCP being connected — no live Notion access yet, do not start real work.


## local-first-sync

### Scope
- Finish turning on the already-built Electric sync in production
- Extend local-first sync to the existing mobile app, which is plain REST today
- Out of scope: The Tauri desktop wrapper — already tracked separately, blocked on a missing Rust toolchain

### Coding tasks
- [ ] Turn on the prod Electric rollout flag once its database secret is set

### Notes
- Completed items archived to .planning/LOG.md.
- Electric is fully built (dev, prod infra, 6 web collections) — prod never started, missing DB secret.
- Blocked on the prod Electric DB secret — see Manual steps. Do not flip the flag before it's set.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-19) — blocked pending human call, see above.


## grounded-knowledge-chat

### Scope
- Vectorize every card's question/answer content, reusing the existing embeddings pattern
- Label cards along existing dimensions only — subject, topic, tags, domain-map, no new taxonomy
- A global AI chat that answers from the learner's own card knowledge first, general knowledge only if allowed
- Out of scope: Automated course/curriculum generation from a link — frozen, see doc-site-ingestion's own Notes

### Coding tasks
- [x] Add a UI entry point to chat with a single knowledge item
- [x] Fix nondeterministic domainNodeName and add negative filter tests for card labels
- [x] Surface a card's subject, tags, and confirmed domain node alongside its topic
- [x] Show which cards grounded each chat answer, so it's never a black box
  - [x] Enrich chat response with card display data
  - [x] Render grounding cards under each reply

### Notes
- Completed items archived to .planning/LOG.md.
- 4 items above kept unarchived on purpose: review-factory findings on record for them were never marked fixed, even though later shipped items addressed the same defects — needs a fresh review pass before archiving, not a silent drop.
- On a card-lookup failure, the tutor's own prompt still says 'no cards matching' — contradicts the new UI message
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-19)


## prompt-and-performance-quality

### Scope
- LLM prompt quality across generation call sites — grounding, tone, accuracy
- App performance — page load, query speed, bundle size
- Out of scope: New user-facing features or browse surfaces (see content-browser-and-search); model tier or routing policy (see llm-cost-observability)

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- practice.$subjectId's sequential loader is correct — settings fetch upserts, gating avoids a write for invalid subjects.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-16)


## content-browser-and-search

### Scope
- A browsable cards table with question/answer/topic columns, searchable
- Drag-and-drop for reordering or organizing browsed content
- Natural-language topK search across topics and modules, ranked matches
- Out of scope: Generating new cards or course content — browsing and finding what already exists, not authoring it

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Cards-browser table has no pagination/limit — low priority, curriculum-scoped so bounded
- Card variants have no cross-topic order column — nothing for drag-reorder to persist to.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-16)


## agentic-framework-and-tool-principles

### Scope
- A written, grounded set of tool-call and agent/subagent conventions for post-anki's own AI framework, drawing on real lessons from building and studying other agent harnesses
- A persistent memory solution for post-anki's own AI framework, and the agents/subagents this actually needs, built out where genuinely missing
- Out of scope: Rewriting an existing, working agent from scratch just to match a new convention — apply this to new/missing pieces and real defects, not a wholesale rewrite

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)
- EXHAUSTED-AT-SCOPE (round 2, 2026-10-02) — one dup found, routed to spaced-repetition-scheduling, fixed


## shareable-browser-search

### Scope
- The post-anki web app supports a shareable URL for a search or browse state, so a link can be sent or bookmarked and reopens the same view
- Out of scope: Adding new search capabilities beyond what already exists — only making the existing search/browse state linkable

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Manual subject pick doesn't update the URL — a later URL change could revert it
- Global search lives in the root layout, not a route — not linkable, out of scope.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)


## ingestion-progress-visibility

### Scope
- When a new URL or doc page is added as a source, show clear processing state: which step is running, a rough progress estimate, and plain-language descriptions with no technical jargon
- Show a running count of cards generated so far, with cards and study material visible immediately in the post-anki browser as they land, not only once everything finishes
- Out of scope: Changing the underlying ingestion pipeline's actual steps — only making its existing state and output visible as it happens

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- StructureDraftPending already auto-refreshes every 2.5s while a draft is pending — not a gap.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.


## instant-study-cards

### Scope
- Generate a topic's cards (concept + rephrased-answer variants) automatically once its content is ready, not only when a learner opens it and clicks generate
- Trigger generation across many topics without wasted duplicate work or overwhelming the LLM queue
- Out of scope: Rebuilding the cards agent's variant-generation approach itself — the concept + 3-5 rephrased-variants design already exists and stays as-is

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.


- updatedAt isn't refreshed mid-run, so an unusually slow run could get reclaimed early
Business and architecture-level open items only. Small mechanical gaps get fixed directly.

Each root item below is one separate autonomous session, worked sequentially — not batched.
- A newly created bare topic has no content yet — no valid trigger point at creation.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-14)

## Wishlist for the night


## Decisions to make

- [x] Merge the courses home page and the dashboard into one, using the dashboard's design.
      Implemented; drag-and-drop between subjects is not yet reliable and is tracked separately.
- [ ] Register the drag-and-drop library in the shared tech-stack registry, which lives in
      another repository this run deliberately did not touch.
  - Manual, cross-repo — not a post-anki coding session.
- [ ] Turn on live-updating sync in production, or remove it entirely. It was deployed once and
      has never passed a health check since, so it currently serves no traffic. Check real
      billing before assuming it costs nothing.
  - [x] Decide: keep and fix, or remove — needs a human call before either path starts
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
- [x] A manual scan for new docs can return nothing while a scheduled scan runs for a different
      subject, because scans are serialised across the whole app instead of per subject.
  - In progress as item 9 of the active autonomous batch, issue #103.
- [x] The mobile app has two narrow address-safety gaps around local development and non-secure
      connection types. Low real-world risk, not yet hardened.
  - [x] Identify the two gaps precisely (local-dev addresses, non-secure connection types)
  - [x] Harden both, matching the safe-address check pattern shipping as issue #103 item 10

## Manual steps

- [x] Wire the API's database-backed test suite into the build pipeline.
  - [x] Confirm which test suite/config needs CI wiring (the integration config)
  - [x] Add it to the existing CI workflow, with a real DB service in CI
  - [ ] Confirm it runs green in CI before merging
- [ ] If live sync goes to production: set its database secret, then turn on the feature switch.
- [ ] The cloud development database is missing recent updates, so the board fails to load
      against it. Needs someone with access to apply them.
- [ ] Three database updates from the concurrency work exist only locally, not in the cloud.
- [x] Confirm Playwright gotcha notes got committed in verification-repo (outside this repo's
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
- Edit-vs-answer race (no row lock) is a precondition to fix before wiring UI/MCP to this endpoint
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15) — deep audit found no unguarded bulk-delete/regenerate path.

## safe-address-hardening

### Scope
- Every URL reaching the browser or getting server-fetched passes through isSafeSourceUrl/guardedFetchText
- Audit new call sites as they're found
- Out of scope: the two unmerged branches (curriculum-add-sources-easily, module-topic-expand-web-search) and building a new safety mechanism — only applying the existing one consistently

### Coding tasks

### Notes
- DNS-rebinding (no IP pinning) is a separate gap — new mechanism, needs human call
- Mobile gap already fixed pre-run — assertSecureUrl in client.ts blocks non-loopback HTTP.
- 4 components rely only on the shared safeHref unit test, no dedicated component test yet.
- Completed items archived to .planning/LOG.md.
- Route file curriculum.$curriculumId.tsx has no dedicated safeHref test — no route-test pattern exists yet.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Only unguarded citation-render site left is on the unmerged module-topic-expand-web-search branch.
- Route-test pattern for safeHref now exists — see curriculum.$curriculumId.test.tsx.
- EXHAUSTED-AT-SCOPE (round 2, 2026-10-03) — broad re-sweep of fetch/render/redirect/MCP sinks found nothing new
- Watch: knowledge-source intake is text-only today — guard its fetch/render once a URL-extracting scan is built

## study-prioritization

### Scope
- What's the single best next thing to study across every subject, at any moment
- Due-today queue, gap triage, cross-subject ranking, priority review accuracy
- Out of scope: new study modalities — only ranking/selection logic

### Coding tasks

### Notes
- listNextQuestionVariantsToAnswer also skips the confirmed/dormant filter via direct topicId
- Knowledge-bit due review never joins the cross-subject queue — needs a human design call
- Completed items archived to .planning/LOG.md.
- Ceiling-relative depth ranking and the dismissed-gap check-in revisit path are both intentional, not bugs.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)
- Chat card retrieval ignores dropped topics too - hide or keep? Needs a human call

## calibration-and-depth-accuracy

### Scope
- How accurately the app senses what depth a learner is actually at
- Calibration quiz quality, depth election correctness, go-deeper accuracy, headroom-offer correctness
- Out of scope: new quiz question types — only depth-signal accuracy

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Open: should near-perfect (not flawless) multi-question accuracy elect deep? Needs a human call.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Open: no learner-facing signal when a retake is kept-not-overwritten by the new depth guard. Needs a human call.

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
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.

## llm-cost-observability

### Scope
- Every LLM call site is tiered/bounded appropriately and its cost is visible
- Retry/backoff discipline, context growth, caching across curriculum/probe/lecture/study-material generation
- Out of scope: changing which model each call uses — only cost visibility and guardrails, not model selection policy

### Coding tasks

### Notes
- Message-length cap doesn't bound transcript array item count — total prompt size still unbounded
- Unverified: one oversized bit body could fail a whole 200-item embedding batch repeatedly
- No generation-result caching layer exists — needs a human call on invalidation policy first.
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)
- Re-checked 2026-10-02: resolveOfficialDocsUrl and gatherTrustedSourceCandidates already wrap generateWithRetry, stale note removed

## discovery-and-navigation

### Scope
- Finding and organizing content once the knowledge base outgrows a flat list
- Global search, dashboard, domain map, tagging
- Out of scope: new content types — organizing what already exists

### Coding tasks
- [x] Hide declined topics and unconfirmed curricula from global search and tag browse

### Notes
- CORS bug fixed (WEB_ORIGIN header, server.ts:261) — was blocking browser-side fetches.
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- A real item shipped under this direction after the exhaustion marker — re-evaluate next round.
- Found, out of scope: listTopicsForTag (tag.repo.ts, probe-session direction) has an unbounded query — needs filing elsewhere
- Blocked: fix reverses plan.md:59-63's intended dormant/included search behavior - needs human call

## chat-driven-reorganization

### Scope
- Natural-language move/merge/split/rename of the knowledge structure via chat
- Confirmation before any destructive reorganize action
- Out of scope: non-reorganize chat features (Socratic dialogue, Q&A) — those are separate directions

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Blocked: the only tool-calling chat surface is contractually read-only; needs a confirmation UX and a human decision.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15) — blocked pending human call, see above.

## cross-surface-practice

### Scope
- Letting the learner practice and get nudged from wherever they already are
- Telegram digest, mobile study app, Chrome extension capture consistency
- Out of scope: building a brand-new surface from scratch — hardening/extending existing ones

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Bot probe-flow has the same selfOutcome gap, but quick_test mode is unreachable there today
- Chrome extension is unmerged on an abandoned branch — needs a human call on landing it
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED round 2 (2026-10-03): web scoring, voice race checked, no bug

## the-me-agent-integration

### Scope
- Connecting post-anki to the-me-agent's vault/learning-map via MCP for mentor context and course recommendations
- Out of scope: changes to the-me-agent itself — post-anki's side of the integration only

### Coding tasks

### Notes
- MCP is stdio-only; post-anki runs on Cloud Run — no prod path without a networked transport
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-12)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)
- post-anki now has a networked MCP transport — re-check this blocker once live in prod.
- EXHAUSTED-AT-SCOPE (round 3, 2026-10-02) — re-verified: vault MCP is stdio + local SQLite/notes, no network path yet

## e2e-reliability

### Scope
- Automated coverage for user-facing flows is reliable and non-flaky
- Fixing known-flaky tests, hydration-wait timing, locked-test maintenance
- Out of scope: writing coverage for brand-new features — this is fixing what already exists

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- Blocked: this run cannot execute Playwright, so a flaky-test fix can't be verified.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Tag-picker's open click can be missed on a long page — hydration signal is global-only, no per-component fix yet.
- No 'locked test' convention found in verification-repo — that item is unresolvable here.
- Stale: tag-picker already uses per-component useHydrated gate, not global-only

## curriculum-structure-quality

### Scope
- Drafted course structure (module/topic sizing, granularity) is trustworthy without manual re-editing
- Source-discovery review flow decision follow-through
- Out of scope: the ingestion mechanism itself (doc-site-ingestion's job) — this is about quality of what gets drafted

### Coding tasks

### Notes
- Completed items archived to .planning/LOG.md.
- No grounded gaps found yet — swept structure code, prompts, editing tools.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.

## Notes

