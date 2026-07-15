---
type: todo
branch: learning-map-chat
task: Persistent sidebar study chat with cross-curriculum learning-map context + level-aware generation
state: open
updated: 2026-07-15
---
# Todo: Learning-map sidebar chat

## Decisions to make
Nothing to decide — every fork below was resolved autonomously during this unattended planning
run (no `AskUserQuestion`), with a logged default. Listed here for morning review only.

- **Gap regression/demotion not built.** A wrong answer never demotes an already-`covered` gap
  back to `open`. Verified the existing model already satisfies "wrong answers go to review"
  (they simply never leave `open` in the first place for a first attempt), and demotion was never
  asked for in the user's own words. If forgetting/regression tracking is actually wanted, that's
  new scope, not a bug fix — flag if so.
- **`SocraticChat` component reuse deferred to implementation time.** The sibling
  `topic-study-experience` plan's `SocraticChat` doesn't exist in `main` yet at planning time, so
  its internal decomposition can't be inspected. Default: build this plan's sidebar chat as its
  own component; at implementation time, extract/share bubble+input presentational pieces with
  `SocraticChat` only if it already isolates them cleanly. Not blocking either way.
- **Chat transcript is session-local (browser tab), not server-persisted** — matches the sibling
  plan's identical decision for `SocraticChat`, for consistency across the two chat surfaces on
  the same page. A reload loses scrollback but not underlying progress state (there is no
  underlying state here to lose — this chat never writes to the DB).
- **Learning-map summary budget: 10 curricula / 1,200 chars, ranked in-progress-first.** A
  concrete default so the deriver is testable; revisit only if real usage shows it's too tight or
  too loose once the learner has enough curricula to hit the cap.
- **Level-aware coverage line is a flat text hint, not a structured schema field.** Appended to
  the existing prompt-building string functions (`buildPrompt` in `probe-session.generate.ts`,
  the Socratic ask-prompt path) rather than a new field threaded through
  `generatedProbeBatchSchema`/`socraticEvalSchema` — it's guidance for the model, not something
  the caller needs to read back structured.

## To review / clarify
- **Cross-plan dependency (build-order, not a blocker for this plan alone):**
  `study-stats-dashboard`'s next-step recommender and weak/strong-spot view consume this plan's
  `getLearningMapSnapshots()` (`apps/api/src/curriculum/curriculum.repo.ts`) and its
  `LearningMapSnapshot` type directly rather than defining a parallel query. Implement this plan
  first, or at minimum land that one repo function + type before `study-stats-dashboard`'s
  recommender work starts, or its code won't have anything to compile against.
- **Streak/"hailed and commended" UI belongs entirely to `study-stats-dashboard`**, not this plan
  — flagging only so nobody assumes this plan surfaces a streak banner. It doesn't; this plan is
  chat + generation context only.

## Manual steps
No manual steps required — no new env vars, secrets, or infra. The chat agent uses the same
`OPENROUTER_API_KEY`/model resolution every other Mastra agent in `apps/api/src/mastra/` already
uses.

## Post-deploy checks
- Open a topic page with only one curriculum studied and confirm the chat still answers
  sensibly (SCENARIO 3's degrade-gracefully case) rather than erroring on an empty comparison set.
- Open a topic in a curriculum with module `level: null` (a pasted-material curriculum, not a
  research one) and confirm quiz/Socratic generation is byte-for-byte unchanged from before this
  plan (SCENARIO 5's no-level-tiers case).
