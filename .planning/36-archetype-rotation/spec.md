---
type: spec
branch: 36-archetype-rotation
task: "Same concept is always probed from a fresh angle — LRU archetype rotation (#36)"
complexity: complex
state: planned
updated: 2026-08-14
verification:
  targetDb: postanki_e2e (local docker, e2e/docker-compose.yml, port 5436)
---

# Plan: LRU question-archetype rotation per concept (#36)

## What this story is, in one paragraph

Every open-ended probing question for one gap (`gaps.id` — this codebase's "concept": a scoped
sub-skill the learner must defend, `apps/api/src/db/schema.ts:469-490`) is generated the exact same
way regardless of how many times that gap has already been probed — `generateQuestion`
(`apps/api/src/probe/probe.service.ts:242-304`) always asks the `mentorAsk` agent for one question
with no memory of *how* the concept was framed last time. Issue #36 wants five distinct question
"archetypes" (Scenario-based, Compare/contrast, Design challenge, Cross-cutting, Debug challenge)
rotated deterministically per gap via least-recently-used selection, filtered to only the archetypes
that make sense for that concept's nature, with the last three sessions' exchanges fed back in as
context so the wording never repeats. This plan adds one sidecar table (`gap_archetype_state`,
mirroring `gap_mastery`'s precedent), one pure LRU-selection module in `packages/core`, one
per-turn `archetype` column on `socratic_turns` for same-session continuation, and wires selection
into the single choke point both callers of open-ended question generation already share.

## Verified facts (independently re-checked, not just re-quoting PM triage)

- `grep -ril "archetype" apps/ packages/` returns nothing — confirmed genuinely unbuilt.
- #35 and #15 are `CLOSED` (`gh issue view --json state`). Their bodies describe an earlier
  "Telegram tool / concept group" product framing that doesn't literally exist in this codebase —
  the closure is satisfied by this codebase's actual equivalents: `topics`/`gaps` (not "tools" /
  "concept groups") and Postgres-persisted session state (`socratic_sessions`, `socratic_turns`,
  `gaps`, `gap_mastery` — all already survive a restart by construction, since nothing here is
  in-memory). This plan treats `gaps.id` as the concept key on that basis — it is the only entity in
  the schema that is 1:1 with "one sub-skill the learner must defend," and is already the join key
  for `gap_mastery` (`schema.ts:515-544`) and `socratic_turns.gapId`/`conceptLabel`
  (`schema.ts:609-624`, `socratic.service.ts:432`).
- **Two structurally different, currently-unconnected surfaces both generate open-ended
  (non-MCQ) questions for one gap through the exact same function**,
  `buildProbeQuestionForGap` (`probe.service.ts:92-126`):
  - `push.controller.ts:26-30` (`handleDailyPush`) — a single stateless question, no session
    concept, answered via `submitProbe` which persists **no exchange text anywhere**, only gap
    state (`probe.service.ts:128-205`).
  - `socratic.service.ts:416-445` (`makeTurnForGap`) — called both when opening a new gap
    (`openNextConcept`, line 401-414) and, critically, **again for the SAME gap within the SAME
    still-active session** when the learner's answer isn't yet covered (`answerSocraticSession`,
    line 210-212: `else if (gap) { next = await makeTurnForGap(session.id, topicRow, gap, now); }`).
    This second case is a follow-up turn on an open conversation, not a new "session" for LRU
    purposes — rotating the archetype mid-conversation would look incoherent and would burn through
    the rotation faster than intended.
  - A third caller, `startProbe` (`probe.service.ts:56-90`), reaches the same underlying
    `generateQuestion` via `buildQuestion` (`probe.service.ts:207-228`) directly, not through
    `buildProbeQuestionForGap`. It has **no session wrapper of any kind** — the client re-calls it
    per question (confirmed via `apps/web/src/curriculum/api-client.ts:979`,
    `curriculum.api.ts:292`, and the three `verify-*.ts` scripts that drive it directly). It is
    behaviorally identical to push for rotation purposes: every call is its own LRU-eligible
    selection event, even if it happens to resurface the same still-open gap on a quick repeat call.
  - The MCQ paths — `quick_test` mode in `probe.service.ts` and the whole batch generator
    `probe-session.generate.ts` (`probeQuizBatch` agent) — never call `buildProbeQuestionForGap` /
    `generateQuestion`'s socratic branch at all. Confirmed by reading both files fully: the batch
    path builds its own MCQ prompt with `gapLabel` tagging (`generate.ts:137-157`) and is entirely
    separate machinery.
- `apps/api/src/mastra/mastra.ts` (agent registration + `AGENT_KEYS`, lines 1-52) is on the
  explicit do-not-touch list for this pass. **This rules out adding a new classifier agent** — the
  archetype-applicability classification (which of the 5 archetypes fit this concept's nature) has
  to ride inside the existing `mentorAsk` agent's schema/instructions
  (`mentor.agent.ts:1-66`, unfenced) rather than as a second LLM call, both because of the file
  fence and because CLAUDE.md's cost-awareness constraint disfavors a second round trip on
  push's latency-sensitive path.
- `apps/api/src/probe/probe-question.ts` (the `generatedQuestionSchema`/`GeneratedQuestion` type
  consumed by `generateQuestion`) is a small, local, unfenced file — the natural place to add an
  optional `applicableArchetypes` output field.
- No `drizzle.config.ts` at repo root; migrations are workspace-scoped —
  `apps/api/package.json:13-14`: `db:generate` (`drizzle-kit generate`) then `db:migrate`
  (`scripts/migrate.ts`), aliased at root as `npm run db:generate:api` / `npm run db:migrate:api`
  (`package.json:31-32`). This plan needs one migration; it is not generated or run here.
- `gap_mastery`'s own precedent (`gap-mastery.repo.ts:57-76`) takes a `pg_advisory_xact_lock` +
  `SELECT ... FOR UPDATE` before writing, because its cycling state gates whether a gap is
  mastered — a real correctness-affecting race. This story's archetype state has no equivalent
  stake: a lost update in a two-writers race means at most one archetype gets reused one session
  earlier than ideal, which is self-correcting on the very next selection. No lock is taken here,
  and that omission is deliberate, not an oversight (mirrors `.planning/96-adaptive-quiz-size`'s own
  practice of naming what it didn't need).

## The design

### Decision 1 — the concept key is `gaps.id`; storage is a sidecar table, not new columns on `gaps`

Mirrors `gap_mastery`'s own documented reasoning (`schema.ts:511-514`) for the same choice: keeps
`gaps`' existing writers untouched, and this state is cross-cutting/orthogonal to gap state exactly
like mastery is.

```ts
// apps/api/src/db/schema.ts — new table, alongside gapMastery
export const gapArchetypeState = pgTable(
  "gap_archetype_state",
  {
    id: text("id").primaryKey(),
    gapId: text("gap_id").notNull(),
    // Nullable at the column level defensively (matches gap_mastery's own
    // style of tolerating a not-yet-fully-populated row), but in practice
    // NEVER actually null once a row exists: the only insert path
    // (recordArchetypeClassification, Decision 6) always supplies a
    // normalized non-empty array in the same write that creates the row.
    // Frozen once written — never re-derived, so the rotation's candidate
    // pool never silently drifts session to session (issue #36's own "LRU
    // is deterministic and does not require the AI model to remember
    // framing history"). Treat a row existing with a null value here as
    // defensive/unreachable, not a real branch to design around.
    applicableArchetypes: jsonb("applicable_archetypes").$type<Archetype[]>(),
    // All 5 keys always present, ISO timestamp or null. Per-archetype (not
    // just "last archetype used overall") because LRU selection needs the
    // full recency ordering across the candidate set, not just the single
    // most recent value.
    archetypeLastUsedAt: jsonb("archetype_last_used_at")
      .$type<Record<Archetype, string | null>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("gap_archetype_state_gap_id_unique").on(table.gapId)],
);
```

Plus one nullable column on the existing `socratic_turns` table (`schema.ts:609-624`):

```ts
archetype: text("archetype"), // which archetype framed THIS turn's question, for same-session continuation (Decision 4) and the last-3-sessions context block (Decision 5)
```

Both changes land in one migration (see todo.md).

### Decision 2 — canonical order and the pure LRU selector live in `packages/shared` / `packages/core`

```ts
// packages/shared/src/archetype.ts (new)
export const archetypeSchema = z.enum([
  "scenario_based",   // 1 — canonical order IS declaration order, single source of truth
  "compare_contrast", // 2
  "design_challenge", // 3
  "cross_cutting",    // 4
  "debug_challenge",  // 5
]);
export type Archetype = z.infer<typeof archetypeSchema>;
export const ARCHETYPE_CANONICAL_ORDER: readonly Archetype[] = archetypeSchema.options;
```

Declaring the enum in canonical order and deriving `ARCHETYPE_CANONICAL_ORDER` from
`archetypeSchema.options` (rather than a second parallel array) means there is exactly one place
that encodes "1. Scenario-based … 5. Debug challenge" — no drift risk between the zod schema and
the tiebreak order.

```ts
// packages/core/src/probe-session/archetype-rotation.ts (new)
import { ARCHETYPE_CANONICAL_ORDER, type Archetype } from "@post-anki/shared";

export type ArchetypeLastUsedAt = Record<Archetype, string | null>;

export function zeroArchetypeLastUsedAt(): ArchetypeLastUsedAt {
  return Object.fromEntries(ARCHETYPE_CANONICAL_ORDER.map((a) => [a, null])) as ArchetypeLastUsedAt;
}

// Falls back to the full canonical set when the model's classification came
// back empty (agent error / malformed output) — least-restrictive failure
// mode, matching probe.service.ts's own fallbackQuestion precedent of
// degrading gracefully rather than blocking generation.
export function normalizeApplicableArchetypes(raw: Archetype[]): Archetype[] {
  const deduped = Array.from(new Set(raw));
  return deduped.length > 0 ? deduped : [...ARCHETYPE_CANONICAL_ORDER];
}

/**
 * Deterministic LRU selection over the applicable subset.
 *
 * - A single-item subset short-circuits: the exclusion rule is suspended
 *   (issue #36's own "single-applicable-archetype" edge case) — that one
 *   archetype is always returned.
 * - Otherwise: the candidate with the maximum non-null lastUsedAt timestamp
 *   is excluded (the "most recently used" rule). Full timestamp comparison,
 *   NOT calendar-date truncation — truncating to a date would let canonical
 *   order override genuine same-day recency (an archetype used an hour ago
 *   would tie with one used that morning). "Same date" in the issue text is
 *   read as "identical stored value" — realistically only ever true for two
 *   never-used (null) candidates.
 * - Among the remaining candidates, the smallest recency key wins — null
 *   (never used) sorts before any real timestamp. Ties (all-null, including
 *   the whole-subset first-session case, or an exact-timestamp tie) break by
 *   canonical order, earliest wins. This single rule covers BOTH of the
 *   issue's named tiebreak situations (first session, LRU tie) without a
 *   special case for either.
 */
export function selectArchetype(
  applicable: Archetype[],
  lastUsedAt: ArchetypeLastUsedAt,
): Archetype {
  const byCanonicalOrder = (a: Archetype, b: Archetype) =>
    ARCHETYPE_CANONICAL_ORDER.indexOf(a) - ARCHETYPE_CANONICAL_ORDER.indexOf(b);

  if (applicable.length === 1) {
    return applicable[0]!;
  }

  const withTimestamps = applicable
    .map((a) => ({ a, t: lastUsedAt[a] ?? null }))
    .sort((x, y) => {
      if (x.t === y.t) return byCanonicalOrder(x.a, y.a);
      if (x.t === null) return -1; // never-used sorts as "most eligible", not "most recent"
      if (y.t === null) return 1;
      return x.t < y.t ? -1 : 1;
    });

  const mostRecent = withTimestamps[withTimestamps.length - 1]!;
  const hasRealMostRecent = mostRecent.t !== null;
  const pool = hasRealMostRecent
    ? withTimestamps.filter((x) => x.a !== mostRecent.a)
    : withTimestamps; // nothing has ever been used — no exclusion, first-session rule

  return pool[0]!.a; // pool is still sorted null-first-then-oldest, canonical-order-tiebroken
}
```

This is a pure, fully unit-testable function — no DB, no agent — matching `hasEarlyMasterySignal`
(`mastery-state.ts`) and `scaleTopicQuizTotal`'s (`quiz-size.ts`) shape.

### Decision 3 — applicability classification rides the existing `mentorAsk` call, once per gap, never re-derived

`ASK_INSTRUCTIONS` (`mentor.agent.ts:5-25`) gains a static block describing all 5 archetypes and
the filtering rules verbatim from the issue:

```
Archetype reference (used only when the per-call prompt asks you to apply one, or to classify):
1. Scenario-based — "A team is building X and hits Y problem — how would you approach it?"
2. Compare/contrast — "You know Next.js. How would this compare for a Next.js developer?"
3. Design challenge — "Starting a new project — when would you choose this over the alternative?"
4. Cross-cutting — "A client is concerned about the security implications — what would you tell them?"
5. Debug challenge — "A user reports X is broken — where would you look first?"

Filtering rules for classification:
- Debug challenge: ONLY for runtime/operational concepts (cold starts, latency, error handling).
  Skip for conceptual/pricing/policy topics.
- Compare/contrast: ONLY for architectural choices where a real alternative exists. Skip for
  single-approach topics.
- Scenario-based, Design challenge, Cross-cutting: apply broadly to almost all concepts.
```

`generatedQuestionSchema` (`probe-question.ts`) gains one optional field:
`applicableArchetypes: z.array(archetypeSchema).optional()`.

Per-call prompt (`generateQuestion`, `probe.service.ts:242-304`), only for
`mode === "socratic" && gap !== null`:

- **Gap has no `gap_archetype_state` row yet (first-ever socratic question for this concept):**
  prompt adds "Classify which of the 5 reference archetypes apply to this concept in
  `applicableArchetypes`, per the filtering rules in your instructions. For THIS question, use the
  Scenario-based framing (the safe universal default)." No archetype context/history line — there
  is none yet.
- **Row exists, `applicableArchetypes` cached:** no classification instruction at all (the field is
  simply omitted from the model's output this time — `.optional()` makes that valid). Prompt adds
  "Framing archetype for this question: `{Name}`. Write today's specific question fitting this
  framing." plus the last-3-sessions context block (Decision 5) when non-empty.

After a successful generation (never on the `fallbackQuestion` degraded path — matching this
file's existing pattern of only updating state on the real path):

- First-ever case: `recordArchetypeClassification(gapId, normalizeApplicableArchetypes(result.applicableArchetypes ?? []), now)`
  inserts the sidecar row (`onConflictDoNothing` — see Decision 6) with
  `archetypeLastUsedAt` all-null **except** `scenario_based` stamped to `now`, **but only if
  `"scenario_based"` is actually in the normalized applicable set**. If the model classified
  Scenario-based itself as inapplicable to this concept (rare — the filtering rules call it broadly
  applicable, but not universally), nothing is stamped: the very next session for this gap does a
  clean canonical-order-first-applicable selection with no false LRU history. **Disclosed, not
  hidden**: on that rare path, this one concept sees a Scenario-based-framed question exactly once
  despite it not being in its own official rotation — self-correcting from session 2 onward, never
  built as a special case beyond "don't stamp what wasn't really eligible."
- Subsequent case: `recordArchetypeUsage(gapId, chosenArchetype, now)` updates just that one key in
  `archetypeLastUsedAt`.

`generatedQuestionSchema`/`GeneratedQuestion` (`probe-question.ts`) is the AGENT's structured-output
contract — it should carry `applicableArchetypes` (something the agent genuinely produces) but NOT
the archetype that framed the question, which the SERVICE already knows before it even calls the
agent (it selected it). `generateQuestion` therefore returns a small local wrapper, not a widened
`GeneratedQuestion`:

```ts
interface QuestionWithArchetype {
  generated: GeneratedQuestion;
  archetype: Archetype | null; // null for quick_test and the opening question
}
```

`buildQuestion` (`probe.service.ts:207-228`) unwraps this to populate both the existing
`ProbeQuestion` fields (from `.generated`) and the new `ProbeQuestion.archetype` field (from
`.archetype`) — the two concerns (what the agent produced vs. what the service decided) stay
separated at the type level instead of one schema doing both jobs.

### Decision 4 — same-session continuation reuses the archetype instead of re-rolling it

`buildProbeQuestionForGap` (`probe.service.ts:92-126`) and `buildQuestion`/`generateQuestion` gain
one new optional trailing parameter, `socraticSessionId?: string`:

- `startProbe` → `buildQuestion(...)` : never passes it (no session wrapper — see Decision 1's
  verified facts). Always a fresh LRU pick.
- `push.controller.ts` → `buildProbeQuestionForGap(...)`: never passes it. Always a fresh pick.
- `socratic.service.ts`'s `makeTurnForGap` (line 416-445, called from both `openNextConcept` and
  `answerSocraticSession`'s retry branch at line 210-212): **always passes `sessionId`.**

Inside `generateQuestion`, when `socraticSessionId` is present, look up
`getMostRecentTurnArchetype(sessionId, gapId)` (new query, `socratic.repo.ts`) **before** doing any
LRU selection:

```ts
// socratic.repo.ts — new
export async function getMostRecentTurnArchetype(
  sessionId: string,
  gapId: string,
): Promise<Archetype | null> {
  const rows = await getDb()
    .select({ archetype: socraticTurns.archetype })
    .from(socraticTurns)
    .where(and(eq(socraticTurns.sessionId, sessionId), eq(socraticTurns.gapId, gapId)))
    .orderBy(desc(socraticTurns.order))
    .limit(1);
  return (rows[0]?.archetype as Archetype | null) ?? null;
}
```

If found, that archetype is reused verbatim for this turn — no LRU re-selection, no
`archetypeLastUsedAt` write (it was already stamped when first chosen for this session), matching
the issue's framing that rotation operates "when the concept is selected for A session," not per
turn. If not found (this is the first turn for this gap in this session — the common case), the
normal Decision 2/3 selection flow runs and its result is written onto the newly-inserted
`socratic_turns.archetype` column, so a later retry-branch call for the same (session, gap) finds
it.

`ProbeQuestion` (`packages/shared/src/probe.ts:6-14`) gains
`archetype: archetypeSchema.nullable().optional()` so `generateQuestion`'s chosen archetype (or
`null` for quick_test / opening / non-socratic paths) flows back up through `buildQuestion` to
`makeTurnForGap`, which stamps it onto the turn row it inserts
(`socratic.service.ts:428-442`, `turn.archetype = question.archetype`). Additive-only schema
change; no existing field changes shape.

### Decision 5 — the last-3-sessions context block draws only from `socratic_turns`

`submitProbe` (the push/`startProbe` answer path) persists no exchange text at all — only
`socratic_turns` (session + gap + prompt + answer) has real per-concept conversation history. New
query:

```ts
// socratic.repo.ts — new
export async function getRecentSessionExchangesForGap(
  gapId: string,
  excludeSessionId: string | null,
  limit = 3,
): Promise<{
  sessionId: string;
  createdAt: Date;
  turns: { prompt: string; answer: string | null }[];
}[]>
```

Two-step query, not a single `.limit(3)` on turns (that would return 3 *turns*, possibly all from
one session, not 3 distinct sessions): first resolve the `limit` most-recent distinct `session_id`s
that have any turn for this `gapId` (excluding `excludeSessionId`), ordered by the session's
`createdAt` desc; then fetch that session set's own turns for this `gapId`, in original turn order,
grouped under each session. Rendered into the prompt as a labeled block ("Prior sessions discussing
this concept — avoid repeating the same specific scenario or wording:") only when non-empty.

**This context block is therefore only ever populated when a gap has prior *Socratic-session*
history.** A gap that has only ever been probed via push/`startProbe` has no exchange text to draw
on and gets no context block — a real, disclosed limitation of the current architecture (push
doesn't persist Q&A text), not something this story can or should paper over. The parallel story
"Daily push feels like a conversation, not a card review" (referenced directly in #36's own issue
body as `Parallel with:`) is the natural place to close that gap, not here. LRU archetype rotation
itself still applies uniformly on the push/`startProbe` surfaces regardless — only the
supplementary context text is unavailable there.

### Decision 6 — no advisory lock; plain upsert / update

```ts
// apps/api/src/gap/gap-archetype.repo.ts (new)
export async function recordArchetypeClassification(
  gapId: string,
  applicable: Archetype[],
  usedNow: Archetype | null,
  now: string,
): Promise<void> {
  const lastUsedAt = zeroArchetypeLastUsedAt();
  if (usedNow && applicable.includes(usedNow)) lastUsedAt[usedNow] = now;

  await getDb()
    .insert(gapArchetypeState)
    .values({ id: newId("gaparch"), gapId, applicableArchetypes: applicable, archetypeLastUsedAt: lastUsedAt, createdAt: new Date(now), updatedAt: new Date(now) })
    .onConflictDoNothing({ target: gapArchetypeState.gapId });
}

export async function recordArchetypeUsage(gapId: string, archetype: Archetype, now: string): Promise<void> {
  const existing = await getGapArchetypeState(gapId);
  if (!existing) return; // defensive — should never happen on this call path
  const lastUsedAt = { ...(existing.archetypeLastUsedAt), [archetype]: now };
  await getDb().update(gapArchetypeState).set({ archetypeLastUsedAt: lastUsedAt, updatedAt: new Date(now) }).where(eq(gapArchetypeState.gapId, gapId));
}
```

Explicitly **not** `gap_mastery`'s `pg_advisory_xact_lock` + `SELECT ... FOR UPDATE` treatment (see
"Verified facts" above for why): a concurrent race here yields at most one repeated archetype or a
missed timestamp update, which the very next selection self-corrects. `onConflictDoNothing` handles
the concurrent-first-classification race (two simultaneous first questions for the same brand-new
gap) without either writer erroring.

### Decision 7 — delete path, mirroring `gap_mastery`'s own precedent (with one disclosed gap)

`gap_archetype_state` has no `.references()` FK (matches this schema's deliberate no-FK convention
for cross-table ids, same as `gap_mastery.gapId` — `schema.ts:511-514`'s own comment on that
choice), so it will orphan on gap deletion exactly the way `.planning/gap-mastery-cascade-delete`
already documented `gap_mastery` once did, unless every `gaps`-deleting call site also deletes the
matching `gap_archetype_state` rows in the same transaction. There are exactly four such call
sites today, identified by grep for `deleteGapMasteryForGapIds`:

1. `apps/api/src/curriculum/curriculum.repo.ts:445` (inside a module-cascade delete)
2. `apps/api/src/curriculum/curriculum.repo.ts:645` (inside a curriculum-cascade delete)
3. `apps/api/src/module/module.repo.ts:121` (module delete)
4. `apps/api/src/topic/topic.repo.ts:198` (`deleteTopic`)

A new `deleteGapArchetypeStateForGapIds(gapIds, tx)` (`gap-archetype.repo.ts`, mirroring
`deleteGapMasteryForGapIds`'s exact shape, `gap-mastery.repo.ts:78-87`) is called alongside
`deleteGapMasteryForGapIds` at sites 1-3, in the same transaction, deleting from `gaps` still last.

**Site 4 (`topic.repo.ts:198`) is explicitly out of reach for this pass** — `apps/api/src/topic/
topic.repo.ts` is on this task's own do-not-touch list (separately-flagged cards-related
uncommitted WIP). This means `deleteTopic` will continue to leak `gap_archetype_state` rows
(exactly the same class of leak `gap_mastery` itself had before its own cascade-delete story, per
that plan's own framing: "not a correctness bug, an unbounded, silent leak"). **Disclosed, not
silently worked around**: flagged in todo.md as a genuine follow-up blocked by the file fence, not
absorbed into this plan's own scope. Whoever next has clearance to touch `topic.repo.ts` (likely
whoever resolves the cards WIP) should add the same one-line call there.

## Traceability against the issue's own Acceptance list

Issue #36's body states 6 acceptance bullets verbatim. Mapped against this plan's design, honestly
— 4 are fully met, 2 are met only on the Socratic-session surface with a named gap elsewhere:

1. *"The same concept is never probed with the exact same question twice in a row"* —
   **Partially met.** Fully covered when the concept has recent Socratic-session history (Decision
   5's context block actively steers the AI away from repeating wording) and whenever more than one
   archetype is applicable (Decision 2 guarantees the framing itself changes). **Not structurally
   guaranteed** for a concept classified with exactly one applicable archetype (Scenario 5) that is
   probed only via push/`startProbe` (Decision 5's disclosed gap: no context block there) — in that
   specific combination, the same archetype AND no anti-repetition context both apply at once, and
   the only thing preventing an identical question is ordinary LLM sampling variance, not this
   plan's mechanism. Named explicitly rather than left for the reader to discover.
2. *"The same scenario or framing is not reused for the same concept within 60 days"* — **Met as
   the issue itself defines enforcement**: nominal, via the last-3-sessions context block (Decision
   5), not a hard DB-level rule — see spec.md "Explicitly out of scope." Subject to the same
   Socratic-only-history caveat as #1.
3. *"The question archetype rotates through the applicable subset (not all 5 forced on every
   concept)"* — **Fully met** (Decisions 2, 3).
4. *"Inapplicable archetypes are silently skipped — no awkward forced-fit questions"* — **Fully
   met** (Decision 3's filtering rules), with one disclosed one-time exception: the very first
   question for an unclassified gap is forced into Scenario-based framing before classification is
   known, which in the rare case that Scenario-based itself turns out inapplicable produces exactly
   one forced-fit question per concept, ever (Decision 3's own disclosure).
5. *"Question wording is freshly generated each session (not retrieved from a template library)"*
   — **Fully met** — the archetype supplies a framing instruction, never literal template text; the
   AI always writes the specific wording (unchanged from today's `generateQuestion` behavior).
6. *"Prior session exchanges for this concept are included in the generation context"* —
   **Partially met.** True whenever `getRecentSessionExchangesForGap` returns a non-empty result
   (Decision 5) — false for any concept whose only history is push/`startProbe` answers, since that
   surface persists no exchange text today (a pre-existing architectural gap, not something this
   plan introduces or can close within its own scope).

## Architecture

### Business logic changes

- Every open-ended (Socratic-mode) question about a specific concept now arrives framed as one of
  five distinct question archetypes, rotating so the same framing is never used twice in a row for
  that concept, filtered so an archetype that doesn't fit the concept's nature (e.g. a "debug
  challenge" for a pricing/policy topic) is never forced.
- A learner who keeps getting the same gap wrong within one Socratic session sees the SAME framing
  persist across their retries on that gap — only genuinely new sessions (or `startProbe`/push's own
  independent, session-less calls) get a rotated framing, so an in-progress conversation stays
  coherent.
- When a concept has recent Socratic-session history, the AI is shown the last three sessions'
  actual exchanges so it can avoid repeating a specific scenario, not just the archetype label.
  Concepts only ever probed via the daily push / `startProbe` surfaces don't get this benefit yet —
  those surfaces keep no exchange text today, a separate, already-tracked story's territory.
- MCQ questions (`quick_test` mode, and the whole batch quiz generator) are entirely unaffected —
  no archetype, no rotation, no schema change touches that path.

### Architectural changes

- New sidecar table `gap_archetype_state`, 1:1 with `gaps` via a unique `gap_id` index — same shape
  of decision `gap_mastery` already made and documents for itself.
- One new nullable column, `socratic_turns.archetype`, recording which archetype framed each turn —
  needed for same-session continuation lookups and the context block, not exposed as new API
  surface beyond the additive `ProbeQuestion.archetype` field.
- `packages/shared` gains one new module (`archetype.ts`); `packages/core` gains one new pure
  module (`archetype-rotation.ts`) with its own test file — the LRU/tiebreak logic has zero
  dependency on the DB or the agent and is unit-tested directly, matching this package's existing
  convention for every other piece of probe-session decision logic.
- `apps/api/src/probe/probe.service.ts`'s `generateQuestion`/`buildQuestion` gain one new optional
  parameter threaded from three call sites; `apps/api/src/gap/gap-archetype.repo.ts` and two new
  query functions on `apps/api/src/socratic/socratic.repo.ts` are the only new repo surface.
  `mentor.agent.ts`'s static instructions gain the archetype reference block. No new route, no new
  controller, no change to `push.controller.ts`'s or `startProbe`'s own call signatures from the
  outside (the new parameter is trailing-optional).

## Quality gates

1. `npx tsc --noEmit` clean across `packages/shared`, `packages/core`, `apps/api`, `apps/web`,
   `apps/mobile`.
2. `npx vitest run` green — in particular the new `archetype-rotation.test.ts` (pure, exhaustive:
   see scenarios.md) and any updated `probe.service`/`socratic.service` unit coverage.
3. `npm run test:integration -w @post-anki/api` (needs `npm run e2e:db:up` first, docker port 5436)
   — new integration coverage proving the DB round trip (classification persisted once, reused,
   never re-derived; same-session continuation; cross-surface LRU sharing between push/startProbe
   and Socratic).
4. No repo-wide ESLint exists (re-confirmed during `.planning/33-untriaged-gaps-auto-defer` and
   `.planning/96-adaptive-quiz-size` planning, unchanged) — the typecheck gate is the lint gate.

## Explicitly out of scope

- Any change to `quick_test` mode or `apps/api/src/probe-session/probe-session.generate.ts`'s MCQ
  batch generator — neither calls into `generateQuestion`'s socratic branch, proven by appearing in
  no diff.
- Persisting exchange text for `startProbe`/push-answered questions (`submitProbe` stays exactly as
  it is today) — that is the separate "Daily push feels like a conversation" story's territory,
  named directly in #36's own issue body as parallel work.
- Any advisory lock / `FOR UPDATE` treatment on `gap_archetype_state` (Decision 6).
- Any client-facing UI surfacing of which archetype was used — `ProbeQuestion.archetype` and
  `socratic_turns.archetype` are backend plumbing; no web/mobile/bot component reads them in this
  plan.
- A literal 60-day framing-uniqueness enforcement mechanism — the issue itself describes this as
  enforced only via the "last 3 sessions" context nudging the AI, not a hard rule; nothing here adds
  DB-level enforcement beyond what the issue itself specifies.
