---
type: todo
branch: main
task: post-anki open items
state: open
updated: 2026-09-04
---
# Run todo

## aws-electric-fargate-deploy

### Scope
- Move the API backend to AWS ECS Fargate, not Lambda
- Out of scope: Splitting into multiple sync tasks before a second real app with its own database exists
- Lambda doesn't fit the API's fire-and-forget background work (card compile, curriculum create)
- Self-host Electric sync on one shared, reusable Fargate service in the same ECS cluster
- Keep the Telegram bot webhook and the SSR web app on GCP Cloud Run for now
- Reuse the existing AWS Route53 domain for the new backend

### Coding tasks
- [ ] Shut down the live GCP backend once AWS is deployed and verified
- [x] Generalize the AWS stack so any future app can share the same Fargate cluster
- [x] Confirm the local Mac dev stack (web, api, bot) runs correctly end to end today
- [x] Package the API as a container image for the Fargate service
- [x] Write the shared AWS infrastructure: one ECS cluster and ALB, both apps as services
- [x] Test the Fargate-hosted API and sync end to end locally before deploying
- [ ] Set up AWS credentials and the secrets the new backend needs
- [ ] Deploy the Fargate services and confirm the API and sync both come up healthy
- [x] Confirm Neon logical replication is on before pointing Electric at it
- [ ] Point the custom domain at the new backend once everything else works

### Notes
- Bot can't run locally without a Telegram bot token and webhook secret
- Scope decision changed: web and bot now move to AWS too, GCP is being retired


## mcp-content-access

### Scope
- Expose post-anki's decks and course/module/section knowledge items through an MCP server, so any MCP client can read a learner's content
- Read-only access first: list/browse/search decks, courses, modules, sections, and individual knowledge items
- Out of scope for now: MCP write access (creating/editing content), auth beyond the app's existing per-user model
- Out of scope: Building a new UI for this — MCP clients are the interface

### Coding tasks
- [x] Let MCP's search_knowledge_items also find modules, tags, and knowledge bits
- [x] Build an MCP server exposing decks and course/module/section knowledge items
  - [x] Phase 1: MCP endpoint behind the shared token
  - [x] Phase 2: Course browsing tools
  - [x] Phase 3: Card and deck content tools
  - [x] Phase 4: Knowledge item search

### Notes
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-30)


## spaced-repetition-scheduling

### Scope
- Per-knowledge-bit review scheduling with a simple SM-2-style interval, ease factor, and due date, rolled up to topic, module, and curriculum for a due count
- Out of scope: Cross-subject ranking or priority weighting across different topics - that is study-prioritization's own open call

### Coding tasks
- [x] Have the new schedule-write lock reuse withNamedLock instead of inlining it
- [x] Guard concurrent schedule writes to the same knowledge bit from clobbering each other
- [x] Show a curriculum's due count on its curriculum page
- [x] Show a module's due count on its module or course page
- [x] Roll module due-counts up to a curriculum-level due count
- [x] Roll topic due-counts up to a module-level due count
- [x] Build a top-5-most-pressing-topics home screen, tap one to resume studying it
- [x] Roll bit due-dates up to a topic-level due count
- [x] Add per-bit SM-2-style interval, ease factor, and due date, updated from each answer's grade

### Notes
- Balance goal: no due-pile guilt, but no skimming past a bit before it is truly known


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
- [x] Extract optional short background/clarifying text alongside Q&A from inbox content
  - [x] Phase 1: schema and migration
  - [x] Phase 2: detector schema and orchestrator wiring
  - [x] Phase 3: repo persistence and next-batch exposure
  - [x] Phase 4: tests
- [x] Build a screen where the learner can actually answer knowledge-bit questions
  - [x] Phase 1: next-batch endpoint
  - [x] Phase 2: answer screen UI
  - [x] Phase 3: answer-screen tests
- [x] Record each learner answer to a question variant with a score and verdict
  - [x] Phase 1: schema and migration
  - [x] Phase 2: grader agent and repo
  - [x] Phase 3: orchestrator and route
  - [x] Phase 4: tests
- [x] Wrap knowledge-bit insert and status update in one transaction
- [x] Add a stale-processing-row reset so a crashed knowledge-bit scan doesn't strand a row forever
- [x] Get the tag-cap concurrency integration test actually running against real Postgres locally
- [x] Split tag.repo.ts's new cap-guard logic into its own file, back under the 300-line cap
- [x] Catch a thrown error from the forced tag matcher instead of letting it skip the last-resort fallback
- [x] Fix resolveOrCreateTag's race-recovery re-select when called inside an already-aborted transaction
- [x] Make the at-cap fallback pick the semantically nearest tag, not the alphabetically-first one
- [x] Make tag-cap assignment atomic against a concurrent call at the cap boundary
- [x] Validate the LLM's matched tag name against the real tag list before reusing it
- [x] Accept a pasted block of prose as a knowledge source
  - [x] Phase 1: schema and migration
  - [x] Phase 2: repo and controller
  - [x] Phase 3: route wiring and tests
- [x] Auto-detect distinct knowledge bits inside a block of prose
  - [x] Phase 1: schema, migration, and repo
  - [x] Phase 2: LLM detector agent and scan orchestrator
  - [x] Phase 3: route wiring and tests
- [x] Embed each submitted knowledge bit into the existing vector pipeline
  - [x] Phase 1: schema, migration, and embedding repo
  - [x] Phase 2: embedding scan orchestrator
  - [x] Phase 3: trigger route and tests
- [x] Auto-tag each detected knowledge bit from the shared taxonomy
  - [x] Phase 1: shared type, schema, migration, and repo
  - [x] Phase 2: tagger agent and scan orchestrator
  - [x] Phase 3: trigger route and tests
- [x] Reuse an existing close-match tag instead of minting a near-duplicate
- [x] Place each knowledge bit into the existing subject, curriculum, and topic it fits
  - [x] Phase 1: placement schema and migration
  - [x] Phase 2: placement agent and repo
  - [x] Phase 3: placement orchestrator and tests
  - [x] Phase 4: placement trigger route and integration test
- [x] Suggest a new hierarchy spot when no existing topic fits a bit
  - [x] Phase 1: suggestion resolution schema and repo
  - [x] Phase 2: suggestion review route
  - [x] Phase 3: admin panel for accept and reject
- [x] Generate a Wh-question variant for each knowledge bit
  - [x] Phase 1: schema and migration
  - [x] Phase 2: knowledge-fisher agent
  - [x] Phase 3: orchestrator and route
  - [x] Phase 4: tests
- [x] Generate a fill-in-the-blank variant for each knowledge bit
  - [ ] Phase 1: schema and migration
  - [x] Phase 2: fill-blank agent and repo
  - [ ] Phase 3: orchestrator and route
  - [ ] Phase 4: tests
- [x] Write a knowledge-fisher prompt that probes for the why behind a bit
- [x] Ask a knowledge-fisher follow-up question after the learner answers
  - [x] Phase 1: followup-generator agent
  - [x] Phase 2: orchestrator wiring
  - [x] Phase 3: tests
- [x] Embed each generated question and answer, linked back to its source knowledge bit
- [x] Score each answer against its bit's tags, reusing existing per-topic scoring for the topic side
  - [x] Phase 1: repo and orchestrator wiring
  - [x] Phase 2: tests
- [ ] Feed prose-sourced bits into the existing per-topic knowledge tracking
- [x] Track a dynamic knowledge-level per tag from scored answers
  - [x] Phase 1: repo query and mastery fold
  - [x] Phase 2: tests
- [x] Surface where the learner is strong, weak, or shallow by tag and topic
  - [x] Phase 1: tag-mastery endpoint
  - [x] Phase 2: tag-strength badge UI
- [x] Extend the existing deepen-recommendation flow to tag-level strength, pull-only
  - [x] Phase 1: weak-tags panel and wiring
  - [x] Phase 2: tag-deepen-panel tests
- [ ] Finish Notion-database ingestion (stuck, see accept-notion-source/todo.md)

### Notes
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


## biz-education-distiller

### Scope
- Every 15 min, pull up to 20 PA-tagged Biz Education items not yet marked synced
- Skip any item that contains a question
- Classify each with a cheap AI model: fits an existing deck, or needs a new one
- Fit items become facts linked to that topic; unplaced items land in an inbox with a suggested hierarchy spot
- Mark a Notion row synced via a real Notion property once processed — never remove or archive it
- Out of scope: The generic notion-deck-connectors router and its facts/CRM routing — this is a separate, Biz-Education-specific pipeline

### Coding tasks
- [x] Run the Biz Education distiller as its own 15-minute connector
- [x] Mark a processed Notion row synced without deleting or archiving it
- [x] Build a post-anki inbox listing unplaced rows with a suggested hierarchy spot
- [x] Save a fitting row as a fact linked to its matched deck topic
- [x] Classify a row as fitting an existing deck or needing a new one
- [x] Pick the cheapest working OpenRouter model for classifying each row
- [x] Skip a pulled row if its text contains a question
- [x] Pull up to 20 PA-tagged, not-yet-synced Biz Education rows per run
  - [x] Pull, filter, and pick the classification model
  - [x] Classify, save facts, and file inbox suggestions
  - [x] Mark synced and schedule

### Notes
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
- [x] Build the Notion reading-notes router: config, reader, fact and todo destinations, LaunchAgent
  - [x] Connector config and Notion reader
  - [x] Destinations and idempotent sync
  - [x] LaunchAgent and runner scripts
- [x] Save a Notion note tagged SPA as a fact in post-anki's production database
- [x] Route a Notion note tagged for a project, e.g. CRM, into that project's own backlog file
- [ ] Pull the two seed Notion pages read-only and inspect their shape
- [x] Let a connector be configured to remove or keep an item after import
- [x] Let a connector only pull items matching a configured rule, e.g. a tag
- [x] Run each Notion connector on its own schedule, unattended
- [ ] Let a deck's Notion source be re-synced to pick up edits
- [x] Turn a table-style Notion database into individual cards
- [x] Turn a paragraph-style Notion page into individual cards
- [x] Let a deck be configured with a Notion page or database as its source

### Notes
- Blocked on the Notion MCP being connected — no live Notion access yet, do not start real work.
- Schedule is a 15-min macOS LaunchAgent with a read-only Notion token, no deploy — off means skipped, never replayed.
- Open: approve @notionhq/client (official SDK, read-only token) for the app-side pull — not in TECH-STACK-BY-PROJECT.md yet.
- One 15-min LaunchAgent runs every connector — per-connector schedules and re-sync of edited notes are still open.
- Notes become facts, not cards — the two 'into individual cards' items are met by the fact route.


## local-first-sync

### Scope
- Finish turning on the already-built Electric sync in production
- Extend local-first sync to the existing mobile app, which is plain REST today
- Out of scope: The Tauri desktop wrapper — already tracked separately, blocked on a missing Rust toolchain

### Coding tasks
- [x] Sync cards to the mobile app locally instead of a plain network fetch
  - [x] Expose card tables through the Electric shape registry
  - [x] Add the Electric client and a mobile cards collection
  - [x] Join into a per-topic card view and render it
- [ ] Turn on the prod Electric rollout flag once its database secret is set

### Notes
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
- [x] Show an error in the global chat instead of leaving a question unanswered
- [x] Stop a failed card-embedding lookup from crashing the global chat with a 500
- [x] Stop editing a knowledge item from wiping its manually-assigned tags
  - [x] Phase 1: schema migration, source column, backfill default
  - [x] Phase 2: source-aware assign/upgrade/reset write paths
  - [x] Phase 3: tag-merge provenance preservation
  - [x] Phase 4: tests for every scenario
- [x] Add claim-token guards to embedding and tagging writes, like wh-question/fill-blank already have
- [x] Let the learner chat with a single knowledge item, grounded on it only by default
  - [x] Phase 1: repo, schemas, agent, service, controller, route
  - [x] Phase 2: tests for every scenario
- [x] Include Notion facts in the global chat's grounding alongside cards
  - [x] Embed facts
  - [x] Retrieve and ground on facts
- [x] Sort card tag names deterministically, add a multi-tag test
- [x] Fix nondeterministic domainNodeName and add negative filter tests for card labels
- [x] Surface a card's subject, tags, and confirmed domain node alongside its topic
- [x] Default matchedCards to empty array so the grounding line never silently disappears
- [x] Update api-client.test.ts's stale matchedCardIds mock to the new matchedCards shape
- [x] Fix askGlobalCardChat in api-client.ts dropping allowGeneralKnowledge before the HTTP call
- [x] Show which cards grounded each chat answer, so it's never a black box
  - [x] Enrich chat response with card display data
  - [x] Render grounding cards under each reply
- [x] Let the learner allow general AI knowledge in chat, off by default
  - [x] Backend opt-in flag
  - [x] Frontend toggle
- [x] Build a global chat that answers strictly from the learner's own matched cards
  - [x] Card-grounded chat endpoint
  - [x] Minimal global chat UI
  - [x] Tests for card-only grounding
- [x] Find the top-matching cards for a free-text query by vector similarity
- [x] Re-vectorize a card automatically when its question or answer text changes
- [x] Vectorize every card's question and answer text, store the embedding
  - [x] Add embedding columns to topic_card_variants, generate the migration
  - [x] Promote the embeddings HTTP client to a shared, generic location
  - [x] A card-embedding scan orchestrator, repo functions, and trigger endpoint
- [x] Let per-item chat opt into the model's own knowledge or a web search, on request
  - [x] Phase 1: schema, tools, dynamic agent, service wiring
  - [x] Phase 2: tests for every scenario
- [x] Let per-item chat create a new knowledge item or edit the current one from its answer
  - [x] Phase 1: draft endpoint for new-item or edited-body text
  - [x] Phase 2: edit endpoint that resets derived generation state
  - [x] Phase 3: tests for draft and edit scenarios

### Notes
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-19)


## prompt-and-performance-quality

### Scope
- LLM prompt quality across generation call sites — grounding, tone, accuracy
- App performance — page load, query speed, bundle size
- Out of scope: New user-facing features or browse surfaces (see content-browser-and-search); model tier or routing policy (see llm-cost-observability)

### Coding tasks
- [x] Add the same untrusted-content guard to QA chat's web-search tool as knowledge-bit chat has
- [x] Parallelize the duplicates page's two independent loader fetches
- [x] Add a strict one-result-per-item rule to the grade-batch agent's instructions
- [x] Add a no-invent-URL rule to the QA chat agent's instructions
- [x] Fix priority-review's unsatisfiable no-change fallback on fresh (all-unset) subjects
- [x] Batch per-topic gap/feedback queries in quiz generation, not one-per-topic
- [x] Check hot pages' DB queries for N+1 patterns
- [x] Profile and cut load time on the curriculum and dashboard pages
- [x] Review the ~24 agent prompts for grounding, tone, and accuracy gaps

### Notes
- practice.$subjectId's sequential loader is correct — settings fetch upserts, gating avoids a write for invalid subjects.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-16)


## content-browser-and-search

### Scope
- A browsable cards table with question/answer/topic columns, searchable
- Drag-and-drop for reordering or organizing browsed content
- Natural-language topK search across topics and modules, ranked matches
- Out of scope: Generating new cards or course content — browsing and finding what already exists, not authoring it

### Coding tasks
- [x] Rank topic/module search results by relevance, return top matches only
- [x] Add a topic/module search box that takes a plain-language query
- [x] Add text search over the cards browser table
- [x] Build a cards browser: table with question, answer, topic columns

### Notes
- Card variants have no cross-topic order column — nothing for drag-reorder to persist to.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-16)


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
- EXHAUSTED-AT-SCOPE (round 2, 2026-10-02) — one dup found, routed to spaced-repetition-scheduling, fixed


## shareable-browser-search

### Scope
- The post-anki web app supports a shareable URL for a search or browse state, so a link can be sent or bookmarked and reopens the same view
- Out of scope: Adding new search capabilities beyond what already exists — only making the existing search/browse state linkable

### Coding tasks
- [x] Make the cards-browser table's search text shareable via the page URL
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
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.


## instant-study-cards

### Scope
- Generate a topic's cards (concept + rephrased-answer variants) automatically once its content is ready, not only when a learner opens it and clicks generate
- Trigger generation across many topics without wasted duplicate work or overwhelming the LLM queue
- Out of scope: Rebuilding the cards agent's variant-generation approach itself — the concept + 3-5 rephrased-variants design already exists and stays as-is

### Coding tasks
- [x] Guard concurrent card-generation triggers for the same topic from duplicating LLM work
- [x] Skip starting new card generation when a topic's cards are already ready or in progress
- [x] Start generating cards for topics a learning-list release just made available
- [x] Start generating a topic's cards once course structure is confirmed, not on first open

### Notes


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
- [x] Fix stale comment: fill-blank-claim.repo.ts still calls wh_question failure permanent
- [x] Update stale knowledge_bits column-snapshot test to match current schema
- [x] Fix wh-question generation: same concurrent-scan race and permanent-fail-mark bug as fill-blank

### Notes
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15) — deep audit found no unguarded bulk-delete/regenerate path.

## safe-address-hardening

### Scope
- Every URL reaching the browser or getting server-fetched passes through isSafeSourceUrl/guardedFetchText
- Audit new call sites as they're found
- Out of scope: the two unmerged branches (curriculum-add-sources-easily, module-topic-expand-web-search) and building a new safety mechanism — only applying the existing one consistently

### Coding tasks
- [x] Add a dedicated safeHref test for the curriculum route's source-link rendering
- [x] Add missing link-safety tests for the remaining 4 components

### Notes
- Mobile gap already fixed pre-run — assertSecureUrl in client.ts blocks non-loopback HTTP.
- 4 components rely only on the shared safeHref unit test, no dedicated component test yet.
- Completed items archived to .planning/LOG.md.
- Route file curriculum.$curriculumId.tsx has no dedicated safeHref test — no route-test pattern exists yet.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Only unguarded citation-render site left is on the unmerged module-topic-expand-web-search branch.
- Route-test pattern for safeHref now exists — see curriculum.$curriculumId.test.tsx.

## study-prioritization

### Scope
- What's the single best next thing to study across every subject, at any moment
- Due-today queue, gap triage, cross-subject ranking, priority review accuracy
- Out of scope: new study modalities — only ranking/selection logic

### Coding tasks
- [x] Rank the cross-subject due queue by overdue-ness first, gap severity as tie-break

### Notes
- Completed items archived to .planning/LOG.md.
- Ceiling-relative depth ranking and the dismissed-gap check-in revisit path are both intentional, not bugs.
- No cross-subject ranking exists yet — needs a human call on what the ranking weighs first.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)

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
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.

## llm-cost-observability

### Scope
- Every LLM call site is tiered/bounded appropriately and its cost is visible
- Retry/backoff discipline, context growth, caching across curriculum/probe/lecture/study-material generation
- Out of scope: changing which model each call uses — only cost visibility and guardrails, not model selection policy

### Coding tasks
- [x] Stop tech-research grounding retrying its own model-tier lookup on every attempt
- [x] Fix tech-research grounding's model-tier lookup so a failure there can't crash the caller
- [x] Add retry and cost logging to the two remaining tech-research direct-fetch LLM calls
- [x] Add retry and cost logging to the probe web-search LLM calls
- [x] Add retry and cost logging to the tech-research web-search LLM calls

### Notes
- No generation-result caching layer exists — needs a human call on invalidation policy first.
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- EXHAUSTED-AT-SCOPE (round 2, 2026-09-29)
- Follow-up: resolveOfficialDocsUrl and gatherTrustedSourceCandidates have their own unwrapped direct-fetch calls, same gap

## discovery-and-navigation

### Scope
- Finding and organizing content once the knowledge base outgrows a flat list
- Global search, dashboard, domain map, tagging
- Out of scope: new content types — organizing what already exists

### Coding tasks
- [x] Let a tag page browse everything tagged with it, not just probe questions
- [x] Make an unplaced knowledge bit in search results actually openable
- [x] Make the header search bar also find modules, knowledge bits, and tags
- [x] Show which tag or topic a search result belongs to
- [x] Let global search also find cards by tag name
- [x] Let global search also find knowledge bits by their text

### Notes
- CORS bug fixed (WEB_ORIGIN header, server.ts:261) — was blocking browser-side fetches.
- Completed items archived to .planning/LOG.md.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- A real item shipped under this direction after the exhaustion marker — re-evaluate next round.

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
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)

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
- [x] Make first-ever streak creation safe under two concurrent quiz answers
- [x] Fix waitForHydration to wait for real hydration, not router presence

### Notes
- Blocked: this run cannot execute Playwright, so a flaky-test fix can't be verified.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- Tag-picker's open click can be missed on a long page — hydration signal is global-only, no per-component fix yet.
- No 'locked test' convention found in verification-repo — that item is unresolvable here.

## curriculum-structure-quality

### Scope
- Drafted course structure (module/topic sizing, granularity) is trustworthy without manual re-editing
- Source-discovery review flow decision follow-through
- Out of scope: the ingestion mechanism itself (doc-site-ingestion's job) — this is about quality of what gets drafted

### Coding tasks
- [x] Make lecture depth (awareness/working/deep) actually change what gets written.

### Notes
- No grounded gaps found yet — swept structure code, prompts, editing tools.
- EXHAUSTED-AT-SCOPE (round 1, 2026-09-15)
- PAUSED (2026-09-19) — automated course-from-a-link creation is frozen for the knowledge-chat pivot.

## Notes

