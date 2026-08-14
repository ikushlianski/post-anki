---
type: todo
branch: 95-gap-skip-visibility
task: "No UI control to mark a topic/gap 'done, stop showing it' despite backend support (#95)"
state: open
updated: 2026-08-14
---

# Todo: Restore the skip/want controls for mastery-tracked gaps (#95)

## Decisions made autonomously

Six forks had a safe, reversible, pattern-following default; logged one line each below for
`ORCHESTRATOR-MEETING-NOTES.md`, full reasoning in spec.md's per-decision sections.

1. Gating condition is `gap.status === 'open'` alone, dropping `&& !mastery` entirely — not a
   compound check against `mastery.status === 'mastered'`. `gaps.state` is the only column every
   scheduling/selection path (`inScopeGaps`) actually reads, so it alone should gate the control
   (spec.md Decision 1, Verified facts).
2. The task brief's "hide unless covered/dismissed" phrasing was corrected during planning —
   `dismissed` is a `triage_state` value (#29/#33), not a `gaps.state` value; the two columns are
   confirmed orthogonal (`schema.ts:484`). This plan gates only on `gaps.state`'s `open`/`covered`/
   `skipped` (spec.md Verified facts).
3. The predicate is extracted as a small named exported function, `isGapActionable` (not
   `canCurateGap` — a `covered` gap can still legitimately be curated via `handleCurateGap`'s
   depth/wanted/concern patches, so "can be curated" would misname what the predicate actually
   answers), rather than left inline — per this repo's CLAUDE.md convention of testing extracted sync
   logic directly, giving an exhaustive, DB-free unit-test surface for the state × mastery matrix
   instead of relying only on a heavier component render test (spec.md Decision 2).
4. The render test targets `GapChecklist` (3 props: `topic`, `curriculumId`, `hydrated`), not
   `TopicRow` (9 props) — `GapChecklist` is `GapRow`'s actual immediate parent and the component that
   owns `useCurateGap`; it needs one `export` added since it isn't exported today (spec.md
   Decision 3).
5. `want` and `skip` are fixed together via the shared condition, not split into two separate gates
   — they already sit inside one render block with identical gating today, and nothing about their
   semantics differs based on mastery presence (spec.md Verified facts).
6. No `playwright.md` produced in this pass — this pass's deliverable was scoped to
   `{spec.md, scenarios.md, todo.md}`; no e2e coverage exists for these controls today in either
   state, so nothing regresses either way. Logged below as a real follow-up, not silently dropped.

## Verified, not assumed (worth knowing before implementing)

- The daily-push exclusion for a skipped gap already works independent of mastery — traced
  `inScopeGaps` → `gatherPushCandidates` → `rowToGap`, confirmed `rowToGap` never derives `state`
  from the `gap_mastery` sidecar (comment: "`state` itself is left completely untouched here"). No
  backend change needed anywhere in this story.
- No existing writer resets an already-`covered` gap's `gaps.state` back to `open` while its mastery
  status stays `mastered` — checked every `state: "open"` write site in `apps/api/src`; all three are
  brand-new gap `INSERT`s, not resets of an existing row. If a future story adds a resurface/recycle
  writer that does reset state, re-check this plan's Decision 1 assumption before reusing it as-is.

## To review / clarify (not blockers, flagged for awareness)

1. **post-anki is a registered verification-repo project and this fix does touch `apps/web`**, unlike
   `.planning/22-voice-responses`'s bot-only surface. No e2e action/test exists today for either the
   "want" or "skip" gap controls (`grep -rln "skip\|want"` against the curriculum feature folder in
   verification-repo finds only an unrelated seed file). Worth a `/write-playwright-tests` or
   `/plan-playwright` pass at implementation time if this project wants that surface covered — not
   required for this fix to be correct or safe to ship without it.

## Manual steps / sequencing constraints

None. No migration, no env var, no infra change, no deploy-time secret.

## Quality gates (all must pass)

- `npx tsc --noEmit` (root, fans out to `apps/web`)
- `npx vitest run` (root) — new `isGapActionable` unit coverage (exhaustive over the 8 ACs in
  scenarios.md) and the new `topic-row.test.tsx` render smoke test
- No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s already-verified
  finding) — the typecheck gate is the lint gate
- No `npm run test:integration` gate — nothing in this story touches the database

## Easiest things to get wrong (read before implementing)

1. **Don't gate on `mastery.status` at all, even as a secondary check.** The whole point of Decision
   1 is that `gaps.state` alone is sufficient and correct — reintroducing a mastery check (even
   "unless mastered") duplicates logic `gaps.state` already encodes and reopens the exact class of
   bug this story fixes. AC 1-5.
2. **Don't touch the `skipped` early-return block (`topic-row.tsx:411-417`).** It already correctly
   shows no buttons for a skipped gap for an unrelated reason (nothing to curate on a terminal row);
   leave it exactly as-is.
3. **Don't add a backend change.** `handleCurateGap`, `applyGapMasteryAttempt`, `inScopeGaps`, and
   `selectDailyPush` are all already correct — this is confirmed by direct code tracing in spec.md,
   not assumed. If implementation surfaces a case where daily push doesn't actually drop a skipped
   mastery-tracked gap, that's a real finding to raise, not something to route around by adding scope
   here without flagging it first.
4. **Don't touch `packages/shared/src/cards.ts`, `apps/api/src/cards/`, `apps/api/src/mastra/
   mastra.ts`, or `apps/api/src/topic/topic.repo.ts`** — pre-existing uncommitted WIP, out of scope.

## Follow-ups this story deliberately does not build

- E2e/Playwright coverage for the want/skip gap controls (see "To review / clarify" above) — real,
  but not required for this fix, and out of this pass's scoped deliverable set.
- Any backend change to the mastery/state sync logic — none was found to be needed.
- Un-skipping a gap from the UI — not requested by #95.
