---
type: spec
branch: To-Learn-List
task: analytics and reporting — retention, coverage, weekly digest, heat map
complexity: medium
state: draft
updated: 2026-08-08
---

# Spec: analytics and reporting

### Summary

A read-time analytics layer over data that already exists — zero new tables, zero new columns.
Time-to-mastery and retention are derived from `gap_mastery` (the sidecar mastery-tracking table)
and `probe_session_questions` (the only per-answer timestamped event this codebase has). Coverage
is `domainNodeProgress` called once per `domain_nodes` row with `kind: "area"` — the exact same
subtree rollup the domain map and `learning-paths` already use, never a second rollup
implementation. The weekly digest assembles those two plus the existing `summarizeConcerns`
cross-cutting rollup and `user_streaks`, windowed to the trailing 7 days by filtering already-
timestamped rows — not a stored delta against a prior digest, because storing digest history would
be the one new table this module doesn't need. Everything here is pull-only: opening the dashboard
computes fresh; nothing is pushed, emailed, or added to `/daily-push`. The heat map (sub-subject ×
Area, colored by mastery percent) is the one genuinely new surface.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Time-to-mastery & retention | S1, S2, S3, S9, S10 | `deriveGapTimeToMastery`, `deriveRetentionRate`, `aggregateTimeToMastery`; repo reads over `gap_mastery`/`probe_session_questions` | None yet | None | Single pass over already-fetched rows, no per-gap query |
| 2 — Coverage | S4, S5 | `buildCoverageReport`; reuses `domainNodeProgress` unmodified | None yet | Phase 1 | One pass over Area nodes + already-fetched curriculum topics |
| 3 — Weekly digest | S6, S7 | `buildWeeklyDigest`; assembles Phases 1–2 + `summarizeConcerns` + `getStreak` | None yet | Phase 2 | One request, no N+1 |
| 4 — Web | S8 | None | dashboard, heat map, digest panel | Phase 3 | None |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `deriveGapTimeToMastery` | `gapMastery: {gapId, createdAt, masteredAt}[]` | per-gap duration in hours, `null` for gaps not yet mastered | S1 |
| `aggregateTimeToMastery` | durations grouped by an external key (topicId/domainNodeId, caller's join) | `{ count, avgHours, medianHours }`, `null` when the group is empty | S1, S3 |
| `deriveRetentionRate` | `answers: {gapId, answeredAt, outcome}[]` (from `probe_session_questions`), `masteredAt: Map<gapId, string>` | fraction of POST-mastery answers still correct, per gap and aggregated; `null` when a gap has no post-mastery answers | S2 |
| `buildCoverageReport` | `areaNodes: {id, name, subjectName}[]`, `nodes: DomainNodeRef[]`, `curriculumTopics: DomainNodeCurriculumTopics[]` | per-Area `{domainNodeId, name, subjectName, percent, status}[]` grouped by sub-subject — calls `domainNodeProgress` + `domainMasteryStatus` per Area, both unmodified | S4, S5, S8 |
| `buildWeeklyDigest` | retention summary, coverage report, `ConcernSummary[]`, `Streak`, `windowDays` | one assembled digest object — no DB access, pure assembly | S6, S7 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `packages/core/src/analytics/gap-time-to-mastery.ts` (`deriveGapTimeToMastery`, `aggregateTimeToMastery`); `apps/api/src/analytics/analytics.repo.ts` (reads `gap_mastery`) | None yet | None |
| S2 | `packages/core/src/analytics/retention-rate.ts` (`deriveRetentionRate`); `analytics.repo.ts` (reads `probe_session_questions` joined to `gap_mastery.masteredAt`) | None yet | None |
| S3 | `packages/core/src/analytics/gap-time-to-mastery.test.ts` — Fact/assumption coverage below, not new production code | None | None |
| S4 | `packages/core/src/analytics/coverage-report.ts` (`buildCoverageReport`, calls `domainNodeProgress`/`domainMasteryStatus` unmodified); `analytics.repo.ts` (reads Area nodes + curriculum topics, same shape `domain-map` already reads) | None yet | None |
| S5 | `coverage-report.ts` (filters to `kind: "area"`) | None yet | None |
| S6 | `packages/core/src/analytics/weekly-digest.ts` (`buildWeeklyDigest`); `apps/api/src/analytics/analytics.service.ts` (assembles retention + coverage + `summarizeConcerns` + `getStreak`, all unmodified) | None yet | None |
| S7 | `apps/api/src/router.ts` (`GET /analytics/digest` added; `apps/api/src/push/` explicitly UNCHANGED, no digest reference added) | None yet | None |
| S8 | None (uses S1–S7 endpoints) | `apps/web/src/analytics/analytics-dashboard.tsx`, `coverage-heat-map.tsx`, `weekly-digest-panel.tsx`, `analytics.api-client.ts`, `analytics.model.ts`; `apps/web/src/routes/analytics.tsx` | None |
| S9 | `packages/core/src/analytics/gap-time-to-mastery.test.ts`, `retention-rate.test.ts` — Fact: `attempts` (subjectId/phraseId/userAnswer) is language-practice-only, not read by this module | None | None |
| S10 | `packages/core/src/analytics/retention-rate.test.ts` — flagged assumption below | None | None |

### Files to create

```
packages/core/src/analytics/           — gapTimeToMastery, aggregateTimeToMastery, deriveRetentionRate, buildCoverageReport, buildWeeklyDigest + tests
packages/shared/src/analytics.ts       — zod schemas: time-to-mastery summary, retention summary, coverage report, weekly digest
apps/api/src/analytics/                — analytics.controller.ts, analytics.repo.ts, analytics.service.ts
apps/web/src/analytics/                — analytics-dashboard.tsx, coverage-heat-map.tsx, weekly-digest-panel.tsx, analytics.api-client.ts, analytics.api.ts, analytics.model.ts
apps/web/src/routes/analytics.tsx      — dashboard route
```

### Files to modify

```
apps/api/src/router.ts                 — /analytics routes (resource-named, plural: GET /analytics/coverage, /analytics/retention, /analytics/digest)
packages/core/src/index.ts             — export ./analytics/index
packages/shared/src/index.ts           — export ./analytics
apps/web/src/router.tsx                — /analytics route + nav link
```

### Data model changes

- **None.** Every deriver reads existing columns: `gap_mastery.createdAt/masteredAt`, `probe_session_questions.answeredAt/outcome/gapId`, `domain_nodes.kind`, `curriculum_domain_node_mappings` (via `domainNodeProgress`, unmodified), `gaps.concern` (via `summarizeConcerns`, unmodified), `user_streaks` (via `getStreak`, unmodified). This is the explicit decision that keeps this module out of the seven-module schema.ts collision — see Decisions.

### Documentation changes

- Learning domain: new component doc for analytics/reporting (retention, time-to-mastery, coverage, weekly digest — all read-time, zero new tables).
- Study-loop domain: no change — this module reads mastery/attempt history, it never writes it.

### BAML test coverage

Not applicable — no BAML functions touched. This module has zero LLM calls; every deriver is pure arithmetic/aggregation over already-persisted rows.

### Decisions made autonomously

- **Zero new tables or columns.** Every input this module needs already exists and is already timestamped. Adding a snapshot/history table to compute week-over-week deltas was considered and rejected (see next decision) specifically to keep this module out of the `schema.ts` collision the other six modules already queue up on.
- **Time-to-mastery is `gap_mastery.masteredAt − gap_mastery.createdAt`**, not first-answer-ever-on-the-gap. `gaps` itself carries no `createdAt`; `gap_mastery` is created lazily on a gap's first mastery-tracked probe-session answer (`gap-mastery.repo.ts`), so its own `createdAt` is the earliest available "started tracking" timestamp. This slightly understates true time-to-mastery for a gap answered once via the single-gap probe/socratic path (no `gap_mastery` row) before ever appearing in a probe-session — acceptable, since that path has no per-answer event to start a clock from at all.
- **Fact: `attempts` is not this module's data source.** `attempts` (`subjectId`, `phraseId`, `userAnswer`, `score`, `verdict`, `nativeAlternatives`) is the language-practice/phrase-bank grading table — its own README-equivalent is `packages/core/src/phrase-bank/`. A naive read of "existing attempt history" in the task brief points here; it doesn't apply. The real per-answer history for gaps is `probe_session_questions`.
- **Flagged assumption, not blocking:** retention is probe-session-only and under-counts. `probe_session_questions` is the only table with a timestamped per-answer row tied to a `gapId`. Single-gap probe answers (`probe.service.ts`) and Socratic turns (`socratic_turns`) both write straight to `gaps.state`/`gap_mastery` with no per-answer event log — so a gap mastered and then only ever re-tested through those paths shows zero post-mastery answers in `deriveRetentionRate`, reading as "no retention data" rather than "retention unknown." This is stated on the dashboard, not silently absorbed into the percentage.
- **The weekly digest has no week-over-week delta.** "Coverage improved by 4%" would require a stored snapshot from 7 days ago — the one new table this module was explicitly asked to avoid needing. Instead the digest shows the current coverage snapshot plus a trailing-7-day retention/time-to-mastery window (both computable from existing timestamps) — current state, not a trend line. A future module can add a snapshot table if trend becomes a real need; that is a new decision, not an oversight here.
- **The digest is pull-only, reached only by opening `/analytics`.** It never rides `/daily-push` or the Telegram bot — matches `study-scheduling`'s explicit "no second reminder channel" decision and `.product/PRINCIPLES.md`'s "System selects, user never manages a queue": a digest that arrives unbidden every week is itself a small recreation of Anki's proactive pressure. `apps/api/src/push/` gets no reference to this module.
- **Coverage v1 is scoped to `domain_nodes.kind = 'area'`**, which today means Web Development's three sub-subjects only (React/Node.js/AWS) — the same v1 boundary `learning-paths` already took for role templates, since no other domain has fixed Areas yet.

### Implementation order

1. `deriveGapTimeToMastery`, `aggregateTimeToMastery` — derivers, unit-tested against fixtures
2. `deriveRetentionRate` — deriver, unit-tested including the zero-post-mastery-answers case
3. `buildCoverageReport` — deriver, calls `domainNodeProgress`/`domainMasteryStatus` unmodified
4. `buildWeeklyDigest` — pure assembly deriver
5. `analytics.repo.ts` (reads), `analytics.service.ts` (assembly + `summarizeConcerns`/`getStreak` calls)
6. `analytics.controller.ts` + router wiring (`GET /analytics/coverage`, `/analytics/retention`, `/analytics/digest`)
7. Web: dashboard, heat map, digest panel

### Scope boundary

- No week-over-week trend/delta — current-snapshot only, see Decisions.
- No push/nudge/Telegram delivery of the digest — pull-only.
- Coverage heat map covers Web Development's fixed Areas only in v1 — no other domain has `kind: "area"` nodes yet.
- No per-user/per-cohort analytics — single-user product, this is personal reporting only.
- No export (CSV/PDF) of the digest or coverage report in v1.
- No retention/time-to-mastery data from single-gap probe or Socratic answer paths — see the flagged assumption; those paths have no per-answer event log to read.
