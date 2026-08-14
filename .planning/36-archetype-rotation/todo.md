---
type: todo
branch: 36-archetype-rotation
task: "Same concept is always probed from a fresh angle — LRU archetype rotation (#36)"
state: open
updated: 2026-08-14
---

# Todo: LRU archetype rotation per concept (#36)

## Decisions to make

Nothing blocking. Every fork in this story had a safe, reversible, pattern-following default —
logged one line each below, full reasoning in `spec.md`'s design section. Two touch schema (new
table, new column) but both are additive/nullable, no data migration of existing rows, no
irreversible transform. Nothing here needs Ilya before implementation starts.

1. Concept key = `gaps.id`, not a new "concept group" entity — the only entity 1:1 with "one
   sub-skill the learner must defend," already the join key for `gap_mastery` and
   `socratic_turns.gapId`.
2. Storage is a new sidecar table (`gap_archetype_state`), mirroring `gap_mastery`'s own documented
   reasoning for the identical choice, not new columns on `gaps`.
3. Archetype-applicability classification rides the existing `mentorAsk` call (one extra optional
   output field, asked for only once per gap) instead of a new classifier agent — `mastra.ts` is
   fenced (do-not-touch), and a second LLM round trip per gap would also violate the cost-awareness
   constraint on push's latency-sensitive path.
4. Classification happens once, cached, never re-derived — keeps the LRU pool from silently
   drifting session to session, per the issue's own determinism requirement.
5. The very first question for an unclassified gap is forced into Scenario-based framing (the
   archetype the issue's own filtering rules call broadly applicable); if that gap's real
   classification later excludes Scenario-based, the usage timestamp is simply never stamped rather
   than treated as a special case.
6. Same-session continuation (a Socratic retry on a still-open gap) reuses the archetype already
   chosen for that (session, gap) pair, read from the new `socratic_turns.archetype` column — new
   sessions, and the session-less `startProbe`/push surfaces, always select fresh.
7. `startProbe`/push resurfacing the same still-open gap without a session wrapper gets a fresh LRU
   pick every call — accepted as consistent with "no session concept exists there," not special-cased.
8. The last-3-sessions context block reads only `socratic_turns` (the only place exchange text is
   persisted today) — push/`startProbe`-only gaps get rotation but no context block, disclosed as a
   limitation pointing at the separate "daily push feels like a conversation" story.
9. No advisory lock / `FOR UPDATE` on `gap_archetype_state` — a lost-update race is harmless and
   self-correcting, unlike `gap_mastery`'s real correctness stake.
10. `ProbeQuestion` and `socratic_turns` both gain an additive `archetype` field/column with no
    client-facing UI consuming it in this plan.
11. Cascade-delete `gap_archetype_state` at the 3 reachable `gaps`-deleting call sites
    (`curriculum.repo.ts` x2, `module.repo.ts`), mirroring `gap_mastery`'s own precedent exactly —
    but NOT at `topic.repo.ts`'s 4th site, since that file is fenced for this task. Disclosed as a
    real follow-up (see "To review" below), not silently treated as solved.

## To review / clarify (not blockers, flagged for awareness)

1. **The single rare edge case where Scenario-based itself is classified inapplicable to a
   concept.** That concept's very first question still uses Scenario-based framing once (forced,
   per Decision 5), even though it's not in that concept's own rotation — self-corrects from
   session 2 onward, but is a real, disclosed one-time inconsistency worth knowing about if a user
   ever notices it. Named follow-up if it turns out to matter: skip forcing Scenario-based and
   instead run classification as a genuinely separate step before the very first question is
   framed at all — rejected here because it would need a second LLM call specifically for the
   1-in-N gaps that hit this edge, not proportionate to build now.
2. **Push and `startProbe`-only concepts never get the "prior sessions" context block**, since
   `submitProbe` persists no exchange text (spec.md's own verified fact). Rotation (which
   archetype) still works there; only the supplementary wording-variety nudge doesn't. This is a
   pre-existing architectural gap this story surfaces but does not close — closing it belongs to
   the separate daily-push conversational story referenced directly in #36's own issue body.
3. **`startProbe` has no session wrapper at all**, so two rapid repeat calls that both resurface
   the same still-open gap (e.g. the learner immediately re-requests a question after answering
   wrong) will rotate the archetype between those two calls rather than staying consistent the way
   a Socratic retry does. This is a real, if minor, UX difference between the two probing surfaces
   that predates this story (they already behave differently in other ways — no session id, no
   checkpoint, no multi-turn) and isn't something this plan should paper over by inventing session
   semantics `startProbe` doesn't otherwise have.
4. **`recordArchetypeUsage` does a read-then-write** (fetch current `archetypeLastUsedAt`, merge one
   key, write the whole map back) rather than a single `jsonb_set` SQL expression. Simpler, matches
   this codebase's dominant style (`gap-mastery.repo.ts`'s own read-then-patch pattern), and the
   lost-update race this could theoretically hit is exactly the harmless, self-correcting kind
   Decision 9 already accepts.

5. **`deleteTopic` (`apps/api/src/topic/topic.repo.ts:198`) will keep leaking
   `gap_archetype_state` rows after this story ships.** That file is explicitly fenced for this
   task (cards-related uncommitted WIP). The leak is inert (nothing ever reads
   `gap_archetype_state` without an implicit join through a live `gaps` row, exactly matching
   `gap_mastery`'s own pre-fix framing: "not a correctness bug, an unbounded, silent leak") but it
   is real and will grow with every direct topic deletion. Whoever next has clearance on
   `topic.repo.ts` (most likely whoever resolves the cards WIP fence) should add the one-line
   `deleteGapArchetypeStateForGapIds` call alongside that function's existing
   `deleteGapMasteryForGapIds` call at line 198. Flagged here explicitly so it isn't mistaken for
   an oversight later.

## Manual steps / sequencing constraints

1. **Migration required.** After the `gap_archetype_state` table and `socratic_turns.archetype`
   column land in `apps/api/src/db/schema.ts`, run (do not run as part of this planning pass):
   - `npm run db:generate:api` (root) — wraps `drizzle-kit generate` in `apps/api`
     (`apps/api/package.json:13`)
   - `npm run db:migrate:api` (root) — wraps `scripts/migrate.ts` (`apps/api/package.json:14`)
   Never `drizzle-kit push`. Needs local Postgres up (`npm run db:dev:up` / e2e docker for tests).
2. No other infra change, no new secrets, no new env var. Standard implement → typecheck → test →
   PR flow otherwise.

## Quality gates (all must pass)

- `npx tsc --noEmit` (root, fans out to every workspace)
- `npx vitest run` (root) — in particular the new `archetype-rotation.test.ts` (pure, exhaustive
  per scenarios.md ACs 3-12) and extended `probe.service`/`socratic.service` unit coverage
- `npm run test:integration -w @post-anki/api` — needs `npm run e2e:db:up` (docker, port 5436)
  first, for the new `archetype-rotation.integration.test.ts`
- No repo-wide ESLint exists (re-verified during `.planning/33-untriaged-gaps-auto-defer` and
  `.planning/96-adaptive-quiz-size` planning) — the typecheck gate is the lint gate.

## Easiest things to get wrong (read before implementing)

1. **Exclusion picks the candidate with the MAXIMUM timestamp, not minimum.** LRU selects the
   *least* recently used from the *remaining* pool, but the *excluded* one is the *most* recently
   used. Mixing these up silently inverts the whole rotation. AC 9.
2. **Full timestamp comparison, not calendar-date truncation**, in `selectArchetype`'s tiebreak.
   Truncating would let canonical order override real same-day recency ordering. AC 11.
3. **Classification instruction must NOT be sent once a `gap_archetype_state` row already exists**,
   even though `applicableArchetypes` stays a valid optional field in the schema forever — sending
   it again would let the model's classification silently drift session to session, breaking the
   issue's own determinism requirement. Gate strictly on "row exists" (cached), not on "field
   present in this call's output." AC 20 vs AC 23.
4. **`recordArchetypeClassification`/`recordArchetypeUsage` only fire on the real generation
   success path**, never on `fallbackQuestion`'s degraded branch (`probe.service.ts:299-303`). A
   fallback question was never actually shown with any archetype framing — writing state for it
   would corrupt the rotation with a phantom "usage." AC 25.
5. **`socraticSessionId` is trailing-optional on `buildProbeQuestionForGap`/`buildQuestion`** —
   `push.controller.ts` and `startProbe` must NOT be changed to pass one. Passing a synthetic or
   reused id there would incorrectly suppress fresh LRU selection on surfaces that have no real
   session concept. AC 27.
6. **`getMostRecentTurnArchetype` must scope to BOTH `sessionId` AND `gapId`** — scoping to session
   alone would return the wrong turn's archetype whenever a session has probed more than one gap;
   scoping to gap alone would leak continuation across different sessions entirely, defeating the
   "only within one active session" rule. AC 28.
7. **The context block query excludes the CURRENT session being generated for**, not just
   deduplicating after the fact — `excludeSessionId` is a required argument at every call site, not
   an afterthought filter. AC 32.
8. **Single-applicable-archetype concepts skip exclusion entirely, not just "usually don't
   exclude."** `selectArchetype([x], ...)` must short-circuit before any timestamp comparison runs
   at all — the general algorithm would otherwise try to exclude `x` (the only candidate) and be
   left selecting from an empty pool. AC 6.
9. **"Last 3 sessions" means 3 distinct `session_id`s, not `.limit(3)` on turns.** A single session
   can contain many turns for the same gap (e.g. several retries); naively limiting the turns query
   to 3 rows can return turns from only 1-2 sessions, or even all from the current session if it's
   not excluded first. Resolve the distinct session id set first, THEN fetch turns for that
   resolved set. AC 33.
10. **`generateQuestion` must NOT bolt `archetype` onto `GeneratedQuestion`/`generatedQuestionSchema`**
    — that type is the AGENT's structured-output contract; the chosen archetype is something the
    SERVICE already decided before calling the agent. Return a small local wrapper
    (`{ generated, archetype }`) instead and unwrap it in `buildQuestion`. AC 26.

## Follow-ups this story deliberately does not build

- Persisting real exchange text for push/`startProbe`-answered questions, so those surfaces get the
  same "prior sessions" context block Socratic sessions do (To review item 2) — belongs to the
  separate "Daily push feels like a conversation" story.
- Session semantics for `startProbe` (so rapid repeat calls on the same still-open gap could keep a
  consistent framing the way Socratic retries do) — To review item 3, not built here since
  `startProbe` has no session concept at all today and inventing one is out of proportion to this
  story.
- Replacing `recordArchetypeUsage`'s read-then-write with a single atomic `jsonb_set` — To review
  item 4, not needed given the accepted harmless-race framing (Decision 9).
- Any advisory lock on `gap_archetype_state` (spec.md Decision 6) — deliberately not built, unlike
  `gap_mastery`'s.
- The `deleteTopic` cascade-delete call (`topic.repo.ts:198`) — blocked by this task's own file
  fence, not a design choice (spec.md Decision 7, "To review" item 5).
