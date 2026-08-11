---
type: spec
branch: To-Learn-List
task: milestones and completion — celebratory, un-losable award records
complexity: medium
state: draft
updated: 2026-08-08
---

# Spec: milestones and completion

### Summary

A milestone is a one-time, un-losable fact: "this curriculum reached 100% mastered" or "this Area
reached 100% mastered," recorded once, on the first read that observes it, and never touched again.
Completion criteria reuse the existing rollups completely unmodified — a curriculum's own
`moduleProgress` percent for curriculum milestones, `domainNodeProgress` percent for Area
milestones (Web Development's fixed Areas only, matching `learning-paths`'/analytics' identical v1
scope). The hazard this module exists to defuse is named directly in the task brief: gamification
that manufactures obligation is exactly `.product/REJECTED.md`'s guilt pattern. The resolution is
mechanical, not just a policy statement — once awarded, a milestone has no path back to
"unawarded," no "at risk" state, no percent-to-next-milestone countdown, and no delivery channel.
Later structural changes (a new topic added to an already-100%-mastered curriculum, a new
curriculum mapped under an already-100%-mastered Area) can and will drop the live percent back
below 100 — the awarded milestone does not care and is never revoked or re-flagged. The milestones
page is a celebratory gallery of what already happened, visited entirely at Ilya's own initiative.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Completion criteria | S1, S2 | `isComplete`; reuses `moduleProgress`/`domainNodeProgress` unmodified | None yet | None | Reuses already-fetched progress, no new query shape |
| 2 — Award-on-read | S3, S4, S5, S9 | `milestones` table, `milestone.repo.ts` (evaluate + insert-if-new), unique index + `23505` handling | None yet | Phase 1 | Evaluated only when `/milestones` is opened, no background scan |
| 3 — Non-regression | S6, S7 | `milestone.repo.ts` (read path never re-derives from live percent) | None yet | Phase 2 | None |
| 4 — Web | S8 | None | milestones gallery | Phase 3 | None |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `isComplete` | `percent: number` (from `moduleProgress`/`domainNodeProgress`, unmodified) | boolean, `percent >= 100` | S1, S2 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `packages/core/src/milestone/is-complete.ts`; `apps/api/src/milestone/milestone.repo.ts` (reads curriculum topics, calls `moduleProgress` unmodified) | None yet | None |
| S2 | `milestone.repo.ts` (reads Area nodes + curriculum topics, calls `domainNodeProgress` unmodified, scoped to `kind: "area"`) | None yet | None |
| S3 | `apps/api/src/db/schema.ts` (`milestones` table); `milestone.repo.ts` (`awardIfNew` — insert-if-not-exists) | None yet | None |
| S4 | `milestone.repo.ts` (unique index on `(entityType, entityId, criteriaKey)`, `23505` caught and treated as no-op — same pattern as `subject_duplicate_suggestions_pending_pair_unique`) | None yet | None |
| S5 | `apps/api/src/milestone/milestone.controller.ts` (`GET /milestones` triggers evaluation as a side effect of the read) | None yet | None |
| S6 | `milestone.repo.ts` (`listMilestones` reads only the `milestones` table itself — never re-checks live percent for an already-awarded row) | `apps/web/src/milestone/milestones-gallery.tsx` (no "at risk" badge, no percent shown for an awarded milestone) | None |
| S7 | None (negative — no code path decrements or deletes a `milestones` row; verified by code review) | None | None |
| S8 | None (uses S3–S6 endpoints) | `apps/web/src/milestone/milestones-gallery.tsx`, `milestone.api-client.ts`, `milestone.model.ts`; `apps/web/src/routes/milestones.tsx` | None |
| S9 | `packages/core/src/milestone/is-complete.test.ts` | None | None |

### Files to create

```
packages/core/src/milestone/           — isComplete + tests
packages/shared/src/milestone.ts       — zod: milestone, entityType/criteriaKey enums
apps/api/src/milestone/                — milestone.controller.ts, milestone.repo.ts
apps/web/src/milestone/                — milestones-gallery.tsx, milestone.api-client.ts, milestone.api.ts, milestone.model.ts
apps/web/src/routes/milestones.tsx     — milestones gallery route
```

### Files to modify

```
apps/api/src/db/schema.ts              — milestones table (see Data model changes); nothing existing dropped
apps/api/src/router.ts                 — /milestones route (resource-named, plural; single GET, evaluate-on-read)
packages/core/src/index.ts             — export ./milestone/index
packages/shared/src/index.ts           — export ./milestone
apps/web/src/router.tsx                — /milestones route + nav link
```

### Data model changes

- New: `milestones` (`id`, `entityType` text [`"curriculum"|"domain_node"`], `entityId` text,
  `criteriaKey` text (currently only `"full_mastery"` — kept as an open string, not a 2-value enum,
  specifically so a future criteria type needs no migration, mirroring `domain_node_links.kind`'s
  same "stays open" precedent), `achievedAt` timestamp, `createdAt` timestamp). No `.references()`
  FK, matching this schema's dominant convention.
- Unique index on `(entityType, entityId, criteriaKey)` — the concurrent-double-award guard, same
  shape as `lectures_topic_id_unique` and `liveness_entity_unique`.
- No changes to any existing table — completion criteria are computed from data that already
  exists (`moduleProgress`/`domainNodeProgress`'s existing percent), never stored redundantly.
- Migration generated via Drizzle, run through the existing migrate script. Never pushed.

### Documentation changes

- Learning domain: new component doc for milestones (award-on-read-once, un-losable, pull-only).
- Cross-reference `.product/REJECTED.md`'s AI-auto-gap rejection and `.product/PRINCIPLES.md`'s
  "Silent on non-response"/"No session debt" — this doc should explicitly state why milestones are
  the one place in this product where "gamification" was deliberately kept celebratory-only, and
  what specifically would violate that (a countdown, a decay, a push notification).

### BAML test coverage

Not applicable — no BAML functions touched. Milestone evaluation is pure arithmetic over an
already-computed percent; no LLM call anywhere in this module.

### Decisions made autonomously

- **Award-on-read is triggered only by opening `/milestones`, not wired into the hot
  curriculum-detail or domain-map read paths.** Evaluating on every unrelated page view would mean
  a write on nearly every request in the app and would touch `curriculum.controller.ts`/domain-map
  controllers this module has no reason to modify. Because nothing forces the user to open the
  milestones page, this stays genuinely pull — the same "reachable only by the user's own
  initiative" property `learning-brain`'s notes review established for its own pull-only surface.
- **`entityType`/`entityId`/`criteriaKey` is one polymorphic table**, not `curriculum_milestones` +
  `area_milestones` — mirrors `liveness`'s identical two-entity-type-one-table convention rather
  than doubling the repo/controller code path for a mechanically identical write.
- **A milestone is never revoked and never re-flagged "at risk."** This is the concrete answer to
  the task's explicit hazard: slice release can add a new, un-mastered topic to an
  already-100%-mastered curriculum; a new `curriculum_domain_node_mappings` row can bring an
  un-mastered curriculum under an already-100%-mastered Area. Both drop the LIVE percent below 100
  after award. `milestone.repo.ts`'s read path never re-derives from live percent for an
  already-awarded row — it only reads the `milestones` table itself. The live percent (still fully
  available via Module 4's coverage report or the domain map) is a completely separate concern from
  "was this milestone ever achieved."
- **No percent-to-next-milestone indicator, no due date, no streak-like "don't lose it."** The
  milestones surface shows only what already happened — achieved criteria and their date. Anything
  resembling "you're at 82%, keep going" already belongs to Module 4's coverage report; duplicating
  it here as a countdown is exactly the manufactured-obligation shape this module was asked to
  avoid.
- **Pull-only — `/milestones` is never delivered via `/daily-push`, Telegram, or any nudge.**
  Achieving a milestone produces no notification of any kind in v1; Ilya discovers it by visiting
  the page. A "congratulations!" push was considered and rejected: even a positive-framed
  notification is still an unrequested interruption, and this product's principle is "the system
  selects what to surface each day" through exactly one channel (`/daily-push`), not two.
- **Concurrent-read double-award is closed by a DB unique index + `23505` catch**, not just an
  app-level check-then-insert — mirrors `subject_duplicate_suggestions_pending_pair_unique` and
  `lectures_topic_id_unique`'s identical race shape (two tabs, or a retry, both observing "not yet
  awarded" before either insert commits).
- **v1 scope for Area milestones is Web Development's fixed Areas only**
  (`domain_nodes.kind = 'area'`), matching Module 4's coverage report and `learning-paths`' role
  templates — no other domain has fixed Areas yet, so no Area milestone can exist outside it.

### Implementation order

1. `isComplete` — deriver, unit-tested against fixtures
2. Schema: `milestones`; generated migration
3. `milestone.repo.ts` (`awardIfNew` for both entity types, `listMilestones`, `23505` handling)
4. `milestone.controller.ts` + router wiring (`GET /milestones`)
5. Web: milestones gallery

### Scope boundary

- No milestone types beyond "100% mastered" in v1 (e.g. "first week of activity," "N topics
  studied") — `criteriaKey` is deliberately left open for a future addition, but only one value
  ships now.
- No notification/push delivery of a newly-achieved milestone — pull-only, see Decisions.
- No un-award, no decay, no "at risk" state — see Decisions; this is the module's core compliance
  boundary with `.product/REJECTED.md`.
- No sharing/export of milestones — single-user product.
- No milestone for a domain node above Area level (sub-subject or subject) — matches `learning-paths`'
  and Module 4's identical Area-only v1 scope; a sub-subject-level milestone is a plausible future
  addition, not built here.
