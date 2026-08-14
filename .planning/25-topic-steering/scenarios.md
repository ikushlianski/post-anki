---
type: scenarios
branch: 25-topic-steering
task: "[Story] User steers discussion to any topic mid-session (#25)"
state: planned
updated: 2026-08-14
---

# Scenarios: User steers discussion to any topic mid-session (#25)

**31 acceptance criteria.** No migration and no new infrastructure (unlike #27's one column + one
scheduled job, or #33's two columns + a scheduled job), but two independent pivot entry points
(menu tap, free text) that must reach the same finalize behavior, a new pure matcher with its own
false-positive-prevention requirement, and a `skip` command — landing at the same count as #27's 31
despite the lighter backend footprint, because the free-text path alone carries a shape gate, a
scorer, an I/O lookup, and a messageId resolution as four separately-provable pieces.

No Playwright plan — every surface here is the Telegram bot (message text, inline keyboards,
free-text routing); this project's verification-repo integration targets `apps/web`, and nothing in
this story touches `apps/web`.

## Master acceptance criteria list (31 items, each independently walkable)

**Menu-tap pivot (`dispatcher.ts`)**

1. Tapping `start_topic` for a topic id different from the active Socratic session's `scopeId`,
   while `chat_context.mode === "socratic"`, calls `finalizeForPivot` before starting the new topic.
2. Tapping `start_topic` for the **same** topic id as the active session's `scopeId` does not call
   `finalizeForPivot` — `startSocraticSession` already resumes the existing active row correctly
   with no finalize needed.
3. Tapping `start_module` while `chat_context.mode === "socratic"` always calls `finalizeForPivot`
   — a module-scoped start always differs from a topic-scoped session by construction.
4. `finalizeForPivot` calls the existing `completeSocraticSessionNow` API endpoint — the same
   finalize/CAS/summary-build path `/done` and the idle sweep already use (#27) — with zero new
   backend code and zero change to `finalizeSession`'s own suppression threshold.
5. When the old session's `summary.exchangeCount >= 2`, a notice ("Switching to {new}. Saving your
   {old topicTitle} progress.") is sent as a standalone message **before** the tapped message is
   edited into the new topic's content.
6. When `exchangeCount` is 0 or 1, or `result.summary` is `null` (the `exchangeCount === 0`
   suppression case `finalizeSession` already implements), no notice is sent — silent switch.
7. When `result.completed === false` (the pivot's finalize call lost the CAS race — e.g. the idle
   sweep already completed the session concurrently), no notice is sent and the pivot proceeds to
   start the new topic anyway — navigation is never blocked by a lost race.
8. After the pivot pre-check (notice or silence), the existing `startTopic`/`startModule` body
   (quiz-vs-Socratic branch on `topic.progress.status`, `editMessageText` into the tapped message)
   runs completely unchanged from `main` today.
9. Tapping `start_topic`/`start_module` while `chat_context.mode` is `"idle"` or `"quiz"` behaves
   byte-for-byte as it does on `main` today — no `finalizeForPivot` call, no notice, no new I/O.

**Free-text pivot (`topic-match.ts`, `webhook.handler.ts`)**

10. `isSteerShaped(text)` is `true` for a trimmed message ≤40 chars with no comma and no
    sentence-internal punctuation followed by more text (mirrors `reply.ts:19-24`'s existing
    `TOOL_TAIL` discipline) — a steer-shaped message arriving while `mode === "socratic"` is checked
    against registered topic titles before being treated as a Socratic answer.
11. A non-steer-shaped message (long, contains a comma, or has sentence-internal punctuation) is
    never passed to the matcher and triggers zero `getSubjects`/`getCurricula`/`getCurriculumDetail`
    calls — it goes straight to `onSocraticText` exactly as today.
12. `matchTopicTitle(text, candidates)` is a pure function with no I/O: it scores each candidate by
    count of shared significant (≥3-char, non-stopword) words and returns the highest-scoring
    candidate, tie-broken toward the shorter/more specific title; returns `null` when no candidate
    shares any significant word.
13. When a steer-shaped message matches a registered topic, the old session (if any, and if
    `mode === "socratic"`) is finalized using the exact same `finalizeForPivot` helper the menu-tap
    path uses — one shared function, two entry points, no duplicated threshold logic.
14. The bot sends "Sure — let's talk about {title}." via `sendMessageWithKeyboard(chatId, text, [])`
    and reuses the returned message id as the edit target for `startSocratic`/`startQuiz` — no new
    primitive added to `telegram/bot.ts`, no signature change to `startSocratic`/`startQuiz`.
15. When the matched topic's `curriculumId` differs from `chat_context.navCurriculumId`,
    `setNavCurriculum` is called so the menu reflects the correct curriculum on next open.
16. When a steer-shaped message matches no registered topic, behavior is unchanged from `main`
    today: it falls through to the pre-existing `study`/`continue` pattern handling
    (`onStudy`/curriculum research) if it matches those patterns, or to `onSocraticText` as a normal
    Socratic answer otherwise.
17. The steer-matching chain (shape gate → matcher → lookup) runs only when
    `chat_context.mode === "socratic"` — outside an active session, `study`/`continue`-pattern text
    and plain free text route exactly as they do on `main` today, with zero new checks.
18. A sentence-shaped real Socratic answer that happens to name a registered topic (e.g., "unlike
    Kubernetes, Lambda keeps the container warm because...") is never intercepted — proven directly
    by `isSteerShaped` rejecting it (AC 10/11) before `matchTopicTitle` is ever called.

**`skip`**

19. `selectReply` recognizes a bare `"skip"` (case-insensitive, optional trailing `.`/`!`/`?`) as
    `{ kind: "skip" }`, same shape as the existing `/done` case.
20. `skip` while `chat_context.mode === "socratic"` with an active session applies the identical
    2+/0-1 finalize split as the pivot path (via `finalizeForSkip`, sharing `finalizeForPivot`'s
    core): one acknowledgment is always sent ("No problem — I'll skip this one."), with the save
    note appended to that same message only when `exchangeCount >= 2` ("...Saved your {topicTitle}
    progress."). Chat context clears to idle and **no** new session starts either way — the defining
    difference from a topic pivot.
21. `skip` while idle with a pending daily-push question (`pending.repo.ts`) clears the pending Q&A
    via `clearPending` — with no answer submitted/evaluated — and acknowledges "No problem — I'll
    skip this one."
22. `skip` while idle with nothing pending and no active session still sends the same
    acknowledgment and performs no writes — not an error, not a crash.
23. `skip` while `chat_context.mode === "quiz"` falls through to the existing quiz-text handling
    unchanged — `skip` has no special meaning mid-quiz in this story, mirroring the socratic-only
    scope boundary for the pivot mechanics (AC 9, AC 17).
24. The `onSkip` dep is optional; its absence (existing `HandlerDeps` test construction without it)
    falls back to `DECLINE_REPLY`, mirroring every other optional-dep fallback already in
    `webhook.handler.ts` (`onStudy`, `onDone`).

**Checkpoint `CallbackKind` wiring (#27's extension point)**

25. `nav/callback.ts` gains a real `"save_for_next"` `CallbackKind` and prefix (`sv`), and
    `session-checkpoint-view.ts`'s `isIntensityMode` `true`-branch calls
    `buildCallback("save_for_next")` instead of the `"noop"` placeholder.
26. Tapping "Save for next session" ends the session via the exact same finalize+summary+clear path
    `/done`'s `endSocratic` (`socratic-flow.ts:100-112`) already implements — one new `route()`
    branch in `dispatcher.ts`, zero new backend logic, zero new API endpoint.
27. `buildCheckpointKeyboard`'s only caller (`socratic-flow.ts:87`, inside `answerSocratic`) still
    passes `isIntensityMode: false` unconditionally after this story ships — the button is real and
    tested but unreachable in production, disclosed explicitly in spec.md and todo.md rather than
    made reachable via an invented flag source.

**Cross-cutting invariants (things this story must NOT change)**

28. Gap rows are untouched by any `finalizeForPivot`/`finalizeForSkip` call — proven by asserting
    `listGapsForTopic`'s result for the topic is identical before and after a pivot/skip finalize
    (mirrors #27's own "gaps preserved" framing, now exercised from the pivot/skip paths too).
29. `finalizeSession`'s own suppression threshold (`answered.length === 0`,
    `socratic.service.ts:288-292`) is unchanged by this story — `/done` and the idle sweep keep
    #27's exact behavior; the 0-1-vs-2+ split lives only in `finalizeForPivot`/`finalizeForSkip`,
    proven by `socratic.service.test.ts`'s existing #27 test cases passing unmodified.
30. No database migration is added or needed — `checkpointShownAt` already exists
    (`schema.ts:606`); proven by `git diff` on `apps/api/src/db/migrations/` being empty for this
    story's changes.
31. No infrastructure change is added — no new Cloud Scheduler job, no new bot endpoint, no
    `infra/index.ts` diff; proven by `git diff` on `infra/index.ts` being empty for this story's
    changes.

---

## SCENARIO 1 — Tapping a different topic mid-session with real progress pivots and saves

**Given** an active Socratic session on "TanStack Start" with 6 answered turns (past the checkpoint,
still active), and the user is browsing the menu
**When** they tap "AWS Lambda" from the topic list
**Then** the bot sends "Switching to AWS Lambda. Saving your TanStack Start progress." as its own
message, the TanStack Start session is marked completed (gaps untouched), and the tapped message is
then edited into the AWS Lambda topic's first question (or quiz start, if not yet started) exactly
as a normal topic tap would render it.

Covers AC 1, 4, 5, 8, 28, 29.
Proof: `session-pivot-flow.test.ts` (new — `finalizeForPivot`'s notice branch), `dispatcher.test.ts`
(new pivot pre-check branch), `socratic.service.test.ts` (existing #27 suppression-threshold tests
passing unmodified, proving AC 29).

## SCENARIO 2 — Tapping a different topic with almost no progress pivots silently; re-tapping the current topic just resumes

**Given (a)** an active Socratic session on "TanStack Start" with 1 answered turn
**When** the user taps "AWS Lambda"
**Then** no notice is sent; the session is still marked completed server-side; the tapped message
is edited straight into AWS Lambda's first question.

**Given (b)** the same active session on "TanStack Start" (`scopeId` = topic X)
**When** the user taps "TanStack Start" again from the menu (same topic id)
**Then** `finalizeForPivot` is never called; `startSocraticSession({ topicId: X })` resumes the
existing active session and returns its already-pending turn, exactly as `main` behaves today.

Covers AC 2, 6.
Proof: `session-pivot-flow.test.ts` (silent-switch branch, `exchangeCount === 1` and
`summary === null` cases), `dispatcher.test.ts` (same-topic-id no-op case).

## SCENARIO 3 — Starting a whole module mid-session always finalizes the topic session first

**Given** an active Socratic session on a topic inside "Cloud Fundamentals" module
**When** the user taps "▶️ Start whole module (quiz)" for a different module
**Then** `finalizeForPivot` runs (module scope always differs from the active topic-scoped session),
applying the same 2+/0-1 notice rule, before the module quiz starts.

Covers AC 3.
Proof: `dispatcher.test.ts` (new `start_module`-while-socratic case).

## SCENARIO 4 — A pivot loses the race to the idle sweep — navigation is never blocked

**Given** an active Socratic session that has been idle 31+ minutes (the 5-minute Cloud Scheduler
sweep is about to fire or just fired)
**When** the user taps a different topic at nearly the same instant
**Then** `completeSocraticSessionNow` returns `{ completed: false }` (the sweep already won the CAS);
`finalizeForPivot` returns `{ notice: null }`; the pivot proceeds silently and the new topic starts
normally — the user is never shown an error and never blocked.

Covers AC 7.
Proof: `session-pivot-flow.test.ts` (mocked `completeSocraticSessionNow` returning
`completed: false`), reusing #27's own `completeSocraticSession`/CAS semantics without a new
integration test (spec.md Quality Gate 4 — this is not a new concurrency surface).

## SCENARIO 5 — Menu navigation outside an active Socratic session is untouched

**Given** `chat_context.mode` is `"idle"` (browsing the menu with nothing active) or `"quiz"` (an
MCQ quiz in progress)
**When** the user taps any topic or module button
**Then** `finalizeForPivot` is never called, no notice is ever sent, and `startTopic`/`startModule`
behave identically to `main` today — proven by the existing `dispatcher.test.ts` suite for these
modes passing unmodified.

Covers AC 9.
Proof: `dispatcher.test.ts` (existing idle/quiz-mode tests, no changes required — new pivot logic
is additive and gated).

## SCENARIO 6 — A short free-text phrase mid-session pivots exactly like a menu tap

**Given** an active Socratic session on "TanStack Start" with 3 answered turns, and the user has
a topic titled "AWS Lambda" registered in a different curriculum than the one currently browsed
**When** the user types "lambda cold starts" (steer-shaped: 18 chars, no comma)
**Then** `isSteerShaped` passes, `matchTopicTitle` scores "AWS Lambda" via the shared word "lambda"
and returns it, `finalizeForPivot` runs the 0-1/2+ split for the TanStack Start session, the bot
sends "Sure — let's talk about AWS Lambda." via `sendMessageWithKeyboard` and edits that message
into the first Lambda question using the returned id, and `setNavCurriculum` updates the browsed
curriculum to Lambda's.

Covers AC 10, 12, 13, 14, 15.
Proof: `topic-match.test.ts` (new — pure shape-gate and scorer unit tests, including the exact
"lambda cold starts" → "AWS Lambda" case from the issue body), `webhook.handler.test.ts` (new steer
interception case), `session-pivot-flow.test.ts` (shared finalize reuse).

## SCENARIO 7 — A real Socratic answer is never mistaken for steering

**Given** the same active session, mid-question
**When** the user answers with "Unlike Kubernetes, Lambda keeps the container warm between
invocations if traffic is frequent enough, which avoids the cold-start penalty on repeat calls."
(a real, sentence-shaped answer that happens to name two other topics)
**Then** `isSteerShaped` returns `false` (contains commas, multiple sentences) before
`matchTopicTitle` is ever called — zero `getSubjects`/`getCurricula`/`getCurriculumDetail` calls are
made — and the text reaches `onSocraticText` and is evaluated as a normal answer, exactly as `main`
behaves today.

Covers AC 11, 18.
Proof: `topic-match.test.ts` (`isSteerShaped` rejecting this exact sentence),
`webhook.handler.test.ts` (asserting the steer-check short-circuits before any I/O deps are
invoked for a non-steer-shaped message).

## SCENARIO 8 — Free text that matches nothing, or arrives outside an active session, is untouched

**Given (a)** an active Socratic session, and the user types a steer-shaped phrase that matches no
registered topic (e.g. "quantum stuff")
**Then** it falls through to the existing `study`/`continue`-pattern handling if it matches those
regexes, or to `onSocraticText` as a normal (if nonsensical-to-the-AI) answer otherwise — identical
to `main`'s behavior today, since nothing intercepted it.

**Given (b)** `chat_context.mode` is `"idle"` or `"quiz"`, and the user types "let's talk about AWS
Lambda" (a registered topic)
**Then** the steer-matching chain never runs (gated on `mode === "socratic"`); the existing
`TALK_ABOUT_PATTERN` → `onStudy` path fires exactly as it does on `main` today, starting curriculum
research for "AWS Lambda" as a **new** study item, not a pivot to the existing registered topic —
unchanged, not this story's problem to fix.

Covers AC 16, 17.
Proof: `webhook.handler.test.ts` (both cases — no-match fallthrough during an active session;
mode-gated no-op outside one), `study-flow.test.ts` (existing, unmodified — proving (b) is a
pre-existing path this story deliberately leaves alone).

## SCENARIO 9 — `skip` ends a session, clears a pending push, or does nothing — never starts a new session

**Given (a)** an active Socratic session with 4 answered turns
**When** the user types "skip"
**Then** `finalizeForSkip` applies the same exchange-count split (here, ≥2, so the single
acknowledgment reads "No problem — I'll skip this one. Saved your {topicTitle} progress." — one
message, not the pivot's two-message pair, per spec.md Decision 4), chat context clears to idle,
and **no** new session starts — this is the behavioral line that separates `skip` from a pivot.

**Given (b)** `chat_context.mode` is `"idle"` with a pending daily-push question
**When** the user types "skip"
**Then** `clearPending` runs (no answer is submitted or evaluated) and the bot replies "No problem —
I'll skip this one."

**Given (c)** `chat_context.mode` is `"idle"` with nothing pending and no active session
**When** the user types "skip"
**Then** the same acknowledgment is sent and no writes occur — not an error.

**Given (d)** `chat_context.mode` is `"quiz"`
**When** the user types "skip"
**Then** it falls through to the existing quiz-text handling unchanged — no special `skip` meaning
mid-quiz.

**Given (e)** a `HandlerDeps` instance with no `onSkip` provided (mirrors existing test construction
for `onStudy`/`onDone`)
**When** `skip` is dispatched
**Then** `DECLINE_REPLY` is sent — the existing optional-dep fallback pattern, unmodified.

Covers AC 19, 20, 21, 22, 23, 24.
Proof: `reply.test.ts` (new `skip` pattern case), `webhook.handler.test.ts` (all five dispatch
branches above), `session-pivot-flow.test.ts` (`finalizeForSkip`'s split and fixed copy).

## SCENARIO 10 — The checkpoint's second button, once reachable, ends the session like `/done` — but stays unreachable until intensity mode ships

**Given** a hypothetical caller passes `isIntensityMode: true` to `buildCheckpointKeyboard` (unit
test only — no such caller exists in this story's own code)
**When** the resulting "⏭ Save for next session" button is tapped
**Then** `route()`'s new `save_for_next` branch calls `endSocratic` (the exact `/done` path),
completing the session, sending the full summary, and clearing chat context — proven directly, with
no new backend logic.

**Given** the actual shipped state of this story
**When** any real session reaches the soft checkpoint
**Then** `buildCheckpointKeyboard` is still only ever called with `isIntensityMode: false`
(`socratic-flow.ts:87`, unmodified by this story) — the button and its handler are real and tested,
but never rendered to a user, because intensity mode (the only thing that would ever pass `true`)
is explicitly out of scope.

Covers AC 25, 26, 27.
Proof: `session-checkpoint-view.test.ts` (existing #27 test file, extended with the real-callback
assertion replacing the `"noop"` one), `dispatcher.test.ts` (new `save_for_next` branch, reusing
`endSocratic`'s existing test doubles), `socratic-flow.test.ts` (existing #27 test asserting
`buildCheckpointKeyboard(false)` is the only call site, unmodified — proving AC 27 directly).

## SCENARIO 11 — No schema, no infrastructure, gaps and #27's own paths untouched

**Given** this story's full diff
**When** reviewed against `apps/api/src/db/migrations/`, `infra/index.ts`, and
`apps/api/src/socratic/socratic.service.ts`'s `finalizeSession`/`completeSessionNow`
**Then** none of those are touched — every new behavior lives in the bot layer
(`apps/bot/src/socratic/`, `apps/bot/src/nav/`, `apps/bot/src/conversation/reply.ts`,
`apps/bot/src/telegram/webhook.handler.ts`) plus two small, additive TypeScript union members
(`CallbackKind`, `ReplyDecision`) — reusing #27's backend exactly as shipped.

Covers AC 30, 31 (and restates AC 28, 29 as the diff-level proof of the same invariants).
Proof: `git diff --stat` against `apps/api/src/db/migrations/`, `infra/index.ts`, and
`apps/api/src/socratic/socratic.service.ts` showing zero changes to those paths at implementation
time.
