---
type: discussion
branch: generalize-gap-tracking
task: "Generalize the phrase-bank mastery state machine to drive gap tracking for every subject kind (issue #57)"
state: confirmed
updated: 2026-07-28
---

# Discussion — grill-me record (unattended session)

This plan was produced with no interactive human review. In place of a live interview, an
adversarial pass was run via the `advisor` tool (a stronger reviewer model with full transcript
visibility) before scenarios/spec were finalized, then a second self-directed grill-me pass walked
the remaining forks. Both rounds are recorded below in the standard "question, recommended answer,
resolution" shape, most-leveraged fork first.

## Round 1 — advisor adversarial pass (pre-scenario-drafting)

**Q: Is the narrow-scope call (vs. unifying with domain_priority_suggestions/decide_blind_spots)
actually right, or is this just the answer I wanted to find?**

Advisor's read: the scope call is right, and the evidence — not the task's initial framing —
settles it. `domain_priority_suggestions.source`'s own code comment names #49/#53 as its seam, not
#57; the task's premise that item 7 was built for this issue is simply wrong, and needs stating
explicitly so nobody re-opens it. Only `decide_blind_spots` names #57, and a blind spot on a unique
one-off decision has no re-askable question and no correct answer — it cannot enter a recycling
schedule regardless of what its comment says. **Resolution: confirmed as-is** — see spec.md
Decision 1.

**Q (the sharpest pushback): if mastery state lives on the same gap rows three other call sites
already write to, doesn't "resolved" become a lie?**

Yes — flagged as blocking, not stylistic. Three writers already flip `gaps.state` to `"covered"`
on a single verdict, including `socratic.service.ts`'s `give_answer`/`move_on` path, which fires
when the SYSTEM gives up, not when the learner demonstrates anything. **Resolution: sidecar table
(`gap_mastery`), not columns on `gaps`** — isolates the new stricter semantics from the three
pre-existing single-verdict writers entirely; `gaps.state` becomes a bridge value the new mechanism
is allowed to write TO (once, at mastery) but the three old writers never read or are gated by the
new columns. See spec.md Decision 2 for the full trade-off (a genuinely accepted, pre-existing
cross-writer race on `gaps.state` that this item does not attempt to close, since it predates this
item and involves two structurally different, deliberately-untouched features).

**Q: does 3 non-adjacent corrects actually force cross-session spacing, or can it be gamed inside
one quiz sitting?**

This was the second blocking finding. Phrase-bank's adjacency check only works because recycling
happens once per BATCH-GENERATION event, and a single generate call recycles a phrase into ONE
future batch — not because of some inherent session boundary. Naively porting "questions answered
per topic, offset 3" onto probe-session (which interleaves many topics/questions within one
session and auto-chains replenish batches) could let a gap go new→mastered inside a single
10-16-question sitting. **Resolution:** set `GAP_RECYCLE_OFFSET = 10` (matching
`REPLENISH_BATCH_SIZE`/`MIN_TOTAL`, the actual size of "one generation event"), and make due-gap
selection run exactly once per generation event (mirroring `selectDuePhrases`'s own call
discipline), never re-evaluated mid-batch. The concrete math is in spec.md Decision 4 — a gap
answered at counter N cannot become due before N+10, and a single generation event never serves
more than 10 questions, so at least 2 additional generation events (3 total) are structurally
required for 3 non-adjacent corrects to land. S3 in scenarios.md is the scenario that proves this
directly, and it's the one most likely to catch a subtly wrong constant during implementation.

**Q: does the existing selection/tagging wiring in probe-session.generate.ts get reused, or is a
parallel path being built?**

Reused — `selectGaps(ctx, topicCtx, "open-ranked")` already exists for replenish batches; this item
adds a `"due-ranked"` mode driven by `scheduledForSequence` as the direct generative analogue of
`selectDuePhrases`, following the exact same `gapIdByKey`-tagging mechanism already in place. No new
parallel selection path. Confirmed in spec.md's Files-to-touch list.

**Q: does the new write path risk reproducing the FK/lock-order deadlock the concurrency-fix item
already found (and hasn't shipped a fix for yet)?**

Addressed directly in the design: advisory lock on `hashtext(topic_id)` acquired BEFORE any
`FOR UPDATE` on both the new write sites, same order both places, no second lock type introduced.
See architecture.md's Concurrency design section and DoD's S8 concurrency proof.

## Round 2 — self-directed grill-me (post-scenario-drafting)

**Q: probe-session-only vs. also probe.service.ts — is leaving probe.service.ts untouched actually
defensible, or just convenient?**

Recommended default (stated up-front): probe-session only, since it has a clean binary
right/wrong. Checked for counter-evidence: `apps/api/src/probe/probe.service.ts`'s evaluation is a
qualitative LLM judgment per free-text answer (`ProbeEvaluation` with `verdicts`, not a fixed-option
correct/incorrect) — there's no natural "attempt correct: true/false" signal of the same shape
phrase-bank's derivers expect without inventing one (e.g. deciding what LLM-judgment threshold
counts as "correct enough"). That's a materially different, harder design problem the issue's own
Done-when doesn't ask for ("probe/quiz question", singular concept, not "and also Socratic
dialogue"). **Resolution: confirmed, no counter-evidence found** — S6 is the explicit regression
scenario proving this boundary holds.

**Q: is a sidecar sequence counter on `topics` the right home, or should it live on `gaps` itself
(scoped tighter)?**

`gaps.topicId` already scopes correctly to what needs a shared counter — multiple gaps on the same
topic must share ONE monotonic sequence (mirroring how multiple phrases share one
subject/level/pack sequence), so the counter belongs on the shared scope (`topics`), not on each
gap individually. Putting it on `topics` also matches the existing `progressAttempts` precedent
already living there. **Resolution: confirmed as spec'd.**

**Q: the UI acknowledgment default ("✓ Resolved: <label>" chip) — is this actually specified enough
for `/write-playwright-tests` to write a real assertion, or is it hand-wavy?**

Caught a real gap here: the exact selector/testid wasn't named. **Resolution:** added to DoD/
scenarios as "a small emerald-styled chip distinct from the plain correct-answer text" with the
concrete negative check in S5 (must NOT appear at stage 1/3) — `data-testid` naming itself is left
as implementer guidance in `playwright.md` (per this skill's own rule that testids are guidance,
not Acceptance items), but the DISTINGUISHING behavior (present at mastery, absent below it) is
locked as a hard assertion so the test can't be written loosely.

**Q: cross-cutting nudge — could this become a nagging queue if not careful, violating "silent on
non-response"?**

Real risk if implemented as a persistent "N nudges pending" badge. **Resolution:** specified as a
read-only, on-demand computed view with no persistence of "shown" state and no queue affordance —
matches `daily-push.ts`'s existing single-item-per-day pattern rather than inventing a new
notification system. Locked as a negative assertion in S7/S9.

**Q: is there anything left that would stop a mid-implementation loop, per this skill's
loop-readiness requirement?**

None identified. Every scenario's Acceptance block is detailed enough for `/write-playwright-tests`
to author a red test without further interview (input/output shapes, edge cases, negative
assertions all present). The one soft item — exact `data-testid` names — is explicitly guidance,
not a blocking Acceptance item, per this skill's own convention.

## Round 3 — second advisor adversarial pass (post-scenario-drafting, pre-confirmation)

Run specifically because Round 1 flagged the single-session-mastery-bug as blocking and the fix
needed real verification, not just a plausible-sounding constant. Four findings, all resolved
before confirmation:

**Q (the one that actually invalidated the design): does `GAP_RECYCLE_OFFSET = 10` really force
cross-session spacing?**

No. Traced through with real numbers: `maybeReplenish` fires automatically after every answer once
remaining drops to `REPLENISH_FLOOR` (10), appending 10 more, for as long as the learner keeps
answering — a single uninterrupted sitting can auto-chain dozens of replenishes with no session
boundary ever crossed. Worked the arithmetic through: a gap missed at answered-count 1 reaches
"mastered" by answered-count ≈55, all in one sitting. The original S4 (seeding `masteryStage: 2`,
submitting one correct) couldn't have caught this either, since it never drove the spacing at all.
**Resolution:** replaced sequence-based mastery-stage gating with session-identity gating
(`gap_mastery.lastCorrectSessionId`, compared against the CURRENT `probe_sessions.id`) — see
spec.md Decision 4's full rewrite. The answered-question-counter offset is kept, but demoted to
what it actually proves (anti-spam: don't re-serve the same struggling gap into the very next
batch), not "later session" (which only session identity can prove). S3 and S4's scope
descriptions were both corrected to state this precisely, and S4 was rewritten to drive three real
corrects across three real `probe_sessions` rows rather than seed a shortcut.

**Q: does the sidecar table design leave a display-time contradiction the first draft didn't
name?**

Yes — a gap with a `gap_mastery` row below stage 3 can still have `gaps.state` flipped to
`"covered"` by the untouched Socratic path touching the same topic. Before this item there was no
mastery stage to contradict, so this is a genuinely NEW divergence this item introduces, not a
pre-existing one to wave through. **Resolution:** added the explicit display-precedence rule
(spec.md Decision 2 addendum) — a gap with a `gap_mastery` row always displays its mastery status,
never falls back to `gaps.state`. S5 was extended with a second negative-assertion case proving
this directly.

**Q: does gating "covered" behind stage 3 instead of the first correct have a side effect on
existing topic-maturity math the plan hadn't named?**

Yes — `gapMaturity`/`progressFromGaps`/`learningStatus` will read differently (lower percentage,
longer "probing" status) for any topic using mastery-tracked gaps, and an existing e2e
(`weak-strong-spots`) reads from this exact path. **Resolution:** named explicitly as an accepted,
intentional consequence (spec.md Decision 6), with a regression check folded into S6 confirming
the existing test's baseline (topics with no mastery-tracked gaps) is unaffected.

**Q: is the cross-cutting nudge accidentally wider than the scope it was handed?**

Yes — the first draft's `detectCrossCuttingGaps` counted any `gaps.state === "open"` gap,
including ones discovered exclusively through the untouched Socratic flow (no `gap_mastery` row at
all), which the task's directive explicitly scoped out. **Resolution:** tightened to require
`hasMasteryTracking: true` and a `practicing`/`struggling` status (spec.md Decision 7); S7 gained a
4th, untracked-gap case proving it's correctly excluded from the threshold.

**Precedent check requested by the advisor, done before confirming:** read
`.planning/phrase-bank-concurrency-fix/scenarios.md` directly — it tags its integration-only
concurrency scenarios (2-4) with a file-path checkbox, reserving `@TICKET.SN` exclusively for its
one true e2e scenario (5). S8 here was re-tagged to match that exact precedent rather than using
`@GENGAP.S8`, since the scenario-coverage gate reads Playwright tags specifically.

## Recap

Settled: unify-vs-narrow scope (narrow), sidecar-vs-columns (sidecar), probe-session-only scope
line, session-identity gating for mastery-stage advancement (the corrected fix for the
single-session bug, replacing the invalidated offset-only design), the display-precedence rule
(mastery status over `gaps.state`), the topic-maturity/stats side effect (named and accepted, not
silently absorbed), the cross-cutting nudge's mastery-tracked-only scope, lock discipline, nudge
non-nagging design, UI acknowledgment behavior, and the S8 tagging convention (matched to
`phrase-bank-concurrency-fix` precedent). `regenerateQuizBatch` is confirmed to require starting a
genuinely NEW `probe_sessions` row (`regenerate: true`), not a replenish — this is now load-bearing
for S3/S4's proofs, not a convenience helper. Deferred to implementer: exact `data-testid` names
(guidance only, per `playwright.md`), whether an existing UI control drives `regenerate: true` or
`regenerateQuizBatch` calls the endpoint directly, and the field-name mismatch noted between
`packages/shared/src/gap.ts`'s `state` and the web app's local `gapStatusSchema`/`status` naming in
`apps/web/src/curriculum/model.ts` — none of these change any scenario's behavior or Acceptance
criteria.
