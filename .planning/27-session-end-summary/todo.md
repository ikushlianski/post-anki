---
type: todo
branch: 27-session-end-summary
task: "[Story] Session ends with a gap and progress summary (#27)"
state: open
updated: 2026-08-14
---

# Todo: Session ends with a gap and progress summary (#27)

## Decisions to make

Nothing blocking implementation. Six forks had a safe, reversible, pattern-following default;
logged one line each below for `ORCHESTRATOR-MEETING-NOTES.md`, full reasoning in spec.md's
per-decision sections. None touches auth or money; the one migration is additive and nullable, the
one new infra job is a config-only addition mirroring an existing pattern exactly. **One item below
("Flagged for Ilya") is NOT a safe-default item — it's surfaced for awareness, not blocking.**

1. "Session" = a `socraticSessions` row (topic-menu-initiated discussion) — the only substrate that
   can structurally reach "5+ exchanges"; the `/today` push flow is single-exchange by construction
   and out of scope (spec.md "Verified facts" + Decision 1).
2. Soft checkpoint counted from `listTurnRows`'s answered-turn count, guarded by a new
   `checkpoint_shown_at IS NULL` column check — no separate counter column, no per-depth scaling.
3. "Continue now" reuses the existing `"continue"` callback / `onContinue` path verbatim — zero new
   callback kind, zero new endpoint.
4. Last-activity signal for the 30-minute inactivity check is the pending turn's `createdAt` (or the
   last answered turn's `answeredAt` as a backstop), never `chat_context.updated_at` — the latter is
   polluted by unrelated menu-browsing writes.
5. Race guard between `/done` and the sweep is a conditional `UPDATE … WHERE status='active'
   RETURNING *` on `completeSocraticSession`, not a separate `summarySentAt` column — reuses this
   codebase's own existing CAS pattern (`tryClaimReplenish`).
6. No `gaps.sessionId`/`createdAt` migration in this story — PM's triage note anticipated it under a
   different reading of "session" (the `/today` push flow); under the Socratic-session reading this
   plan adopts, nothing would ever write those columns yet, so adding them now is premature schema.

## Flagged for Ilya (read before or during implementation — not a blocker, but material)

**The summary's headline "Gap (most recent)" line has no data source and will read "Solid session —
no new gaps logged" on every session this story ships**, because `answerSocraticSession` never calls
`insertDiscoveredGaps` (it only covers existing gaps) and `SocraticDegree` has no "explicit
admission" value to hook a discovery call onto (spec.md Decision 1, "Verified facts"). This plan
does not build around it or fake it — the summary mechanism and copy are real and match #27's own
spec'd zero-gap fallback exactly, but the feature's other headline half is, in the current codebase,
structurally inert. Two rejected workarounds are recorded in spec.md Decision 1 (redefining "gap" to
mean "a turn that didn't advance" was one — explicitly rejected as violating #28's own
explicit-consent design principle). If real gap content is needed before this ships, that's a
second, separate story: a new `SocraticDegree` admission value or parallel semantic check, an
evaluator prompt change, an `insertDiscoveredGaps` call site in `socratic.service.ts` threaded with
a session id, and the `gaps.sessionId`/`createdAt` migration PM's original triage note anticipated.
Sized roughly medium — smaller than #28 was (the detection logic is narrower: one flow, not the
whole product), but real design work, not a follow-up bullet.

## To review / clarify (not blockers, flagged for awareness)

1. **The `/today` daily-push flow has no multi-turn conversation today at all** —
   `submitProbe` hardcodes `nextQuestion: null` on every answer (`probe.service.ts:203`), so every
   `/today` push is a single question, one answer, done, despite `evaluateAnswer` already producing
   a `nextPrompt` field that gets folded into feedback text rather than used to keep the thread
   going. This is not new to this story and this story doesn't touch it, but it's worth knowing this
   exists as a separate, pre-existing product gap independent of #27 — the "10-minute discussion"
   framing in #27's own opening scenario only works via the topic-menu Socratic path, not via
   `/today`.
2. **#43 is closed-but-unbuilt, reconfirmed independently for the second time.** No `/gaps` command
   exists in `apps/bot/src` despite the GitHub issue showing `closed`
   (`closedAt: 2026-07-31T10:48:33Z`) — same finding `.planning/33-untriaged-gaps-auto-defer/todo.md`
   already flagged for a different story. Worth reopening #43 on the tracker at some point; not this
   story's job to fix.
3. **The topic-menu keyboard (#24) is not appended to the summary message in this story**, even
   though #24 exists and is live. The issue's own body describes this as one combined message
   ("gap shown → progress note → action buttons → topic keyboard"); building it here would have
   meant importing and wiring `nav/menu.ts`'s keyboard-building surface into a new message context,
   a real but small and clearly separable follow-up. Left out to keep this plan's diff to the two
   things it was explicitly asked to design (session-end mechanics, soft checkpoint).
4. **The issue's own worked example uses a depth label (`"architect"`) that isn't a real
   `DepthLevel` value** (`awareness | working | deep`, `packages/shared/src/depth.ts:3`). The summary
   renders the real enum value. Minor, cosmetic, flagged so nobody "fixes" the enum to match the
   issue text instead of the other way around.
5. **288 Cloud Scheduler invocations/day is a first for this repo's infra** — every existing
   scheduled job (`dailyPushJob`, `gapResurfaceJob`, `docScanJob`) runs once a day or once a week.
   Each invocation here is cheap (one `chat_context` row read for a single-owner bot, not a table
   scan), but worth a glance at whichever GCP billing tier this project is on before it deploys, in
   case Cloud Scheduler job-count/invocation pricing has a ceiling worth knowing about up front.

## Manual steps / sequencing constraints

1. **Migration numbering depends on the in-progress cards WIP.** `apps/api/src/db/migrations/
   0039_robust_exodus.sql` is currently staged (`git status`: `A`, not committed) as part of the
   uncommitted cards/newcomer-onboarding work this plan must not touch. This story's own migration
   (adding `socratic_sessions.checkpoint_shown_at`) should be generated via the normal
   `drizzle-kit generate` flow only once that WIP is either committed or reverted — generating it
   against the current, in-flux migration head risks a numbering collision. Not a blocker on
   *planning*; just don't run `db:generate` for this story until that's resolved.
2. **`pulumi config set` step for a real deploy.** `sessionIdleSweepSchedule`/
   `sessionIdleSweepTimeZone` both have safe defaults (`*/5 * * * *`, `Europe/Warsaw`) and need no
   new secret — unlike #33's `apiSharedSecret` requirement, this job reuses the already-configured
   `telegramWebhookSecret`. No new one-time human step beyond the normal `pulumi up`.
3. No new secrets, no new env vars beyond what's already loaded (`TELEGRAM_WEBHOOK_SECRET`,
   `OWNER_TELEGRAM_CHAT_ID`).

## Quality gates (all must pass)

- `npx tsc --noEmit` (root, fans out to every workspace)
- `npx vitest run` (root) — in particular `session-summary.test.ts` (new), `socratic.service.test.ts`
  (checkpoint + idle-check cases), `reply.test.ts` (`/done`), `session-checkpoint-view.test.ts` /
  `session-summary-view.test.ts` (new bot-side view files)
- `npm run test:integration -w @post-anki/api` — needs `npm run e2e:db:up` first — for the new
  idle-check and race-guard integration tests
- `pulumi preview` on the `infra/index.ts` diff (new billed resource)
- No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s verified finding,
  still true) — the typecheck gate is the lint gate

## Easiest things to get wrong (read before implementing)

1. **Don't compute `answeredCount` before `recordTurnAnswer` runs.** The just-answered turn must be
   included in the checkpoint count — query `listTurnRows` AFTER recording the answer, not before
   (spec.md Decision 2's snippet shows the correct ordering). AC 5.
2. **Don't add a `summarySentAt` column.** The race guard is the conditional `UPDATE …
   WHERE status='active'` on `completeSocraticSession` itself — a second guard column would be
   redundant and could drift out of sync with `status`. AC 24-26.
3. **Don't build a new endpoint or callback kind for "Continue now."** It is the existing
   `buildCallback("continue")` / `onContinue` path, unmodified. Adding a parallel one would create
   two ways to resume a session that need to stay in sync forever. AC 12.
4. **Don't derive `mostRecentGap`/`gapsLoggedCount` from turns whose `action !== "advance"`.** This
   was explicitly considered and rejected (spec.md Decision 1) — it silently converts an
   AI-inferred "you struggled here" signal into a #28-style logged gap, which #28's own body says the
   product must never do (explicit user consent only: a Fail tap or a written admission). Keep these
   fields at their real, structurally-empty value. AC 28, Scenario 6.
5. **`lastActivityAt` needs the backstop branch, not just the happy path.** A session can be
   `"active"` with no pending turn at all (the gap-mastery-cascade-delete edge case referenced in
   spec.md Decision 5) — skipping the `turns` fallback means the idle check throws or misbehaves on
   that specific, real, already-documented edge case rather than degrading gracefully. AC 16.
6. **The sweep endpoint lives on the bot, not the API**, unlike `docScanJob` (API-targeted, silent,
   DB-only). This one must actually send a Telegram message, which only the bot process can do
   (`sendMessage`, `TELEGRAM_WEBHOOK_SECRET`) — mirror `/gap-resurface`'s shape, not `docScanJob`'s.
7. **`/done` needs the same conditional-dispatch treatment as `onSocraticText`, not a global
   handler.** Sending `/done` with no active Socratic session must fall through to existing
   behavior unchanged (AC 3) — wire it as a conditionally-invoked dep exactly like
   `onSocraticText`/`onQuizText` already are, not as an unconditional top-level command.

## Follow-ups this story deliberately does not build

- Wiring real gap discovery into the Socratic answer path (see "Flagged for Ilya" above) — the
  single biggest thing this story leaves undone in spirit, even though every AC it was asked to
  satisfy is met.
- Building `/gaps` (#43) or un-hiding the "See all gaps from this session" link — no enabling story
  exists for either half of that link yet (no `/gaps` command, no session-scoped gap data).
- Appending #24's topic-menu keyboard to the summary message.
- #25's topic-steering logic and intensity mode — the checkpoint keyboard's `isIntensityMode`
  parameter is the extension point; #25 supplies the real flag and the second button's behavior.
- Making the `/today` daily-push flow multi-turn (fixing `submitProbe`'s hardcoded
  `nextQuestion: null`) — a separate, pre-existing product gap, not created by this story and not
  required by #27's own acceptance criteria.
