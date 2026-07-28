---
type: discussion
branch: decide-mode
state: confirmed
updated: 2026-07-28
---

# Discussion log — run autonomously, no human present

This plan ran unattended inside worktree `decide-mode`, per direct authorization to resolve every
open question myself and document judgment calls in `spec.md`. Unlike most items built in this
run, this one has **two genuine no-safe-default forks** (not zero) — flagged explicitly by the
task as the most product-ambiguous item planned so far. Both are logged in full in spec.md's
"Decisions made autonomously"; this file captures the interview-order reasoning and the forks that
turned out to have safe defaults after all.

## Branch-defining forks (resolved first, would have reshaped the rest of the plan)

**1. Is this even a "build from scratch" task?** No — first action was to check for existing code
matching the wishlist's pointers, since the pointers named `apps/api/src/practice/` only "for
reference," suggesting no direct reuse existed. Instead, a full, live, nav-linked `/decide`
implementation was found, dated to the project's very first commit (2026-06-01) — predating even
the subjects/curricula model. This reframed the entire plan from "design an interaction from
scratch" to "evolve a stateless prototype into a persisted, actionable feature while preserving
its one correct design decision (opinion-first sequencing)." Every subsequent fork was reasoned
against this discovery.

**2. #57 (generalized gap-tracking) dependency — ship now or wait?** Genuine fork, no safe
default; full reasoning in spec.md Decision #1. Summary of what tipped it: the current `gaps`
table requires `topicId` (structurally incompatible with a topic-less decision, regardless of
#57's timing), and `.product/PRINCIPLES.md`'s "user-only gap creation" principle — confirmed in
`gap.controller.ts`'s `handleDeclareGap`, which always writes `origin: "user"`, never `"ai"` —
means an accept/reject step is unavoidable even under a future generalized tracker. Both facts
hold independent of whether #57 exists yet, so waiting for #57 would not have simplified this
plan. **Decision: ship a local accept/reject mechanism now** (`decide_blind_spots.status`),
modeled on the already-shipped `domain_priority_suggestions` pattern, with a `source: "decide"`
discriminator as the seam.

**3. Entity attachment — subject-scoped or standalone?** Genuine fork, no safe default; full
reasoning in spec.md Decision #2. Summary: the wishlist's Done-when never mentions subjects, the
existing shipped page has no subject picker, and real architectural decisions are inherently
cross-cutting (unlike `writingChecks`, which is deliberately English-subject-specific).
**Decision: standalone, no `subjectId` at all** — not even a speculative nullable one, since this
codebase's own pattern (`curricula.domainNodeId`) proves that's cheap to add later if a real need
appears.

## Independent leaves (safe, reversible defaults — resolved without stopping)

**4. Gap-analysis structure — numeric score or qualitative?** Codebase-consistent default:
qualitative, no score. `decide.agent.ts`'s existing instructions already say "not a yes/no...
but where their reasoning stands" — adding a score would contradict instructions this plan isn't
touching. Reversible: a score column could be added additively later if ever needed.

**5. Route naming — keep legacy `POST /decide` or rename to noun-based `/decide-sessions`?**
Codebase-consistent default: rename. Every other route in `router.ts` is noun-based
(`/subjects`, `/gaps`, `/domain-priority-suggestions`); `/decide` was the one RPC-shaped
survivor from before that convention solidified, and this plan is already touching the route's
behavior (adding persistence) — no reason to carry the old shape forward. Low-risk: this is a
single-owner local app with no external API consumers to break.

**6. Where does the blind-spot id come from — the LLM or the server?** Codebase-consistent
default: server-generated, via `newId()`, exactly like `insertPrioritySuggestion` already does for
`domain_priority_suggestions`. The agent's schema (`decideResultSchema`) stays untouched
(`blindSpots: string[]`); the orchestrator wraps each string into a row at insert time. Avoids
relying on an LLM for stable, collision-free ids.

**7. New verification-repo feature folder or reuse an existing one?** Codebase-consistent default:
new `features/decide/` folder. `/decide` shares no UI, no route prefix, and no data model with
`practice/`, `curriculum/`, or any subject-scoped folder — matches how `probe/` and `tag/` are
already standalone top-level folders for the same reason.

**8. Single-table vs child-table shape for blind spots?** Codebase-consistent default: child
table (`decide_blind_spots`), not a jsonb column on `decide_sessions`. Each blind spot needs its
own independent `status`/`resolvedAt` lifecycle — a jsonb array would require read-modify-write
semantics for a single-item update, which this codebase avoids elsewhere (`domain_priority_
suggestions` is a real table, not a jsonb column on `domain_nodes`, for the identical reason).

## Advisor pass

Ran the `advisor` tool once against the completed draft (spec.md + scenarios.md + playwright.md +
state-fixtures.md all present), before promoting to `confirmed`. It validated the three hard forks
(#57 dependency, entity attachment, no-score) as independently reasoned, not copied from item 7's
precedent — and found four real gaps, all fixed before confirmation:

1. **Blocking: the 200-`FALLBACK` response no longer type-checks.** The response type moved from
   `DecideResult` (`blindSpots: string[]`) to the persisted `DecideSession`
   (`blindSpots: DecideBlindSpot[]`, real `id`/`createdAt`) — `FALLBACK` couldn't satisfy that
   shape without a real inserted row, which the no-junk-history rule already forbids. **Fixed:**
   both agent-failure branches (thrown error, null structured output) now return `502` uniformly;
   the old 200-FALLBACK branch is gone. spec.md's Route design section documents this as a
   deliberate, small behavior change from the pre-existing controller.
2. **Blocking: caller sweep was incomplete.** Only `apps/web/src` and three API files had been
   grepped — not `apps/bot`, `apps/mobile`, `e2e/`, or verification-repo. Ran the full sweep: zero
   real hits outside `apps/web/src/curriculum/api-client.ts:846-847`'s `decide()` function (the
   verification-repo hits are the unrelated English word "decide" in `resource-enrichment`'s
   `decide-first-proposal.action.ts`). **Fixed:** spec.md's Files-touched tree now names the sweep
   result explicitly and the Backend DoD asserts the legacy route no longer resolves.
3. **S2's two-distinct-mock-responses assumption was unverified**, and this exact class of gap
   (`mock-openrouter` ignoring a request parameter) is precisely what `workplace-scenario-packs`
   found and fixed for a different parameter. **Fixed:** narrowed S2's ordering assertion to the
   user-supplied `decision` text (echoed back from the request, not mock-generated) — sidesteps
   the mock's prompt-discrimination behavior entirely rather than assuming it works.
4. **New web server functions were about to land in `curriculum.api.ts`** — a fresh entity-first
   violation, not inherited drift. **Fixed:** spec.md's Files-touched tree now routes them through
   new `apps/web/src/decide/` files (`decide.api.ts`, `decide.model.ts`, `decide.server-fns.ts`),
   removing `decide()` and its type imports from `curriculum/api-client.ts` and
   `curriculum/curriculum.api.ts` entirely.

Two smaller corrections also applied: S3's scenery labeling was worded differently in
`scenarios.md` vs `state-fixtures.md` (now both read "scenery, produced front-door; no seed path
exists"), and the consistency gate below was run for real, after these fixes, rather than the
files being marked `confirmed` before verification — the advisor caught that ordering mistake too.

## Consistency gate — run after the advisor fixes, before confirming

1. **Scenario → Acceptance.** PASS — S1-S4 each have Code(BE)/Behavior(FE)/Integration(Infra)/
   Observability/Tests populated, no blank layers.
2. **Scenario → e2e box.** PASS — exactly one unchecked `[ ] @decide-mode.S<N> — e2e test written`
   line per scenario, confirmed by direct grep (4 matches, S1-S4, no duplicates).
3. **Scenario → state contract.** PASS — every scenario has a `state-fixtures.md` row with a
   concrete (non-vague) state list, subject/scenery tags, state source, and reseed strategy; S4's
   "no state required" is an explicit, reasoned none, not a vague placeholder.
4. **Scenario → action map.** PASS — `submitDecide`, `getDecideHistory`, `resolveDecideBlindSpot`
   all appear in the consolidated action-gaps table with accurate used-by lists; S4 explicitly
   composes no action (direct locator assertions only) and states why.
5. **Diagram → scenario/architecture.** PASS (vacuous) — no diagrams in this plan; nothing to
   orphan.
6. **Deriver.** PASS — the one pure-logic item (`decideInput`'s `.trim().min(1)` validator) names
   its test file and the scenario (S4) it belongs to.
7. **Documentation.** PASS (N/A, documented) — no `architecture.md` written (no new async
   boundary/service/infra change); spec.md's Documentation changes section states this explicitly
   rather than leaving it blank.
8. **Constitution + framework safety.** PASS — no scenario seeds its own subject (S1 and S3's
   setup are both real front-door submissions); no forbidden target (local Docker Postgres only,
   per `project.json`); no `test.skip` planned; every action gap is a real stub to build, not a
   parked skip.
9. **Open questions → carried.** PASS — `playwright.md` and `state-fixtures.md` both state no open
   questions remain, and both explicitly note the one deliberately-deferred idea (a nullable
   `subjectId` cross-link) so it isn't silently re-added during implementation.

**Consistency gate: PASS (9/9) — spec.md, scenarios.md, playwright.md, and state-fixtures.md
promoted to `confirmed`.**
