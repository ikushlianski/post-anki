---
type: spec
branch: 27-session-end-summary
task: "[Story] Session ends with a gap and progress summary (#27)"
complexity: complex
state: planned
updated: 2026-08-14
verification:
  targetDb: postanki_e2e (local docker, e2e/docker-compose.yml, port 5436)
---

# Plan: Session ends with a gap and progress summary (#27)

## What this story is, in one paragraph

Nothing today tells the user their Socratic discussion is over, checkpoints it, or shows them what
it revealed. This plan adds real session identity semantics on top of the one mechanism in this
codebase that can actually sustain a multi-exchange discussion — `socraticSessions`/`socraticTurns`
(topic-menu-initiated conversations) — with two hard-end triggers (`/done`, 30-minute inactivity),
one soft checkpoint at 5+ exchanges that does not end the session, and a summary message built from
data those turns already carry. It adds exactly one migration (`socratic_sessions.checkpoint_shown_at`),
one new Cloud Scheduler job, one new bot command, and reuses three things that already exist for an
unrelated purpose (the `"continue"` callback, `completeSocraticSession`, `pendingTurn`). It also
surfaces — deliberately, not silently — that the summary's headline "Gap (most recent)" line has no
data source to read from today, because gap *discovery* (as opposed to gap *coverage*) was never
wired into the Socratic answer path. See Decision 1 and "Flagged for Ilya" below.

## Verified facts (independently re-checked, not just re-quoting PM triage)

- **Dependencies really are closed and built, not just tracker-closed.** #28 (`gh issue view 28
  --json state` → CLOSED) and #24 (CLOSED) both have real code on `main`: `insertDiscoveredGaps`
  (`apps/api/src/gap/gap.repo.ts:115-158`) and the topic-menu nav tree
  (`apps/bot/src/nav/dispatcher.ts`, `menu.ts`) both exist and are exercised. **#43 is the
  exception** — GitHub-closed (`closedAt: 2026-07-31`) but **no `/gaps` command exists anywhere in
  `apps/bot/src`**: `grep -rn "\"gaps\"\|handleGaps"` across the bot source returns nothing, and
  `selectReply` (`apps/bot/src/conversation/reply.ts:30-67`) recognizes exactly `/start`, `/today`,
  `/push`, `/study`, plus two free-text patterns — no `/gaps`. This reproduces, independently, the
  exact "closed-but-unbuilt" tracker-hygiene finding `.planning/33-untriaged-gaps-auto-defer/spec.md`
  already made about this same issue (#43) for a different story. Nothing here is new risk — #33
  already designed around it (its Decision 1) and this plan reuses that precedent (see "The `/gaps`
  link" below).
- **No session-end, checkpoint, or inactivity logic exists anywhere.** `grep -rn
  "checkpoint|inactivity|sessionEnd|/done"` across `apps/bot/src` and `apps/api/src` returns zero
  hits outside this plan's own new code. Confirms PM triage's own targeted-grep finding
  independently.
- **`chat_context`/`socratic_sessions`/`probe_session_questions` all carry session identity, but
  only one substrate can reach "5+ exchanges."** `apps/bot/src/session/chat-context.repo.ts:5-16`
  tracks `sessionId` per chat; `socratic_sessions`/`socratic_turns`
  (`apps/api/src/db/schema.ts:596-617`) track a real ordered turn sequence per session. The other
  candidate — the `/today` daily-push flow (`apps/bot/src/session/pending.repo.ts` +
  `apps/bot/src/conversation/probe-flow.ts`) — is **structurally single-exchange**:
  `submitProbe` (`apps/api/src/probe/probe.service.ts:128-205`) hardcodes `nextQuestion: null` on
  every return (line 203), and `answerPending` (`probe-flow.ts:67-98`) always takes the
  `clearPending` branch on that response, ending the pending Q&A after exactly one round trip
  ("That's it for this topic. Send /today for the next push."). A single-exchange flow cannot
  reach a "5+ exchanges" checkpoint by construction — it terminates at exchange 1 every time. This
  is the single most useful fact in this plan: **it is what defines the scope boundary**, not an
  arbitrary pick. See "Explicitly out of scope."
- **Gap *coverage* happens in the Socratic path; gap *discovery* does not.**
  `answerSocraticSession` (`apps/api/src/socratic/socratic.service.ts:120-218`) calls `persistGaps`
  to flip an existing open gap to `covered` (line 181) but never calls `insertDiscoveredGaps`. Every
  Socratic turn is built from a gap that already exists (`makeTurnForGap` ←
  `nextGapToProbe(gaps, depth)`, `socratic.service.ts:264-277`) — the conversation works through
  known-open gaps, it does not create new ones. `insertDiscoveredGaps` is called from exactly two
  places, both outside this plan's scope: `probe.service.ts:184` (the `/today` pending flow) and
  `gap-mastery.repo.ts:168` (the MCQ quiz/`probeSessions` flow). Compounding this: `SocraticDegree`
  (`packages/shared/src/socratic.ts:3-7`) is `"correct" | "slightly_wrong" | "mostly_wrong"` — there
  is no "explicit admission" value for a Socratic answer to hook a discovery call onto, unlike the
  free-text `probe.service.ts` path, which asks its evaluator to return `newGaps` directly
  (`evaluateAnswer`, `probe.service.ts:306-355`). This has a direct, material consequence for the
  summary — see Decision 1.
- **`gaps` has no `createdAt`/`sessionId` column** (confirmed independently — `schema.ts:469-502`
  lists every column on `gaps`; neither exists). PM's triage note anticipated needing this migration.
  **That note is correct for the `/today`-pending-flow reading of "session" and does not apply to
  the Socratic-session reading this plan adopts** — under this plan's scope, nothing writes gap
  discovery with a session id to stamp, so adding the column now would be dead schema. See Decision 1.
- **`chat_context.updated_at` is not a valid last-activity signal for inactivity detection.**
  `setNavCurriculum` (`chat-context.repo.ts:80-96`) bumps `updatedAt` on menu browsing with no
  exchange happening (e.g. paging through subjects/curricula while a Socratic session sits idle in
  the background) — using it would let unrelated navigation postpone the 30-minute inactivity clock
  indefinitely. See Decision 3 for the actual signal used instead.
- **The `"continue"` callback and `pendingTurn` already do exactly what a "Continue now" tap needs.**
  `onContinue` (`apps/bot/src/nav/dispatcher.ts:250-269`), reachable via the existing
  `buildCallback("continue")` / `PREFIX_TO_KIND["cont"]` (`nav/callback.ts:3,29`), already re-enters
  a Socratic session via `startSocratic` → `startSocraticSession({ topicId })` with no `regenerate`
  flag → `getActiveSocraticSessionRow` → `pendingTurn(active.id)` → returns the **already-generated,
  not-yet-shown** pending turn's full prompt (`sessionDto(active, "active", pending)`,
  `socratic.service.ts:70-77`). This is reused as-is for the checkpoint's "Continue now" button —
  no new endpoint, no new callback kind. See Decision 2.
- **Issue's own format example uses a depth label (`"architect"`) that does not exist in the actual
  enum.** `depthLevelSchema` (`packages/shared/src/depth.ts:3`) is
  `["awareness", "working", "deep"]`. The summary renders the real `rowDepth(topicRow)` value, not
  the issue's illustrative label — flagged as a minor spec-vs-code drift, not a design question.

## Decision 1 — "Session" = a `socraticSessions` row; the pending/probe push flow is out of scope

**Why Socratic, not the daily push.** #27's opening scenario ("a 10-minute … discussion") and its
own acceptance criteria ("5+ exchanges," "the entire session thread," "soft checkpoint … does not
close the session") describe a sustained back-and-forth with real turn count and real session
identity. Only `socraticSessions`/`socraticTurns` has both. The `/today` pending flow is single-shot
by construction (verified above) and cannot reach exchange 5 — there is no session there to end,
checkpoint, or summarize. #25's own dependency line ("The soft checkpoint at 5+ exchanges (#27)")
only makes sense against a substrate that can reach 5+ exchanges in the first place.

**The real cost of this reading, disclosed, not hidden: the "Gap (most recent)" line has nothing to
read.** #28's own issue body is explicit that gap creation is triggered *exclusively* by two signals
— a Fail tap or an explicit written admission ("I don't know" or equivalent) — evaluated
semantically, specifically so the AI is never the authority on what counts as a gap. Under this
plan's scope, the Socratic answer path never calls that machinery (verified above: no
`insertDiscoveredGaps` call, no admission-shaped `SocraticDegree` value to hook one onto). The
consequence, stated plainly: **every Socratic session summary this story ships will render "Solid
session — no new gaps logged," every time**, because there is currently no way for a Socratic
session to discover a gap, only to cover one. The "Gap (most recent)" line, the "Gaps logged:"
counter, and "See all gaps from this session" are all downstream of that same empty set.

**What this plan does about it: nothing that fakes the trigger.** Two tempting workarounds were
considered and rejected:
1. *Redefine "gap logged" to mean "a turn that didn't advance" (i.e., reuse `action !==
   "advance"` on existing turns).* Rejected — this quietly converts #28's explicit-consent,
   user-is-the-authority design principle (a struggling turn is Socratic fodder, not an admission)
   into an AI-graded signal, exactly the thing #28's own body says the product must not do. It would
   also make "Gaps logged" mean something different from what #28 built for the quiz/push paths,
   producing two incompatible notions of "gap" in the same product.
2. *Build the missing Socratic-path discovery mechanism as part of this story* (a new
   `SocraticDegree` admission value, an evaluator prompt change, wiring `insertDiscoveredGaps` with
   a session id, and the `gaps.sessionId`/`createdAt` migration PM's triage anticipated). Rejected —
   this is a real, separate feature with its own design surface (how does semantic admission
   detection work in a free-text Socratic answer, distinct from the MCQ/quiz path's mechanism?),
   out of proportion to what #27 itself asks for (session-end mechanics and a checkpoint), and not
   what the two questions this plan was asked to resolve are about.

**What this plan builds instead:** the summary mechanism is built fully generically — a "solid
concepts" list (real, sourced from `socraticTurns` today, see Decision 4) and a "gaps this session"
list (currently always empty, sourced from a query this plan does *not* add schema for). The
zero-gap fallback copy ("Solid session — no new gaps logged") is exactly what #27's own acceptance
criteria already specify for this case, so the current always-empty state renders correctly, not
brokenly. The moment a future story wires real gap discovery into the Socratic path (see "Flagged
for Ilya"), the same summary code lights up with zero further changes here — the same "build the
mechanism, don't fake the trigger" reasoning `.planning/33-untriaged-gaps-auto-defer/spec.md`'s
Decision 1 used for its own `/gaps`-dependency problem.

**No `gaps.sessionId`/`gaps.createdAt` migration in this story.** PM's triage note ("the `gaps`
table … will need one or the other added via a normal migration") is a correct read of #28's issue
body taken literally, but nothing in this plan's scope would ever write those columns — adding them
now is premature, unused schema. This plan's only migration is on `socratic_sessions` (Decision 2).

### Flagged for Ilya (non-blocking, but material to what "done" means here)

This is not a request to redesign anything now — the recommended-default rule applies and this plan
proceeds — but it changes what "#27 ships" means in practice, so it belongs in front of you rather
than buried in a follow-ups list: **as scoped, this story ships session-end mechanics and a working
checkpoint, but the summary's headline gap-and-progress payload will show "no new gaps" on every
single session until a follow-up wires gap discovery into the Socratic path.** If that's an
acceptable v1 (mechanism now, real content later) say nothing and this plan proceeds as written. If
the gap line needs to be real before this ships to be worth shipping, that's a second story, sized
roughly: one new `SocraticDegree` value or a parallel semantic-admission check, one evaluator prompt
change, one `insertDiscoveredGaps` call site in `socratic.service.ts` threaded with a session id, and
the `gaps.sessionId`/`createdAt` migration PM already anticipated.

## Decision 2 — Soft checkpoint at 5+ exchanges (designed for #25 to extend)

**Trigger and one-time guard.** New nullable column `socratic_sessions.checkpoint_shown_at`
(`timestamptz`). Inside `answerSocraticSession` (`socratic.service.ts`), immediately after
`recordTurnAnswer` and before deciding `next`/`status`:

```ts
// Count of turns in THIS session that have actually been answered — the
// just-recorded turn included, since recordTurnAnswer already ran above.
// listTurnRows is already called earlier in this function for priorTurns;
// reuse rather than re-query.
const answeredCount = (await listTurnRows(session.id)).filter((t) => t.answeredAt).length;
const checkpointReached =
  session.checkpointShownAt === null && answeredCount >= SOFT_CHECKPOINT_THRESHOLD;

if (checkpointReached) {
  await markCheckpointShown(session.id, now); // one conditional UPDATE, WHERE checkpoint_shown_at IS NULL
}
```

`SOFT_CHECKPOINT_THRESHOLD = 5`, matching the issue's literal number — no scaling logic, no
per-depth variant (nothing in #27 or #25 asks for one).

**The session does not end.** `next` is still generated eagerly exactly as today (no restructuring
of `answerSocraticSession`'s existing eager-generation shape — see "Easiest things to get wrong").
The response DTO (`AnswerSocraticResult`) gains one field: `checkpointReached: boolean`. `status`
stays `"active"`; nothing about session completion changes on this path.

**Bot rendering.** `answerSocratic` (`apps/bot/src/socratic/socratic-flow.ts:49-77`) branches on
`result.checkpointReached`: when true, it sends the checkpoint summary (new formatter, reusing the
same session-summary data shape as the hard-end summary — see Decision 4 — but without marking the
session completed) with an inline keyboard built by a new, small, reusable function:

```ts
// apps/bot/src/socratic/session-checkpoint-view.ts
export function buildCheckpointKeyboard(isIntensityMode = false): InlineKeyboard {
  const buttons = [{ text: "📚 Continue now", callback_data: buildCallback("continue") }];

  // #25's extension point: intensity mode adds a second button here without
  // touching anything above. NOT built in this story — isIntensityMode is
  // always false today, so only one button ever renders, and the branch
  // below is dead code until #25 lands. `"done"` is NOT a real CallbackKind
  // today (nav/callback.ts:1-20 has no such member/prefix) — #25 is
  // responsible for adding that callback kind together with its own
  // "Save for next session" handler, exactly as it is responsible for the
  // isIntensityMode flag's real source. This story does not add a dead
  // callback kind on spec — the snippet below is illustrative of the shape
  // #25 fills in, not code this story ships.
  if (isIntensityMode) {
    buttons.push({ text: "⏭ Save for next session", callback_data: buildCallback("done") /* #25 adds this kind */ });
  }

  return chunkButtons(buttons, 2);
}
```

Chat context updates exactly as it does on a normal (non-checkpoint) turn —
`currentItemId: result.next.id`, mode stays `"socratic"`, `sessionId` unchanged. Nothing about
context shape changes for the checkpoint case; only which text/keyboard gets sent differs.

**"Continue now" needs zero new backend work.** `buildCallback("continue")` is the *exact* existing
callback (`nav/callback.ts:3,29`) already wired to `onContinue`
(`dispatcher.ts:138,250-269`), which already re-enters via `startSocratic` →
`startSocraticSession({ topicId })` → returns the pending turn's prompt via the `pendingTurn`
branch (verified above) and calls `editMessageText(chatId, messageId, …)` to render it. The
`messageId` `onContinue` edits is the callback query's **own** message id — Telegram supplies
`callback_query.message.message_id` directly on every callback, which `handleCallback` already
threads through to `onContinue` today for the existing main-menu "Continue" button
(`dispatcher.ts:54-138`) — so tapping "Continue now" on the checkpoint message edits *that*
checkpoint message into the next question in place. No lookup through `chat_context.messageId` is
needed or correct here: that field still holds whatever earlier menu message `startSocratic` last
wrote it from, and must NOT be overwritten with the checkpoint message's id — doing so would make a
later, unrelated menu-edit path edit the wrong message. This plan adds no new callback kind and no
new endpoint for this button — it is a straight reuse of an existing, already-tested navigation path
for a new trigger point, matching this project's own precedent of designing "for reuse across
contexts" (`gap-triage-view.ts:6-10`'s explicit comment about #27 and #43 both being expected to
call into #29's shared module — same idea, opposite direction here).

**"One soft checkpoint per session thread."** Enforced entirely by the `checkpoint_shown_at IS NULL`
guard — once stamped, `answeredCount >= 5` on exchange 6, 7, 8… never re-triggers it for the
lifetime of this session row. A brand-new session (new topic, new `sessionId`) starts the count over,
which is correct — "per session thread" is exactly what the column scopes it to.

## Decision 3 — Hard end #1: `/done`

New `ReplyDecision` kind in `apps/bot/src/conversation/reply.ts`:

```ts
if (command === "/done") return { kind: "done" };
```

added alongside the existing `/start`/`/today`/`/study` checks (`reply.ts:38-46`), same shape.
`webhook.handler.ts` gains an `onDone?: (chatId: number, context: ChatContextLike) => Promise<void>`
dep, dispatched only when `context?.mode === "socratic"` — outside an active Socratic session,
`/done` has nothing to end, so it falls through to the existing decline/`DECLINE_REPLY` path
unchanged (mirrors how `onSocraticText`/`onQuizText` are already conditionally wired on mode).

`onDone` calls into the same "finalize and summarize" path the inactivity sweep uses (Decision 5) —
one shared function, two triggers, so there is exactly one place that decides what a hard-end summary
looks like and exactly one place that flips a session to completed.

## Decision 4 — Session summary content

New pure builder, `apps/api/src/socratic/session-summary.ts` (co-located with the rest of the
socratic feature, not a generic cross-cutting module — nothing else needs this shape today):

```ts
export interface SocraticSessionSummary {
  topicTitle: string;
  depth: DepthLevel;
  solidConcepts: string[];       // dedup, in turn order, action === "advance"
  mostRecentGap: { gapId: string; label: string } | null;  // always null today — see Decision 1
  gapsLoggedCount: number;       // always 0 today — see Decision 1
  crossCuttingConcerns: string[]; // always [] today — depends on discovered gaps' `concern`
  exchangeCount: number;         // answered turns in this session
  topicMaturity: number;         // existing gapMaturity(gaps, depth), unchanged
}

export function buildSessionSummary(
  turns: SocraticTurnRow[],
  topicRow: TopicRow,
  gaps: Gap[],
): SocraticSessionSummary {
  const answered = turns.filter((t) => t.answeredAt);
  const solidConcepts = [...new Set(
    answered.filter((t) => t.action === "advance").map((t) => t.conceptLabel),
  )];

  return {
    topicTitle: topicRow.title,
    depth: rowDepth(topicRow),
    solidConcepts,
    mostRecentGap: null,      // no discovery source in this session's data (Decision 1)
    gapsLoggedCount: 0,
    crossCuttingConcerns: [],
    exchangeCount: answered.length,
    topicMaturity: gapMaturity(gaps, rowDepth(topicRow)),
  };
}
```

`solidConcepts` is real and buildable today with zero schema changes — `socraticTurns` already
carries `sessionId`, `conceptLabel`, and `action`, and is already queried in full via
`listTurnRows(sessionId)` (`socratic.repo.ts:49-57`). The three gap-shaped fields are structurally
constant at their empty value (Decision 1) but are real fields on a real type, not omitted — so a
future story that wires discovery only needs to populate them, not touch every call site that reads
this DTO.

**Format.** The bot-side formatter (`apps/bot/src/socratic/session-summary-view.ts`) renders exactly
the issue's spec'd copy:

```
Session summary
Tool: {topicTitle} | Depth: {depth}

Solid understanding: {solidConcepts.join(", ")}
Solid session — no new gaps logged.

[📚 Continue now]  ← soft checkpoint only
[⏭ Save for next session]  ← hard end only (marks completed)
```

with the real (spec'd) gap-shown branch implemented and ready, gated behind
`summary.mostRecentGap !== null` — so it activates automatically once a future story populates it,
same reasoning as `gap-triage-view.ts`'s `/gaps`-ready-but-unwired labels (Decision 1's cross-ref).
No topic-menu keyboard is appended in this story — #24 exists, but wiring its keyboard onto this
specific message is a small, separate, clearly-bounded follow-up (see todo.md), not built here to
keep this plan's diff to the two things it was asked to design.

**Minimum-exchange guard.** `exchangeCount === 0` (session created, zero turns ever answered —
possible if `/done` arrives before the first answer, or the inactivity sweep fires on a
just-created, never-touched session): no summary is produced. This mirrors #27's own "minimum: a
session needs at least 1 exchange" rule and #26's silence-handling carve-out (referenced directly in
#27's body) — `/done`/the sweep still complete the session (nothing should stay "active" forever)
but send no message.

## Decision 5 — Hard end #2: 30-minute inactivity sweep

**Last-activity signal.** Not `chat_context.updated_at` (verified unreliable above — polluted by
menu navigation). Instead: the currently-pending (unanswered) turn's `createdAt` — the moment the
last question was actually put in front of the user, which is what they've gone silent against:

```ts
// apps/api/src/socratic/session-summary.ts
export function lastActivityAt(pending: SocraticTurnRow | null, turns: SocraticTurnRow[]): Date {
  if (pending) return pending.createdAt;

  // Backstop: answerSocraticSession can leave BOTH `next` and the covered
  // gap null when the turn's own gap row was deleted concurrently (see
  // .planning/gap-mastery-cascade-delete/) — status stays "active" with no
  // pending turn at all. Falls back to the most recently answered turn's
  // own answeredAt so idle detection still has a signal in that edge case.
  const lastAnswered = turns.filter((t) => t.answeredAt).at(-1);
  return lastAnswered?.answeredAt ?? turns[0]!.createdAt;
}
```

**New API endpoint.** `POST /socratic-sessions/:id/check-idle` (bot-called only, not user-facing):
reads the session, its turns, and `lastActivityAt`; if `now - lastActivityAt < 30min`, returns
`{ idle: false }` and does nothing. If idle, attempts the same conditional
`status='active' → 'completed'` transition `/done` uses (Decision 6's CAS guard) and, only if it
won the race, returns `{ idle: true, summary: SocraticSessionSummary }`.

**New bot endpoint**, mirroring `gapResurfaceJob`'s exact shape (`apps/bot/src/server.ts:59-78`):
bearer-checked against `TELEGRAM_WEBHOOK_SECRET`, fire-and-forget 200-then-work.
`POST /session-idle-sweep`:

```ts
if (req.method === "POST" && req.url === "/session-idle-sweep") {
  if (req.headers.authorization !== `Bearer ${env.TELEGRAM_WEBHOOK_SECRET}`) { ...401... }
  res.writeHead(200); res.end();

  void getChatContext(env.OWNER_TELEGRAM_CHAT_ID)
    .then((ctx) => {
      if (!ctx || ctx.mode !== "socratic" || !ctx.sessionId) return;
      return checkSessionIdle(ctx.sessionId); // API call above
    })
    .then((result) => {
      if (result?.idle) {
        return sendMessage(env.OWNER_TELEGRAM_CHAT_ID, formatSessionSummary(result.summary))
          .then(() => clearChatContext(env.OWNER_TELEGRAM_CHAT_ID));
      }
    })
    .catch((err) => log.error({ err }, "session_idle_sweep_failed"));

  return;
}
```

Single-owner-chat architecture (`env.OWNER_TELEGRAM_CHAT_ID` — this is a personal single-user bot,
confirmed by every existing scheduled job addressing exactly one chat id) makes every sweep
invocation one cheap `chat_context` row read, no table scan, regardless of cadence.

**New Cloud Scheduler job**, `infra/index.ts`, mirroring `gapResurfaceJob`'s exact block
(`infra/index.ts:313-336`) — same `TELEGRAM_WEBHOOK_SECRET` bearer, same `httpTarget.uri` on
`botDomain`, same `dependsOn`:

```ts
const sessionIdleSweepSchedule = config.get("sessionIdleSweepSchedule") ?? "*/5 * * * *";
const sessionIdleSweepTimeZone = config.get("sessionIdleSweepTimeZone") ?? "Europe/Warsaw";
// sessionIdleSweepJob (issue #27) — the only sub-daily scheduled job in this
// repo. 5-minute cadence against a 30-minute threshold: up to ~5 minutes of
// lag on the inactivity boundary, same disclosed-lag shape as #33's sweep
// (spec.md "up to one sweep interval"), just a tighter interval because
// inactivity detection needs to be closer to real-time than a daily
// auto-defer check. Cost: 288 invocations/day vs. 1/day for every existing
// job (dailyPushJob, gapResurfaceJob, docScanJob) — each invocation is one
// chat_context row read for a single-owner bot (see server.ts's
// OWNER_TELEGRAM_CHAT_ID), not a table scan, so the marginal DB/compute cost
// is negligible; the marginal cost that IS real is 288 scheduler-job
// executions/day against Cloud Scheduler's own free/paid tier, worth a
// one-line note to Ilya if that tier has a job-count ceiling.
const sessionIdleSweepJob = new gcp.cloudscheduler.Job(
  "session-idle-sweep",
  {
    project: projectId,
    region,
    name: "post-anki-session-idle-sweep",
    schedule: sessionIdleSweepSchedule,
    timeZone: sessionIdleSweepTimeZone,
    attemptDeadline: "60s",
    httpTarget: {
      httpMethod: "POST",
      uri: pulumi.interpolate`https://${botDomain}/session-idle-sweep`,
      headers: telegramWebhookSecret
        ? { Authorization: pulumi.interpolate`Bearer ${telegramWebhookSecret}` }
        : undefined,
    },
  },
  { dependsOn: [botService, ...enabledApis] },
);
```

## Decision 6 — Race/idempotency guard shared by both hard-end triggers

`completeSocraticSession` (`socratic.repo.ts:99-107`) changes from an unconditional `UPDATE` to a
conditional one, returning the affected row:

```ts
export async function completeSocraticSession(
  id: string,
  now: string,
): Promise<SocraticSessionRow | null> {
  const rows = await getDb()
    .update(socraticSessions)
    .set({ status: "completed", completedAt: new Date(now) })
    .where(and(eq(socraticSessions.id, id), eq(socraticSessions.status, "active")))
    .returning();

  return rows[0] ?? null;
}
```

matching the compare-and-swap shape already used elsewhere in this codebase
(`tryClaimReplenish`/`probe-session.service.ts`'s replenish-lock pattern) rather than adding a
separate `summarySentAt` guard column. Whichever caller — `/done`, or the sweep, if both race —
actually performs the `active → completed` transition is the one that sends the summary message; the
loser sees `null` and sends nothing. This one change is shared by both Decision 3 and Decision 5; no
duplicate locking logic in either call site. The one existing caller of `completeSocraticSession`
that expects the natural-completion path (`openNextConcept` returning null — "all gaps covered")
still works unchanged: it already only fires when the session is genuinely active, so the new
`WHERE status='active'` clause never rejects it.

## Architecture

### Business logic changes

- Tapping a topic from the menu and having a real back-and-forth discussion now has a defined end:
  either the user says `/done`, or 30 minutes of silence closes it automatically — neither leaves
  the bot silently waiting forever with no feedback.
- After 5 exchanges in one discussion, the user sees a checkpoint — what they've shown solid
  understanding of so far — with the option to keep going in the exact same conversation, not a
  forced stop.
- At the real end of a discussion (by either trigger), the user sees what they demonstrated well.
  The gap side of that summary is present in the message shape today but will show "no new gaps
  logged" until a follow-up story wires gap discovery into this conversation type (Decision 1,
  flagged above) — this is a disclosed limitation of what ships now, not silently broken.
- The daily `/today` push and MCQ quiz practice are untouched — neither has a "session" in the sense
  this story defines one, and neither gains checkpoint/end behavior.

### Architectural changes

- `socratic_sessions` gains one column (`checkpoint_shown_at`), via a normal Drizzle migration
  generated at implementation time (see todo.md's sequencing note on migration numbering).
- `apps/api/src/socratic/socratic.service.ts` gains the checkpoint check inside
  `answerSocraticSession`, and a new `checkSessionIdle` entry point backing the new
  `POST /socratic-sessions/:id/check-idle` route; `socratic.repo.ts`'s `completeSocraticSession`
  becomes conditional (Decision 6).
- New `apps/api/src/socratic/session-summary.ts` (pure functions: `buildSessionSummary`,
  `lastActivityAt`) — no new module boundary beyond the existing `socratic/` feature folder.
- `apps/bot/src/conversation/reply.ts` gains the `/done` command; `webhook.handler.ts` gains the
  conditionally-dispatched `onDone` hook, mirroring `onSocraticText`'s existing conditional-dispatch
  shape exactly.
- New `apps/bot/src/socratic/session-summary-view.ts` (formatter) and
  `apps/bot/src/socratic/session-checkpoint-view.ts` (keyboard builder, `isIntensityMode` extension
  point for #25) — new files in the existing `socratic/` bot folder, not a new top-level module.
- `apps/bot/src/server.ts` gains one new bearer-checked, fire-and-forget scheduled endpoint
  (`POST /session-idle-sweep`), mirroring `/gap-resurface`'s exact shape.
- `infra/index.ts` gains one new Cloud Scheduler job (`sessionIdleSweepJob`) at 5-minute cadence —
  the first sub-daily job in this repo's infra; every other scheduled job here is daily or weekly.
- No changes to `probeSessions`/`probe-session.service.ts` (MCQ quiz), `pending.repo.ts`/
  `probe-flow.ts` (the `/today` push), or anything cards-related
  (`apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`, `apps/api/src/topic/topic.repo.ts`,
  `packages/shared/src/cards.ts`) — confirmed via `git status` that none of those files are touched
  by this plan, and none of this plan's own files overlap the uncommitted cards WIP.

## Quality gates

1. `npx tsc --noEmit` clean across `apps/api`, `apps/bot`, `packages/shared`.
2. `npx vitest run` green — new coverage for `session-summary.ts` (pure), the checkpoint-trigger
   branch in `socratic.service.test.ts`, `completeSocraticSession`'s CAS behavior, `reply.ts`'s new
   `/done` case, and the two new bot-side view/keyboard files.
3. `npm run test:integration -w @post-anki/api` — new paired integration test proving the race guard
   (two concurrent `check-idle`/`/done`-equivalent calls against the same idle session; exactly one
   summary send), needs `npm run e2e:db:up` first.
4. No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s verified finding,
   still true) — the typecheck gate is the lint gate.
5. `pulumi preview` (or equivalent dry-run) on the `infra/index.ts` change, since this adds a new
   billed GCP resource — not part of the app's own test suite but worth naming as its own gate.

## Explicitly out of scope

- Any change to the `/today` daily-push/pending flow (`pending.repo.ts`, `probe-flow.ts`,
  `probe.service.ts`) — structurally single-exchange today; making it multi-turn so it could have a
  "session" in this story's sense is a distinct, unscoped redesign of #19/#23's territory, not this
  story's job.
- Any change to MCQ quiz/`probeSessions` (`probe-session.service.ts`, `apps/bot/src/quiz/`) — has
  its own completion concept (`total`/`answered`) already; #27's checkpoint/end vocabulary was never
  asked to apply there.
- Wiring real gap *discovery* into the Socratic answer path (new `SocraticDegree` admission value,
  evaluator prompt change, `insertDiscoveredGaps` call site, `gaps.sessionId`/`createdAt` migration)
  — Decision 1's "Flagged for Ilya." Real, sizable, separate.
- Building `/gaps` or any part of #43 — same reasoning `.planning/33-untriaged-gaps-auto-defer/spec.md`
  Decision 1 already used for this exact dependency. The "See all gaps" link/count stays unrendered.
- Appending #24's topic-menu keyboard to the summary message — small, real, separate follow-up
  (todo.md), not required to satisfy either of the two things this plan was asked to design.
- #25's own topic-steering logic, intensity mode, and the second checkpoint button it implies — the
  checkpoint keyboard builder takes the extension point (`isIntensityMode`) but always renders the
  single-button case today; #25 implements the flag's real source and the second button.
- Any change to `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`,
  `apps/api/src/topic/topic.repo.ts`, `packages/shared/src/cards.ts`, or any other file carrying
  uncommitted cards/newcomer-onboarding WIP — not touched by any file in this plan (verified via
  `git status`), and not this plan's to resolve if it were.
