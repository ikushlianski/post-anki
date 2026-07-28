---
type: plan-summary
branch: decide-mode
state: confirmed
updated: 2026-07-28
---

# Plan summary: Opinion-First Decision Training mode (/decide)

## What ships

`/decide` already exists as a live, stateless prototype from the project's earliest commits — a
page, an agent, and a controller that already get the core UX right (opinion submitted before any
AI evaluation). This plan turns it into a real feature: every decision + the user's own reasoning
+ the mentor's evaluation is persisted and visible on reload, and each blind spot the mentor
surfaces becomes something the user can explicitly flag as a gap worth revisiting or dismiss —
the first real, queryable signal for a future generalized gap-tracking mechanism (#57) to fold in,
without waiting for #57 to exist first.

## Business logic changes

- Decision sessions (a user's real decision + their own opinion + the mentor's structured
  response) are kept as history, not thrown away on reload — the mode becomes something a user
  can look back through, not just a one-shot tool.
- Blind spots the mentor identifies are individually actionable: a user can flag one as a gap
  worth revisiting or dismiss it as not relevant — turning a read-only evaluation into something
  the user takes a stance on, matching the mode's own "you form the judgment" premise.
- No behavior change to the core sequencing guarantee (opinion submitted before evaluation) —
  that was already correct in the existing prototype and is explicitly preserved untouched.

## Architectural changes

- Two new standalone tables (`decide_sessions`, `decide_blind_spots`) — no subject or topic
  attachment; `/decide` remains independent of the subjects/curricula entity model, a deliberate
  scope decision (see spec.md Decision #2).
- The legacy RPC-shaped `POST /decide` route is renamed to the noun-based `/decide-sessions`
  resource (`POST`/`GET`), plus a new `/decide-blind-spots/:id` resource for the accept/reject
  action — bringing this route in line with every other route in the API, which is already
  noun-based.
- `decide_blind_spots.status` (pending/accepted/rejected) is modeled directly on the
  already-shipped `domain_priority_suggestions` review-queue pattern (AI proposes, user
  explicitly confirms) rather than writing into the existing `gaps` table — which structurally
  cannot represent a topic-less blind spot today, and would violate the "user-only gap creation"
  principle if it tried to auto-log an AI-detected item as a real gap. This is the seam #57
  inherits: a `source: "decide"` discriminator column, ready for a future migration once the
  generalized tracker's own shape is settled.

## Key judgment calls (see spec.md "Decisions made autonomously" for full reasoning)

1. Ship the gap-recording mechanism now, locally, rather than waiting on #57 — the dependency is a
   genuine schema/principle mismatch, not just sequencing, so waiting wouldn't actually simplify
   this plan later.
2. Keep `/decide` standalone, no subject attachment, no speculative nullable `subjectId` — matches
   what's already shipped and the inherently cross-cutting nature of real architectural decisions.
3. No numeric score on the evaluation — stays qualitative, matching the epic's own framing of "gap
   analysis," not a grade.

## Verification

4 e2e scenarios, new `features/decide/` folder in verification-repo (post-anki project) — see
`scenarios.md`, `playwright.md`, `state-fixtures.md`. No architecture.md written — no new async
boundary, service, or infrastructure change; the shift is data-model + route-naming +
UI-affordance only, at the same scale as `check-my-writing-mode`.
