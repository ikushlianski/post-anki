---
type: spec
branch: 25-topic-steering
task: "[Story] User steers discussion to any topic mid-session (#25)"
complexity: complex
state: planned
updated: 2026-08-14
verification:
  targetDb: none (no integration-test-worthy race condition new to this story; reuses #27's own)
---

# Plan: User steers discussion to any topic mid-session (#25)

## What this story is, in one paragraph

Today, tapping a different topic from the menu while a Socratic session is active silently
abandons the old session's DB row (`socratic_sessions.status` stays `"active"` forever — nothing
ever completes it) and free-text steering ("let's talk about Lambda") unconditionally hijacks into
curriculum-creation research (`startStudy`) regardless of what's currently running, ignoring the
active session entirely. This plan makes both entry points actually pivot: finalize the old session
through the exact completion path #27 already built (no new backend logic), decide whether to
surface a brief "saving your progress" notice based on how far the old session had gotten, and start
the new topic immediately either way. It also adds a `skip` command (end/decline without starting
anything) and wires the real `CallbackKind` #27 left as an illustrative placeholder for this story's
"Save for next session" checkpoint button — disclosing, not hiding, that the button stays
unreachable until intensity mode (explicitly deferred) ships. No migration, no new infrastructure.

## Verified facts (independently re-checked, not just re-quoting PM triage)

- **#27's finalize path is exactly the mechanism this story needs, with one threshold mismatch to
  design around, not silently paper over.** `completeSessionNow`/`finalizeSession`
  (`apps/api/src/socratic/socratic.service.ts:268-353`) already does the active→completed CAS,
  builds `SocraticSessionSummary` via `buildSessionSummary`, and suppresses the summary only when
  `answered.length === 0` (line 290). #25 needs a 0-**1** vs 2+ split, not 0 vs 1+. `summary` already
  carries `exchangeCount` (`session-summary.ts:35`, schema field `session-summary.ts` /
  `socratic.ts:78`), so the extra threshold can be applied entirely in the bot layer by reading
  `result.summary.exchangeCount` — no change to `finalizeSession`'s own suppression rule, which
  `/done` and the idle sweep keep exactly as #27 shipped it.
- **Menu-tap "pivot" is mechanically already destructive today, just silently.**
  `startTopic`/`startModule` (`apps/bot/src/nav/dispatcher.ts:157-203`) never reads
  `context.mode` before calling `startSocratic`/`startQuiz`, which immediately call
  `setChatContext` and overwrite the chat's single context row. The previous session's
  `socratic_sessions` row is never touched — `status` stays `"active"` indefinitely because nothing
  references its `sessionId` anymore (`session-idle-flow.ts:16-21`'s sweep reads
  `chat_context.sessionId` for the *current* session only, so an abandoned session's id is
  permanently unreachable by the sweep). Confirmed via `getActiveSocraticSessionRow`
  (`socratic.repo.ts:10-25`, orders by `createdAt desc` — a later resume of that same topic would
  find and continue the stale row, not create a fresh one, which is a separate latent oddity this
  story fixes as a side effect of finalizing on pivot).
- **Free-text "let's talk about X" already exists but bypasses mode entirely — it is not a
  building block for #25, it's a conflicting path to route around.**
  `webhook.handler.ts:104-128` dispatches `decision.kind === "study"`/`"continue"` (matched by
  `reply.ts`'s `TALK_ABOUT_PATTERN`/`CONTINUE_PATTERNS`, `reply.ts:17-29`) unconditionally, before
  any context/mode check. `onStudy` → `startStudy` (`conversation/study-flow.ts:15-25`) calls
  `createStudyCurriculum`, which starts AI-driven source research for a **brand-new** curriculum —
  a different feature (tool *registration*) from steering to an **already-registered** topic. Typing
  "let's talk about Lambda" during an active Socratic session today triggers curriculum research and
  leaves the old session dangling; it does not pivot. Confirmed no existing endpoint resolves free
  text to an existing `topicId` (`grep -rn "findTopicByName\|searchTopic\|matchTopic"` across
  `apps/bot/src apps/api/src packages` returns nothing).
- **The shape-gating discipline this story needs already has a precedent in this exact file.**
  `reply.ts:19-24`'s own comment explains why `CONTINUE_PATTERNS`' trailing tool name is capped at
  40 chars and rejects a comma: "a real answer that happens to start with 'let's continue...' and
  then runs on into a full sentence... falls through to 'process' instead of being misread." The
  free-text topic matcher this story adds needs the same discipline for the same reason — a real
  Socratic answer routinely names other topics ("unlike Kubernetes, Lambda keeps the container
  warm").
- **`sendMessageWithKeyboard` already returns a real message id; `sendMessage` does not.**
  `telegram/bot.ts:17-31` — `sendMessage` returns `Promise<void>`, `sendMessageWithKeyboard` returns
  `Promise<number>` (`sent.message_id`). `startSocratic`/`startQuiz` both require a `messageId` to
  edit in place (`socratic-flow.ts:18-24`, `quiz-flow.ts` mirrors this). The free-text pivot path has
  no button-tap message to reuse, unlike the menu-tap path.
- **Gap preservation needs zero new code.** `completeSocraticSession`
  (`socratic.repo.ts:105-116`) only ever updates `socratic_sessions.status`/`completedAt`. Gap rows
  (`gaps` table) are topic-scoped, not session-scoped, and are never touched by session completion —
  confirmed by `finalizeSession`'s own body (`socratic.service.ts:268-304`), which reads gaps
  (`listGapsForTopic`) only to build the summary, never writes them. "Gaps preserved" is a statement
  about what this story must *not* touch, not something it must build.
- **`skip` needs zero new state.** The daily push (`pending.repo.ts` +
  `probe-flow.ts:47-65`) is tracked independently of `chat_context.mode` — `sendTodaysQuestion` calls
  `setPending`, not `setChatContext`. The scheduled push itself (`dailyPushJob`,
  confirmed unconditional in `infra/index.ts`, mirrored by #27/#33's own scheduled-job precedent) has
  no per-day suppression flag anywhere in the schema. "Waits for next scheduled push" requires no
  `skippedToday` column — the next Cloud Scheduler firing is unconditional regardless of what
  happened today.
- **No migration.** `socratic_sessions.checkpoint_shown_at` already exists
  (`apps/api/src/db/schema.ts:606`), shipped by #27 (`77d5abf`, verified ancestor of `HEAD` via
  `git merge-base --is-ancestor`). Every new "kind" this story adds (`CallbackKind`, `ReplyDecision`)
  is a TypeScript union member, not a schema change.
- **No infrastructure change, #40 untouched.** This story adds no scheduled job, no new process, no
  Cloud Scheduler resource, and reuses #27's existing `/session-idle-sweep` job as-is. #40 (PM2 vs
  launchd vs Docker for the Mac Mini, flagged three times in `.planning/THOUGHTS.md` as a genuinely
  unresolved architectural fork) is not touched by anything in this plan's scope — named here so
  its absence from this plan reads as deliberate, not overlooked.
- **Intensity mode and the unregistered-tool registration offer are out of scope**, per PM triage:
  no rigor/intensity concept exists anywhere in the Socratic service (`grep -rn
  "intensity\|rigor"` across `apps/api/src apps/bot/src` returns nothing outside issue text), and
  `/learn` + any tool-registry table do not exist (`selectReply` recognizes exactly `/start`,
  `/today`/`/push`, `/study`, `/done`, plus the two free-text patterns above — no `/learn`; `grep -rn
  "learningTool\|registeredTool"` returns nothing). Both are named in "Explicitly out of scope"
  below and in todo.md's follow-ups, not designed here.

## Decision 1 — One shared finalize-and-notice helper serves both pivot entry points and skip

**Why one function, not three copies of the same split.** The menu-tap pivot, the free-text pivot,
and `skip`-inside-an-active-session all need the identical judgment call: call the existing
finalize path, look at `result.summary?.exchangeCount`, and decide brief-notice vs silent. Building
this three times risks the threshold drifting out of sync between entry points — exactly the kind
of duplication #27's own Decision 3/5 (`"one shared function, two triggers"`) avoided for `/done`
and the sweep.

**New file, `apps/bot/src/socratic/session-pivot-flow.ts`:**

```ts
export interface PivotFinalizeResult {
  notice: string | null; // null = silent switch (0-1 exchanges, or lost the CAS race)
}

export async function finalizeForPivot(
  context: ChatContext,
  newTopicLabel: string,
): Promise<PivotFinalizeResult> {
  if (!context.sessionId) return { notice: null };

  const result = await completeSocraticSessionNow(context.sessionId);

  if (!result.completed || !result.summary || result.summary.exchangeCount < 2) {
    return { notice: null };
  }

  return {
    notice: `Switching to ${newTopicLabel}. Saving your ${result.summary.topicTitle} progress.`,
  };
}
```

`result.completed === false` covers the CAS-race case (spec.md's "Verified facts": the idle sweep
or a concurrent `/done` already won) — pivot proceeds silently, navigation is **never** blocked by a
lost race, matching the issue's own "the user is never blocked by a mandatory summary before
pivoting."

**Menu-tap caller** (`dispatcher.ts`'s `startTopic`/`startModule`, extended, not rewritten):

```ts
if (context?.mode === "socratic" && context.sessionId && isPivot(context, kind, targetTopicId)) {
  const { notice } = await finalizeForPivot(context, label);
  if (notice) await sendMessage(chatId, notice);
}
// ...existing startQuiz/startSocratic call, unchanged
```

where `isPivot` is `kind === "start_module"` (module scope always differs from a topic-scoped
session) or `kind === "start_topic" && context.scopeId !== targetTopicId` (re-tapping the *same*
topic is not steering away — `startSocraticSession` already resumes it correctly with no finalize
needed, see Scenario 2).

**Free-text caller** reuses the identical `finalizeForPivot` — see Decision 2.

**`skip` reuses the same split but never starts a new session** — see Decision 4.

## Decision 2 — Free-text matching: shape-gate first, then a pure word-overlap function, then one I/O call

**The risk this decision closes.** Matching free text against every registered topic title on every
message sent during a Socratic session would (a) run a full `getSubjects` → N×`getCurricula` →
M×`getCurriculumDetail` fan-out on the hot path of *every real answer*, and (b) risk a false-positive
substring match ending a genuine answer mid-session ("unlike Kubernetes, Lambda keeps the container
warm" mentions two topic names while answering a third). Both are closed by the same rule, borrowed
directly from this file's own existing precedent (`reply.ts:19-24`'s `TOOL_TAIL` comment).

**Step 1 — shape gate, pure, no I/O.** New `apps/bot/src/socratic/topic-match.ts`:

```ts
const STEER_SHAPE_MAX_LEN = 40;

export function isSteerShaped(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > STEER_SHAPE_MAX_LEN) return false;
  if (trimmed.includes(",")) return false;
  // Reject sentence-internal punctuation FOLLOWED BY WHITESPACE then more text
  // — a real multi-clause answer, not a short steer phrase. `\s+` (not `\s*`)
  // is deliberate: a dotted product name with no following space ("Node.js",
  // "socket.io") must NOT be rejected just for containing a period.
  if (/[.!?]\s+\S/.test(trimmed)) return false;
  return true;
}
```

A message that fails this gate is **never** checked against topic titles — it goes straight to
`onSocraticText` exactly as today, with zero additional I/O. This is the same shape the codebase
already trusts to distinguish "a short tool name" from "a real sentence" one file over.

**Step 2 — pure word-overlap matcher, unit-testable with no I/O:**

```ts
const STOPWORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "for", "to", "is", "are"]);

function significantWords(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export interface TopicCandidate {
  topicId: string;
  curriculumId: string;
  title: string;
}

export function matchTopicTitle(
  text: string,
  candidates: TopicCandidate[],
): TopicCandidate | null {
  const textWords = new Set(significantWords(text));
  let best: TopicCandidate | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    const titleWords = significantWords(c.title);
    const score = titleWords.filter((w) => textWords.has(w)).length;
    if (score > 0 && (score > bestScore || (score === bestScore && best && c.title.length < best.title.length))) {
      best = c;
      bestScore = score;
    }
  }

  return best;
}
```

Deliberately recall-biased (any shared significant word counts, tie-break toward the more specific
/ shorter title): the issue's own example — typed "lambda cold starts" pivoting to a topic titled
"AWS Lambda" — is not a full-title match, only a partial word overlap ("lambda"). A false negative
here (no match found) is a soft failure: the text falls through and is evaluated as a Socratic
answer, same as it would be with no steering feature at all. A false positive is prevented upstream
by the shape gate (Step 1), not by matcher precision — a prose answer never reaches this function.

**Step 3 — the one I/O call, gated behind Step 1, only when `context.mode === "socratic"`:**

```ts
async function findRegisteredTopic(text: string): Promise<TopicCandidate | null> {
  const subjects = await getSubjects();
  const curriculaBySubject = await Promise.all(subjects.map((s) => getCurricula(s.id)));
  const confirmed = curriculaBySubject.flat().filter((c) => c.status === "confirmed");
  const details = await Promise.all(confirmed.map((c) => getCurriculumDetail(c.id)));
  const candidates: TopicCandidate[] = details.flatMap((d) =>
    d.modules.flatMap((m) =>
      m.topics.filter((t) => t.included).map((t) => ({
        topicId: t.id,
        curriculumId: d.curriculum.id,
        title: t.title,
      })),
    ),
  );

  return matchTopicTitle(text, candidates);
}
```

Same `Promise.all` fan-out shape `nav/menu.ts` and `nav/dispatcher.ts` already use for parallel
curriculum reads (`menu.ts:31-34`) — no new I/O pattern invented, just gated behind the shape check
so it never runs on an ordinary answer.

**Step 4 — ordering against the existing `study`/`continue` dispatch, stated explicitly.**
`webhook.handler.ts:104-128` today dispatches `decision.kind === "study"`/`"continue"` (matched by
`TALK_ABOUT_PATTERN`/`CONTINUE_PATTERNS`) **before** any context/mode check runs — "let's talk about
AWS Lambda" mid-session would hit that branch first and never reach the steer check unless the
ordering is explicit. `handleMessage` is restructured so the context fetch and the steer check both
run first, ahead of the existing `decision.kind` switch:

```ts
const context = deps.getChatContext ? await deps.getChatContext(chatId) : null;

if (context?.mode === "socratic" && deps.onSteer) {
  const steered = await deps.onSteer(chatId, context, message.text ?? "");
  if (steered) return; // matched a registered topic — pivot handled, stop here
}

// ...existing decision.kind switch, completely unchanged below this line —
// study/continue/today/done/process all still run exactly as today when
// onSteer found no match (steered === false) or mode isn't socratic.
```

`onSteer` internally runs the shape gate → matcher → lookup chain and returns `false` immediately
(no I/O beyond the shape check) whenever `isSteerShaped(text)` is `false` or `matchTopicTitle` finds
nothing — so an unmatched steer-shaped phrase, a real Socratic answer, and anything outside an
active session all fall through to the existing switch unchanged (AC 16, 17, 18).

## Decision 3 — Free-text pivot's acknowledgment message doubles as the edit target

**The problem.** `startSocratic(chatId, messageId, topicId, label)` immediately calls
`editMessageText` (`socratic-flow.ts:24`) — it requires an existing message to edit. The free-text
path has no button-tap message to reuse (unlike the menu-tap path, which already has `messageId`
from the callback query).

**The resolution: send the acknowledgment first via `sendMessageWithKeyboard`, reuse its returned
id as the edit target.** No new primitive on `telegram/bot.ts`, no signature change to
`startSocratic`/`startQuiz`:

```ts
const ackId = await sendMessageWithKeyboard(chatId, `Sure — let's talk about ${match.title}.`, []);
// finalizeForPivot's notice (if any) is sent as a separate, earlier message —
// see ordering below.
if (topic.progress.status === "not_started") {
  await startQuiz(chatId, ackId, "topic", match.topicId, match.title, false);
} else {
  await startSocratic(chatId, ackId, match.topicId, match.title);
}
```

`sendMessageWithKeyboard(chatId, text, [])` with an empty `InlineKeyboard` is a normal Telegram call
(an empty `inline_keyboard` array is valid) — no library change needed. Message ordering for the
2+-exchange case: (1) the pivot notice ("Switching to X. Saving your Y progress.") as its own
message, (2) the acknowledgment ("Sure — let's talk about X.") which then gets edited into the first
question in place. For 0-1 exchanges, only (2) is sent, then edited.

## Decision 4 — `skip` reuses the pivot split but never starts a new session

**New `ReplyDecision` kind**, `apps/bot/src/conversation/reply.ts`, same shape as `/done`
(`reply.ts:43`):

```ts
const SKIP_PATTERN = /^skip[\s.!?]*$/i;
// ...inside selectReply, alongside the existing pattern checks:
if (SKIP_PATTERN.test(text)) return { kind: "skip" };
```

**`webhook.handler.ts` gains a conditionally-dispatched `onSkip` dep** — the only new dep this
decision adds (the pending-push case reuses the `flow: FlowDeps` dep `HandlerDeps` already carries,
`probe-flow.ts:9-15`'s `getPending`/`clearPending` — no second new dep) — mirroring `onDone`'s
existing conditional-dispatch shape (`webhook.handler.ts:140-168`) exactly, with an explicit
quiz-mode exclusion so `skip` mid-quiz falls through unchanged:

```ts
if (decision.kind === "skip") {
  if (context?.mode === "quiz") {
    // No special meaning mid-quiz in this story — fall through exactly like
    // today. (Reaches the existing quiz-text handling below, unchanged.)
  } else if (context?.mode === "socratic" && deps.onSkip) {
    await deps.onSkip(chatId, context);
    return;
  } else {
    const pending = await deps.flow.getPending(chatId);
    if (pending) await deps.flow.clearPending(chatId);
    await sendMessage(chatId, "No problem — I'll skip this one.");
    return;
  }
}
```

`onSkip` (bot-side, `session-pivot-flow.ts`) reuses `finalizeForPivot`'s exact split, but the
message copy and the no-new-session rule differ from a pivot: **one** acknowledgment is always sent
— `"No problem — I'll skip this one."` — and when `exchangeCount >= 2`, the save note is appended to
that same message (`"No problem — I'll skip this one. Saved your {topicTitle} progress."`), not sent
as a second message the way the pivot's "Switching to…"/"Sure — let's talk about…" pair is. This
keeps `skip`'s copy visibly distinct from steering's, per the issue body's own explicit "'Skip' is
NOT 'give me a different topic now'." Chat context clears to idle either way; no new session starts
in either branch — this is the line that separates `skip` from a pivot.

**`skip` mid-quiz is explicitly out of scope** — the quiz-mode branch above never calls `onSkip` or
touches `pending`; falls through to the existing quiz-text handling exactly like today, mirroring
the PM's own socratic-only carve for the pivot mechanics (see Decision 6).

## Decision 5 — Wire the real `save_for_next` `CallbackKind` now; the button stays unreachable, disclosed not faked

**`nav/callback.ts` gains one real member and prefix:**

```ts
export type CallbackKind = /* ...existing... */ | "save_for_next" | "noop";
const PREFIX_TO_KIND: Record<string, CallbackKind> = {
  /* ...existing... */
  sv: "save_for_next",
};
```

**`session-checkpoint-view.ts`'s placeholder is replaced:**

```ts
buttons.push({ text: "⏭ Save for next session", callback_data: buildCallback("save_for_next") });
```

**`dispatcher.ts`'s `route()` gains one branch, reusing `endSocratic` exactly as `/done` does —
zero new backend logic:**

```ts
if (kind === "save_for_next") {
  const context = await getChatContext(chatId);
  if (context?.sessionId) await endSocratic(chatId, context);
  await editMessageText(chatId, messageId, "Saved. Send /today or tap a topic to pick up later.");
  return;
}
```

**Disclosed, not hidden: this button never renders in production after this story ships.**
`buildCheckpointKeyboard`'s only caller (`socratic-flow.ts:87`, `answerSocratic`) always passes
`false` — `isIntensityMode` has no real source anywhere in this codebase because intensity mode
itself is explicitly deferred (PM triage, "Explicitly out of scope" below). This story does not
invent a flag source to make the button reachable — that would be building intensity mode's UI
surface without its substance, exactly the "fake the trigger" move #27's own Decision 1 rejected for
the gap-discovery line. What ships: a real, tested `CallbackKind` and handler that correctly ends a
session and preserves gaps, ready the moment a future story supplies the flag — same "build the
mechanism, don't fake the trigger" precedent, applied to the extension point #27 explicitly left for
this story.

## Decision 6 — Scope boundary: pivot/skip mechanics are additive only to `mode === "socratic"`

Every new check this story adds is guarded on `context?.mode === "socratic"`:

- Menu-tap: `startTopic`/`startModule` only run `finalizeForPivot` when the *current* context is
  `"socratic"`. Tapping a topic while idle or mid-quiz behaves byte-for-byte as it does on `main`
  today — no finalize call, no notice, no new I/O.
- Free-text: the shape-gate → matcher → `findRegisteredTopic` chain only runs when
  `context?.mode === "socratic"`. Outside an active session, "let's talk about X"/`continue`-pattern
  text keeps routing through the existing, unmodified `onStudy` path exactly as today —
  registering a genuinely new topic is not something this story touches.
- `skip`: only reuses the pivot-style split inside an active Socratic session; outside one, it only
  ever clears a pending daily-push question (Decision 4) or no-ops.

This mirrors #27's own explicit choice to leave MCQ quiz/`probeSessions` untouched (its own
"Explicitly out of scope") and the PM triage's literal scope carve ("Menu-tap pivot mid-session
(any `start_topic`/`start_module` tap while `chat_context.mode === "socratic"`)"). Quiz-mode
interruption is a different, unscoped problem with its own completion semantics
(`total`/`answered`, not a `socraticSessions` row) — not part of this story.

## Architecture

### Business logic changes

- Tapping any topic or module from the menu while mid-discussion now actually switches — the old
  discussion is properly closed out (not silently orphaned), the user sees a one-line note about
  what was saved when there was real progress to save, and sees nothing when there wasn't.
- Typing a short topic phrase mid-discussion (not a full sentence answer) now does the same thing a
  menu tap does, for any topic already in the user's curricula — no need to navigate back to the
  menu to change subjects.
- Saying "skip" ends whatever's active (a discussion, or today's pending push question) without
  starting anything new and without being scored as a wrong or blank answer — the next scheduled
  push still arrives normally.
- The checkpoint's second button ("Save for next session") is now a real, working action wherever
  it appears — but it does not yet appear anywhere, because nothing in the product sets intensity
  mode on. That gap is disclosed here, not silently left for someone to discover later.

### Architectural changes

- New `apps/bot/src/socratic/session-pivot-flow.ts` (finalize-and-notice logic, shared by both
  pivot entry points and `skip`) and `apps/bot/src/socratic/topic-match.ts` (pure shape-gate +
  word-overlap matcher, separated from its one I/O caller so the matching logic itself needs no
  database or API mocking to test).
- `nav/dispatcher.ts`'s `startTopic`/`startModule` gain a pivot pre-check; `route()` gains one new
  branch (`save_for_next`) reusing `socratic-flow.ts`'s existing `endSocratic`.
- `nav/callback.ts` gains one `CallbackKind` member and prefix — no schema, no new endpoint.
- `conversation/reply.ts` gains the `skip` pattern; `webhook.handler.ts` gains two new conditionally
  dispatched deps, `onSkip` and `onSteer` (the latter runs ahead of the existing `study`/`continue`
  dispatch — Decision 2, Step 4), both mirroring `onDone`/`onSocraticText`'s existing
  conditional-dispatch shape — no unconditional new top-level command, and no other new dep beyond
  these two (the pending-push skip case reuses the already-present `flow: FlowDeps`).
- `apps/bot/src/session/chat-context.repo.ts`'s `setNavCurriculum` is reused (not modified) when a
  free-text pivot resolves to a topic in a different curriculum than the one currently browsed.
- No changes to `apps/api/src/socratic/socratic.service.ts`'s `finalizeSession`/`completeSessionNow`
  threshold, `session-summary.ts`, `session-idle-flow.ts`, or any backend endpoint — every backend
  code path #27 shipped is reused exactly as-is, verbatim, from the bot layer.
- No changes to `probeSessions`/`probe-session.service.ts` (MCQ quiz), `apps/web`, `infra/index.ts`,
  or anything cards-related (`apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`,
  `apps/api/src/topic/topic.repo.ts`, `packages/shared/src/cards.ts`) — confirmed via `git status`
  that none of those files are touched by this plan, matching #27's own precedent of naming this
  explicitly rather than leaving it implicit.

## Quality gates

1. `npx tsc --noEmit` clean across `apps/api`, `apps/bot`, `packages/shared`.
2. `npx vitest run` green — new coverage for `topic-match.ts` (pure, no I/O — the shape gate and
   the word-overlap scorer each get direct unit tests, including the false-positive-prevention case
   from Decision 2), `session-pivot-flow.ts` (finalize split, both entry-point callers),
   `reply.ts`'s new `skip` case, `dispatcher.test.ts`'s new pivot branches, and
   `webhook.handler.test.ts`'s new conditional-dispatch cases for `onSkip` and the steer
   interception.
3. No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s verified finding,
   still true) — the typecheck gate is the lint gate.
4. No integration test suite addition — this story adds no new race condition beyond the one #27
   already covers (`session-completion-race.integration.test.ts`); `finalizeForPivot`/`finalizeForSkip`
   call the same already-raced `completeSocraticSessionNow` endpoint and handle `completed: false`
   as a normal, expected outcome (Decision 1), not a new concurrency surface needing its own
   Postgres-backed proof.
5. No `pulumi preview` gate — no infrastructure change (Decision 7 / Verified facts).

## Explicitly out of scope

- **Intensity mode in every form the issue describes** — the session-scoped flag itself, the second
  checkpoint button's *reachability* (the button and its handler are wired per Decision 5, but stay
  dead until a flag source exists), "harder"/"challenge me" detection, and "return to normal
  calibration after an intensity session." No rigor/intensity concept exists anywhere in the
  Socratic service today (verified above) — this is a second feature riding on this issue's body,
  per PM triage, not a byproduct of anything this story builds.
- **The unregistered-tool registration offer** ("Drizzle isn't in your learning tools yet —
  `/learn drizzle [url]`"). No `/learn` command or tool-registry table exists; the real registration
  path is `/study <name>` against the subject/curriculum model, a vocabulary mismatch from an
  earlier design phase of this issue's own text (PM triage). When free-text steering matches no
  registered topic, this story's behavior is unchanged from today's `onStudy` path — it does not
  offer registration, it does not block, it just keeps doing what `main` already does.
- **Quiz-mode ("`probeSessions`") interruption.** Tapping a topic or typing free text while
  `chat_context.mode === "quiz"` is untouched — no finalize call, no pivot notice, no `skip`
  handling. Quiz has its own completion concept (`total`/`answered`) that #27's and this story's
  session vocabulary was never asked to apply to (mirrors #27's own explicit carve).
- **Appending #24's topic-menu keyboard to the pivot/skip acknowledgment messages** — same small,
  separable follow-up #27's own todo.md already deferred for its summary message; not required by
  any AC this story is asked to satisfy.
- **#40 (PM2 vs launchd vs Docker for the Mac Mini)** — genuinely unresolved, flagged three times in
  `.planning/THOUGHTS.md`, and not touched by anything in this plan's scope (no new process, no new
  scheduled job).
- **Any change to `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`,
  `apps/api/src/topic/topic.repo.ts`, `packages/shared/src/cards.ts`**, or any other file carrying
  uncommitted cards/newcomer-onboarding WIP — not touched by any file in this plan (verified via
  `git status`), and not this plan's to resolve.
