---
type: spec
branch: main
task: Telegram bot — subject → curriculum → (Socratic | quiz) selection and continuation
complexity: simple
state: confirmed
updated: 2026-07-11
---

# Spec: Telegram quiz + Socratic subject/curriculum selection

### Finding

The requested feature is **already fully built and wired**, shipped in commit `6ccfb76`
("Add Telegram quiz and Socratic learning bot"), matching its own already-confirmed source
plan `.planning/telegram-frontend/scenarios.md` scenario-for-scenario. No commits have
touched `apps/bot` since. This plan is an audit, not a build:

- Full navigation: subject → curriculum → module/topic → start/continue, both modes, wired
  end-to-end through real API calls (see `scenarios.md` scenarios 1–9, each with file
  citations). No dead handlers, no stub responses, no TODOs found in `apps/bot/src`.
- The quiz token-cost constraint is **already satisfied** by the existing
  `probe_sessions` / `probe_session_questions` mechanism — see "Token cost" below. No
  second caching layer is needed.
- Socratic session resume is **already idempotent server-side** — a repeat "Continue" tap
  returns the pending turn instead of creating a duplicate session or losing history
  (`apps/api/src/socratic/socratic.service.ts:64-83`).

The only residual scope is **production activation** — a one-time webhook registration,
not a code change (SCENARIO 10 in `scenarios.md`).

### Single phase

Single phase: activation only. No implementation phases, no derivers, no new files — there
is no business logic to build.

### Derivers

None. No new pure computation is introduced; the existing derivers (`quiz-view.ts`,
`socratic-view.ts`, `progress-label.ts`, `callback.ts`) already have unit tests and are
unchanged by this plan.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 | `apps/api` subjects endpoint — verified, unchanged | `apps/bot/src/nav/menu.ts` — verified, unchanged | None |
| SCENARIO 2 | `apps/api` curricula endpoint — verified, unchanged | `apps/bot/src/nav/menu.ts`, `apps/bot/src/nav/dispatcher.ts` — verified, unchanged | None |
| SCENARIO 3 | `apps/api/src/probe-session/probe-session.service.ts` — verified, unchanged | `apps/bot/src/nav/dispatcher.ts` — verified, unchanged | None |
| SCENARIO 4 | `apps/api/src/probe-session/*` — verified, unchanged | `apps/bot/src/quiz/quiz-flow.ts`, `apps/bot/src/quiz/quiz-view.ts` — verified, unchanged | None |
| SCENARIO 5 | `apps/api/src/socratic/socratic.service.ts` — verified, unchanged | `apps/bot/src/socratic/socratic-flow.ts`, `apps/bot/src/socratic/socratic-view.ts` — verified, unchanged | None |
| SCENARIO 6 | `apps/api/src/socratic/socratic.service.ts`, `apps/api/src/probe-session/probe-session.repo.ts` — verified, unchanged | `apps/bot/src/nav/dispatcher.ts` (`onContinue`) — verified, unchanged | None |
| SCENARIO 7 | N/A | `apps/bot/src/nav/progress-label.ts` — verified, unchanged | None |
| SCENARIO 8 | `apps/api/src/probe-session/probe-session.service.ts` — verified, unchanged | `apps/bot/src/nav/dispatcher.ts` (`regenerateTopic`/`regenerateModule`) — verified, unchanged | None |
| SCENARIO 9 | `apps/api/src/probe-session/*` — verified, unchanged | `apps/bot/src/nav/dispatcher.ts` (`startModule`) — verified, unchanged | None |
| SCENARIO 10 | None | None | `apps/bot/scripts/set-webhook.ts` — run once (manual, no file change) |

### Files to create

No new files.

### Files to modify

No files require modification for the feature to work as specified. `.product/DECISIONS.md`
should get a new entry documenting the shipped feature (see `todo.md` "Post-deploy checks")
— a documentation update, not a code change, and not a blocker.

### Data model changes

Not applicable. `probe_sessions`, `probe_session_questions`, `socratic_sessions`,
`chat_context`, `pending_probe` already exist per migrations shipped in `6ccfb76`.

### Token cost — how quiz generation avoids wasteful LLM calls

Confirmed satisfied by the existing mechanism, no new caching layer needed:

`apps/api/src/probe-session/probe-session.service.ts` `prepareProbeSession`: on every
start/continue call, it first looks up an active session for that scope via
`getActiveSessionRow` (`probe-session.repo.ts`); if one exists, it is returned as-is — the
LLM (`generateProbeBatch`) is invoked only when no active session exists for that scope, or
when the user explicitly taps "🔄 Regenerate" (`regenerate: true`, which deletes the prior
session first). Answers are persisted per-question (`answeredIndex`, `outcome`) so scoring
at answer time is a deterministic lookup against the stored `correctAnswerIndex` — zero LLM
calls during quiz-taking itself. This is exactly the "pre-generated, reuse-until-regenerated"
design already recorded in project memory, and it is live in the current codebase, not a
gap to build.

Socratic per-turn evaluation (`evaluateSocratic`) is a genuine LLM call per learner answer —
inherent to a conversational teaching mode, not a caching gap, and out of scope for the
quiz-caching constraint.

### Documentation changes

No architectural shift occurred, so no `docs/architecture/<slug>.md` is required.
`.product/DECISIONS.md` has no entry for commit `6ccfb76`'s quiz/Socratic bot work — closing
that gap is recommended in `todo.md` "Post-deploy checks" but is documentation hygiene, not
a spec requirement.

### Decisions made autonomously

- **Mode auto-selection kept as-is (server decides quiz vs Socratic by topic status),
  no explicit chooser UI built.** Matches the already-confirmed source plan and shipped
  code; adding a chooser would be unrequested new scope. Logged for review in `todo.md`
  item 1 in case the task's intent was actually an explicit user choice.
- **No second quiz-caching layer built.** The existing `probe_sessions` /
  `probe_session_questions` reuse-until-regenerated mechanism already satisfies the
  token-cost constraint; duplicating it would add complexity with no behavioral gain.
- **Treated production webhook activation as an operational step, not a spec deliverable.**
  Consistent with this repo's existing pattern (`.inbox/TODOS.md`'s deployment runbook
  already separates activation steps from code); recorded in `todo.md` "Manual steps".

### Implementation order

No implementation required. If the "Manual steps" webhook activation has not yet been run
in production, that is the only outstanding action, and it is an ops step outside this
spec's code scope (see `todo.md`).

### Scope boundary

Out of scope: any new mode-selection UI, any new caching layer, any data model change, any
change to `apps/bot` or `apps/api` source. This plan intentionally does not re-plan or
re-scope the already-shipped and already-confirmed `.planning/telegram-frontend/scenarios.md`
work.
