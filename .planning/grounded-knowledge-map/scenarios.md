---
type: scenarios
branch: grounded-knowledge-map
task: Mandatory trusted-source grounding + approval gate for course creation, pre-assessment step, cross-cutting tags, and quiz preload/replenish
state: confirmed
updated: 2026-07-18
---
# Scenarios: Grounded knowledge map

## Business Scenarios

### Phase 1 — Trusted sources are mandatory, and approval happens before generation

### SCENARIO 1: Asking broadly for a course, with no link, still gets grounded in real material

The learner asks for "a course on Next.js" — by name only, no URL — either on the web form or via the bot's `/study` command. Instead of the model writing a curriculum from its own training data, the system finds the technology's real official docs (or, failing that, its most credible public material) and treats that as the basis for the course.

What to verify:
- A bare-name request (web form with no docUrl, or bot `/study <name>`) triggers a real web search to resolve the likely official docs URL, not an immediate synthesis call.
- Once an entry point is found, the same llms.txt-first grounding chain used for an explicit docUrl runs against it.
- The legacy "search once, hand straight to the architect agent" path no longer exists for course creation — every research-triggered path ends at the approval step below, never straight at synthesis.

### SCENARIO 2: The learner sees candidate links and must explicitly approve them before anything is generated

After research runs, the learner is shown the list of candidate source links it found — before any module or topic exists.

What to verify:
- The curriculum sits in a distinct "awaiting approval" state; no modules/topics are generated yet.
- Each candidate shows enough to judge it (title, URL, which discovery step found it — e.g. "official docs", "blog post", "research paper").
- Generation is not reachable from anywhere else — there is no button or path that starts course synthesis while the curriculum is in this state, other than the approval action itself.

### SCENARIO 3: The learner edits the candidate list before generating

The learner removes a candidate they don't trust and pastes in a link of their own that wasn't found automatically.

What to verify:
- Removing a candidate deletes it outright — it plays no further part in generation.
- A manually added link is treated identically to an approved candidate once submitted.
- Only the resulting approved set is ever fetched in full and handed to the course-generation step.

### SCENARIO 4: Generation is structurally blocked until at least one source is approved

The learner opens the approval screen but hasn't approved or added anything yet.

What to verify:
- The "approve & generate" action is disabled (or rejected server-side) with zero approved sources.
- There is no code path where course structure is generated for a research-triggered curriculum without at least one approved source, short of the explicit override in SCENARIO 5.

### SCENARIO 5: No trustworthy material is found — the learner is warned, not silently downgraded

The technology named is obscure enough that neither a docs site nor a useful search result turns up.

What to verify:
- The approval screen shows zero candidates and a visible warning that generating without any source is not recommended.
- Proceeding anyway requires a distinct, explicitly-labeled action (not the same button as a normal approval) — the ungrounded path is available, never the default.
- The resulting curriculum is generated from general knowledge exactly as today's already-shipped empty-grounding fallback behaves for question content — this scenario does not add a new failure state, only a new consent step in front of an existing fallback.

### SCENARIO 6: Trusted sources include blogs and papers, not only documentation sites

The learner asks for a course on a topic best covered by a well-known company engineering blog post or a research paper, not a docs site (e.g. a specific caching pattern, or a published algorithm).

What to verify:
- Candidate gathering runs a general trusted-source search (official blogs, well-established engineering blogs, research papers) alongside — not instead of — the docs-site chain.
- A candidate found this way carries a label distinguishing it (e.g. "blog post" / "research paper") on the approval screen.

### SCENARIO 7: The bot defers the approval moment to the web app, with a clear reason why

A learner runs `/study Next.js` in Telegram with no URL.

What to verify:
- The bot's reply explains that trusted sources are being searched for and must be reviewed/approved on the web app before the course is generated — it does not claim the course is ready.
- No synthesis happens from the bot side without that approval having occurred on the web app first (unchanged architectural boundary — the bot has no curate/confirm UI today and gets none here either).

### SCENARIO 8: Studying a course with no verified sources shows a visible notice, not a silent gap

The learner studies an older curriculum (created before this feature, or one they explicitly generated ungrounded via SCENARIO 5's override) whose citation allowlist is empty.

What to verify:
- The quiz UI shows a small, visible notice that this course's material isn't citation-verified — not just silently omitting citation links as today's shipped grounding already does.
- This is a warning, not a block — the "quick test to check yourself" framing this app already supports for casual quizzing is not affected by this notice.

### SCENARIO 9 (technical): The docs crawl is bounded, never a general crawler

The docs site linked/discovered has hundreds of pages linked from its index.

What to verify:
- Only pages linked directly from the single entry page are candidates — no second hop, no recursive crawl.
- The number of pages fetched in full is capped at a small fixed number regardless of how many links the index page contains.

## Phase 2 — A pre-assessment step, distinct from the level picker

### SCENARIO 10: Right after confirming a course, the learner self-grades what they already know

The learner just clicked "Confirm" on a freshly curated curriculum.

What to verify:
- Before any topic's study page is reached for the first time, the learner sees every included topic listed with a self-grade control.
- This is a one-time step per curriculum — once passed, later visits to the curriculum go straight to its topics as they do today.

### SCENARIO 11: This step is separate from the level picker, and doesn't duplicate its mechanism

The learner already picked "Advanced" at creation time (the existing level picker biasing which topics started pre-included).

What to verify:
- The pre-assessment step still runs after confirm regardless of what level was picked at creation — it's a different question (what do you already know on this specific finished course) than the level picker's (which tier should the map lean toward).
- The self-grade value set here is the same existing per-topic field the curate screen's inline widget already writes — no second, parallel "grade" concept is introduced.

### SCENARIO 12: Grading is optional per topic — leaving some blank doesn't block starting

The learner grades six of nine topics and clicks through.

What to verify:
- "Start studying" is reachable regardless of how many topics were actually graded.
- Ungraded topics behave exactly as they do today (`selfGrade: null`).

## Phase 3 — Cross-cutting tags and knowledge-bits

### SCENARIO 13: A module or topic can carry a tag that has nothing to do with its own technology

The learner tags a "Node.js event loop" module with "performance," and a "Core Web Vitals" topic under a different curriculum with the same tag.

What to verify:
- Tags attach at either the module or the topic level.
- The same tag can be attached to items under entirely different subjects/curricula/technologies.
- Tag names are matched case-insensitively so "Performance" and "performance" don't create two tags.

### SCENARIO 14: Studying "the performance topic" pulls from every technology that has it

The learner starts a study session for the "performance" tag.

What to verify:
- The resulting session includes questions drawn from topics under more than one curriculum/technology, wherever that tag is attached (directly on a topic, or inherited from its module).
- Each question is still generated using its own topic's own curriculum's grounding material — a cross-cutting session doesn't lose per-topic source correctness.
- Answering a question still updates that specific topic's own progress and closes that specific topic's own gap, exactly as a normal single-curriculum session would.

### SCENARIO 15: New courses come pre-tagged, not blank

The learner generates a new course on a technology whose material clearly covers a recognizable cross-cutting concept (e.g. a security-focused module).

What to verify:
- Course generation proposes a small number of tags per module as part of its normal output.
- A proposed tag that matches an existing tag (case-insensitively) reuses it rather than creating a duplicate.
- The learner can still add or remove tags by hand afterward — AI-suggested tags are a starting point, not the only way tags get attached.

### SCENARIO 16 (technical): Per-topic progress and gap-closing still work correctly across curricula

A tag-scoped session answers a question belonging to Topic A (Curriculum 1) followed by one belonging to Topic B (Curriculum 2).

What to verify:
- Topic A's progress/gap state updates using only Topic A's own data, and likewise for Topic B — no cross-contamination between the two curricula's state.
- The session's own running total/correct/answered counters stay accurate regardless of how many different curricula its questions are drawn from.

## Phase 4 — Quiz preload and replenishment

### SCENARIO 17: A quiz never leaves the learner with nothing to answer

The learner is partway through a large quiz session.

What to verify:
- At any point before the session is fully complete, there are at least 10 not-yet-answered questions either already loaded or in the process of being generated.

### SCENARIO 18: Running low triggers background generation, before the learner runs out

The learner answers down to exactly 10 remaining unanswered questions in the session.

What to verify:
- A new batch of questions starts generating at that point, without the learner having to click anything.
- The learner isn't blocked or shown a loading state while this happens in the background — they keep answering the questions already loaded.
- Once generation finishes, the newly generated questions become available to keep answering without a full page reload.

### SCENARIO 19: Replenished questions target what the learner is actually struggling with

The learner has gotten several questions wrong on one concept within this session, while sailing through others.

What to verify:
- The replenish batch is generated using this session's own currently-open gaps, prioritized toward ones the learner hasn't yet demonstrated, rather than uniformly re-covering the topic's entire original gap list the way the very first batch does.

### SCENARIO 20 (technical): Replenishment cannot fire twice at once

The learner answers two questions in quick succession, both crossing the low-water-mark at nearly the same moment.

What to verify:
- Only one replenish generation call is in flight for a given session at any time.
- The second answer's check sees that a replenish is already running and does not start a duplicate.

## Technical/Architectural Scenarios

See SCENARIO 9, 16, 20 above (folded into their business phases since each is a direct correctness condition on the business behavior it supports, not a separate concern).
