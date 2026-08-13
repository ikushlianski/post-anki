---
type: spec
branch: To-Learn-List
task: learning list intake, fixed Areas, liveness-gated lazy generation
complexity: very-complex
state: draft
updated: 2026-08-07
---

# Spec: learning list intake

### Summary

Paste an article, a series of articles, or a video plus its description, and post-anki decides
what it is and where it belongs — folding it into the objective taxonomy by default, and
proposing a mini-course only when it is genuinely a multi-part series. Web Development gains
React, Node.js and AWS as sub-subjects, each with exactly 10 fixed Areas plus "Other", so
content always has a stable home that exists independently of what has been studied. Nothing is
generated eagerly: every tracked item carries a 1–10 liveness score driven by actual answering,
and only live items get their next slice of questions. Dying items get nudged by name; declining
a nudge makes them dormant, never deleted.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Taxonomy & concerns | S3, S12 | `domain_nodes.kind`, concern columns, Areas seed | Areas visible on the domain map | None | Seed idempotent, single run |
| 2 — Intake & routing | S1, S2, S3, S13, S14 | learning list entity, guarded fetch, classifier, routing derivers | Capture input + recommendation review | Phase 1 | Classification under one agent call |
| 3 — Lazy generation & depth | S4, S5, S6 | slice planner, depth election, headroom | Depth prompt at first study | Phase 2 | First slice ≤ 3 topics |
| 4 — Liveness & nudges | S7–S11, S15 | liveness table + derivers, nudge delivery | Learning list with liveness, nudge response | Phase 3 | Liveness derived at read time |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `deriveSeriesVerdict` | extracted page signals (explicit series phrase, sibling nav count, pagination, breadcrumb depth) | `single \| series \| unknown` + the signals that decided it | S1, S2, S3 |
| `recommendDestination` | verdict, matched Area, existing curriculum match | `fold_in \| mini_course \| park` | S1, S2, S3 |
| `resolveAreaPlacement` | AI-proposed Area name, the sub-subject's real Areas | an existing Area id, or that sub-subject's "Other" | S12 |
| `isSafeSourceUrl` | candidate URL | allowed / rejected with reason | S14 |
| `planQuestionCeiling` | verdict, part count | target question ceiling (20–30 band) | S4, S7 |
| `nextIngestionSlice` | liveness, questions already generated, ceiling | slice size, or null when not live / at ceiling | S4, S7, S9 |
| `computeLiveness` | last provenance-linked activity, last nudge + response, now | score 1–10. **Only mini-courses, curricula and Areas are scored** — folded-in single articles are not, because their topics share an Area's question pool and would score circularly (their own released slices generate the activity that keeps them alive) and inflated (other sources' answers in the same Area). | S7, S8, S11 |
| `shouldNudge` | liveness, last nudge time, now | whether to nudge now | S8, S11 |
| `applyNudgeResponse` | current score, yes/no | new score (bounded, non-ratcheting) | S9, S10 |
| `isDormant` | last nudge response only | whether the entity is suppressed everywhere. **A decayed score never makes anything dormant** — only an explicit decline does. Decay stops generation; it must never stop surfacing. | S10, S11 |
| `deriveDepthHeadroom` | elected depth, available depth | remaining headroom, or none | S5, S6 |
| `shouldOfferHeadroom` | topic mastery at elected depth, last offer time | whether to offer advanced now | S6 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `apps/api/src/learning-list/` controller + repo; `recommendDestination`, `resolveAreaPlacement`; `topics.sourceId` write | `apps/web/src/learning-list/` capture input + fold-in confirmation | None |
| S2 | `deriveSeriesVerdict` + classification orchestrator; recommendation persisted, no curriculum write | recommendation review with the deciding signals shown | None |
| S3 | `curricula.concern` write; multi-node suggest via existing `curriculum-domain-mapping/`; sibling capture in `learning-list/` repo | concern badge on curriculum; cross-cutting rollup includes curricula | None |
| S4 | `planQuestionCeiling`, `nextIngestionSlice`; generation orchestrator honours slice size | slice progress + remaining ceiling on the item | None |
| S5 | `topics.depthElectedAt` / `availableDepth` write in `apps/api/src/topic/`; gap generation capped at elected depth | depth prompt at first study of a topic | None |
| S6 | `deriveDepthHeadroom`, `shouldOfferHeadroom`; offer cooling-off persisted | headroom offer + decline | None |
| S7 | `computeLiveness` read path; slice release on answer submission | liveness shown on the learning list | None |
| S8 | `shouldNudge`; nudge wiring into `apps/api/src/push/` | nudge surface with item name + related items | None |
| S9 | `applyNudgeResponse`; resume from ingestion cursor | nudge yes response | None |
| S10 | `isDormant`; suppression filters in daily push, probe and recommendation reads | nudge no response; dormant items still listed | None |
| S11 | liveness rows for curricula and domain nodes; unset-vs-dead handling | paused-course liveness on the same list | None |
| S12 | `resolveAreaPlacement` fallback to "Other"; taxonomy seed | "Other" visible on the domain map | None |
| S13 | video/description handling in `apps/api/src/curriculum/source-text.ts` | capture input accepts a pasted description | None |
| S14 | `apps/api/src/shared/guarded-fetch.ts`, `isSafeSourceUrl`; `source-fetch.ts` delegates | None | None |
| S15 | read-time liveness derivation in `apps/api/src/liveness/` repo | None | None |

### Files to create

```
packages/core/src/learning-list/        — series verdict, destination, slice, ceiling derivers + tests
packages/core/src/liveness/             — liveness, nudge, dormancy, headroom derivers + tests
packages/shared/src/learning-list.ts    — zod schemas for item, verdict, recommendation
packages/shared/src/liveness.ts         — zod schemas for score, nudge response
apps/api/src/learning-list/             — controller, repo, classification orchestrator
apps/api/src/liveness/                  — repo (read-time derivation), nudge wiring
apps/api/src/shared/guarded-fetch.ts    — the one allowlisted fetcher
apps/api/scripts/seed-data/web-dev-areas.yaml — React / Node.js / AWS sub-subjects + Areas
apps/web/src/learning-list/             — capture, review, liveness list, nudge response
```

### Files to modify

```
apps/api/src/db/schema.ts               — new tables/columns (see Data model changes); nothing existing dropped
apps/api/src/router.ts                  — /learning-list routes (resource-named, plural)
apps/api/src/curriculum/source-fetch.ts — delegate to guarded-fetch; keep existing callers working
apps/api/src/curriculum/source-text.ts  — video-description handling
apps/api/src/push/                      — nudges ride the existing daily-push path
apps/api/scripts/seed-domain-taxonomy.ts — also load the web-dev Areas file; stays idempotent
packages/shared/src/concern.ts          — unchanged enum; re-exported for curriculum/topic use
```

### Data model changes

- New: `learning_list_items`, `liveness` (polymorphic, unique on entityType+entityId).
- New columns: `domain_nodes.kind`; `curricula.concern`; `topics.concern`; `topics.sourceId`;
  `topics.depthElectedAt`; `topics.availableDepth`.
- Migration generated via Drizzle, run through the existing migrate script. Never pushed.

### Documentation changes

- `docs/architecture/` has no README/taxonomy in this repo yet — bootstrap it before writing.
- Learning domain: new component doc for learning-list intake and classification.
- Knowledge-map domain: update the existing domain-node/taxonomy component doc to describe
  sub-subjects, Areas, and the "AI never creates an Area" rule as current state.
- Study-loop domain: new component doc for liveness, lazy generation and nudges.

### BAML test coverage

Not applicable — no BAML functions touched. Agents here go through Mastra, as elsewhere in this repo.

### Decisions made autonomously

- Basics → `working`, advanced → `deep` on the existing depth ladder — reuses the enum instead of
  inventing a parallel basics/advanced axis.
- Depth is asked when a topic first comes up for study, not for all topics at capture — honours
  "ask me on each topic" without a 30-question interrogation, and matches lazy generation.
- Liveness is a polymorphic table rather than columns on three entities — matches the existing
  `tag_assignments` / `study_item_feedback` convention and keeps one scale.
- Nudges ride the existing daily-push/Telegram path rather than a new channel.
- Areas are `domain_nodes` rows, not a new entity — the taxonomy is already arbitrary-depth.
- Security gets no Area anywhere; it stays a `concern`, so it remains visible across all three
  sub-subjects at once.
- First slice defaults to one module / ~3 topics; ceiling lands in the 20–30 question band.
- The 8 sibling AWS guides are captured but never auto-ingested.
- Plan folder is a slug, not an issue code — matches every other folder in this repo's `.planning/`.
- Folded-in single articles are generated once and not liveness-scored (revises the earlier
  "everything, one scale" answer, which was given before the circularity was found). `sourceId`
  provenance is still required so a declined nudge makes the right content dormant.
- Liveness constants live in one named module so they are tunable without a migration. Defaults:
  decay half-life 10 days, generation threshold 5/10, nudge threshold 4/10, nudge cooldown 7 days,
  starting score 7 on approval. Chosen to match "degrading within a week or two".
- The shared guarded fetcher also replaces the two unguarded user-supplied-URL fetch paths already
  flagged on `main` — adding a third unguarded path would reproduce a known, human-flagged weakness.
- **Flagged assumption, not blocking:** series detection is the weakest link — most blogs never
  say "part of a series", so a real series can read as single. Mitigated by defaulting ambiguous
  cases to `unknown` → park, and by always showing the deciding signals for override (S2).

### Implementation order

1. `isSafeSourceUrl` + shared guarded fetcher — closes the two already-flagged unguarded paths first
2. `deriveSeriesVerdict`, `recommendDestination`, `resolveAreaPlacement` — red-green-refactor
3. `planQuestionCeiling`, `nextIngestionSlice`, `deriveDepthHeadroom`, `shouldOfferHeadroom`
4. `computeLiveness`, `shouldNudge`, `applyNudgeResponse`, `isDormant`
5. Schema + generated migration; taxonomy seed for React / Node.js / AWS Areas
6. Repos and controllers (learning list, liveness), classification orchestrator
7. Router wiring, nudge delivery through daily push
8. Web: capture, recommendation review, learning list, depth prompt, nudge response

### Scope boundary

- Web Development only — the other 14 domains keep today's taxonomy untouched.
- No video transcript fetching; the pasted description is the source.
- No PDF or file upload (tracked separately as #92).
- No visual knowledge-map changes (#86) — Areas are structural, not a new UI surface.
- No automatic promotion of the 8 sibling AWS guides.
