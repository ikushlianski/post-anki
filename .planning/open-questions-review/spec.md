---
type: spec
branch: open-questions-review
task: Capture open questions raised mid-study and periodically resurface unanswered ones for review
complexity: medium
state: confirmed
updated: 2026-08-13
---
<!-- Consistency gate: PASS (9 applicable checks; architecture/baml/research checks N/A — no
     architecture.md/baml-scenarios.md/research.md in this folder) — promoted from draft to
     confirmed 2026-08-13. One gap found and fixed before promotion: missing Derivers table (see
     "Decisions made autonomously" item 9). -->
# Spec: Open questions review (issue #87)

## Verification against PM triage (facts, not assumed)

**Fact** — `question-feedback-memory` is genuinely shipped and genuinely reusable as a UI/API
shape, not just a planning doc: `apps/api/src/db/schema.ts:426` (`studyItemFeedback` table),
`apps/api/src/feedback/feedback.repo.ts`, `apps/api/src/feedback/feedback.controller.ts`,
`apps/web/src/feedback/item-feedback-buttons.tsx`, wired into
`apps/web/src/curriculum/socratic-chat.tsx:147` and `apps/web/src/curriculum/probe-session-quiz.tsx`.
E2e exists too: `verification-repo/projects/post-anki/post-anki/features/probe/actions/submit-item-feedback.action.ts`
and `.../tests/{quiz-question-feedback,socratic-turn-feedback}/`.

**Fact — PM claim is wrong** — the "capture-inbox structure (exists for issue #78)" does **not**
exist. `gh issue view 78` returns `state: OPEN`, with the checklist items "Store captured items and
run classification end to end" and "Screens for capturing a link, reviewing the recommendation,
answering a nudge" both unchecked. Codebase search (`apps/api/src`, `apps/web/src`, `schema.ts`)
found zero inbox/capture tables, repos, controllers, or components. `.inbox/TODOS.md` (deployment
ops checklist) and `.product/INBOX.md` (a one-line product idea scratch note) are unrelated files
that happen to share the word "inbox" — neither is the pattern the issue references. **Consequence:
this plan builds its own capture surface and review list from scratch; it does not inherit one from
#78.** This does not block #87 (no code dependency is missing, only a documentation pattern the PM
assumed existed) but the PM's implied scope was understated by one full UI surface.

**Fact** — a periodic, no-nagging resurfacing precedent already exists and is reused here:
`apps/web/src/routes/today.tsx:31-50` (`CrossCuttingNudgeBanner`) is a passive, live-computed
banner on the daily-visited `/today` page — no stored "next surface" schedule, no dismiss-tracking
queue, no badge elsewhere (comment at `today.tsx:27-30`: "passive, appear-once banner... no
dismiss-tracking queue... matches silent-on-non-response/no-nagging"). Its backend twin,
`apps/api/src/gap/cross-cutting-nudge.controller.ts`, is explicitly commented "read-only, on-demand
computed view... no new persistence table for 'nudges shown'". This plan's resurfacing logic copies
that shape exactly (see Decision 2 below) rather than the `gap_mastery` sequence-based recycling
mechanism (`apps/api/src/gap/gap-mastery.repo.ts`), which is **not reusable** here — it schedules by
question-sequence-number inside a generated probe-session stream, and an open question is never
served as a generated quiz item, so there is no sequence to count against.

## Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Data model | 1–10 | Migration for `open_questions` table | None | None | N/A |
| 2 — API wiring | 1–4, 6, 7, 9, 10 | `open-questions/open-questions.repo.ts`, `.controller.ts`, 4 routes | None | Phase 1 | Capture write is a single insert, no added latency to quiz/Socratic flows |
| 3 — Capture UX | 1, 2, 4, 10 | None (consumes Phase 2) | `capture-question-button.tsx` wired into `probe-session-quiz.tsx` + `socratic-chat.tsx` | Phase 2 | Popover open/submit feels instant — no LLM call on the write path |
| 4 — Review list + resurfacing | 3, 5, 6, 7, 8, 9 | None (consumes Phase 2) | `routes/open-questions.tsx` (list, answer, dismiss), `OpenQuestionsBanner` in `routes/today.tsx` | Phase 2 | Banner query only ever fetches `status='open'` rows, capped, no N+1 |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `selectBannerQuestions` (`packages/core/src/open-questions/select-banner-questions.ts`, new) | `shown: OpenQuestion[]` (already capped at `limit` by the repo query, oldest-first), `totalOpenCount: number` (a single indexed `count(*) where status='open'`, not a second row-fetch), `limit: number` | `{ shown: OpenQuestion[]; remainingCount: number }` — `remainingCount = max(0, totalOpenCount - shown.length)` | SCENARIO 5, 8 |

Pure, no DB access. The repo layer does the capped fetch (`listOpenQuestions('open', 3)`) and the
cheap count (`countOpenQuestions('open')`); this deriver turns those two numbers into the banner's
"show these, +N more" shape so that arithmetic is unit-tested in business language rather than
embedded in the route handler or the component.

### Files by scenario

| Scenario | Backend files | Frontend files |
|---|---|---|
| SCENARIO 1 (capture from a quiz question) | `apps/api/src/open-questions/open-questions.repo.ts`, `.controller.ts` | `apps/web/src/open-questions/capture-question-button.tsx`, wired into `probe-session-quiz.tsx` |
| SCENARIO 2 (capture from a Socratic turn) | Same repo/controller, `itemType: "socratic_turn"` branch | Same button, wired into `socratic-chat.tsx` |
| SCENARIO 3 (appears in the review list) | `open-questions.repo.ts` — `listOpenQuestions(status)` | `apps/web/src/routes/open-questions.tsx` |
| SCENARIO 4 (empty question text rejected) | `packages/shared/src/open-questions.ts` — `.min(1)` | `capture-question-button.tsx` — disabled submit |
| SCENARIO 5 (surfaces on `/today`) | `open-questions.repo.ts` — `listOpenQuestions('open', 3)` + `countOpenQuestions('open')`, `select-banner-questions.ts` | `apps/web/src/routes/today.tsx` — `OpenQuestionsBanner` |
| SCENARIO 6 (mark answered) | `open-questions.repo.ts` — `resolveOpenQuestion` | `routes/open-questions.tsx` — inline answer textarea + button |
| SCENARIO 7 (dismiss) | Same repo fn, `status: "dismissed"` | Same route — "Not needed" button |
| SCENARIO 8 (banner caps at 3, "+N more" link) | `open-questions.repo.ts` — `LIMIT 3` in the banner query variant, `countOpenQuestions`, `select-banner-questions.ts` | `today.tsx` |
| SCENARIO 9 (empty states) | N/A | `today.tsx`, `routes/open-questions.tsx` |
| SCENARIO 10 (max length 1000 chars) | `packages/shared/src/open-questions.ts` — `.max(1000)` | `capture-question-button.tsx` |

### Files to create

```
packages/shared/src/
  open-questions.ts              — openQuestionSourceTypeSchema ('probe_question'|'socratic_turn'),
                                     openQuestionStatusSchema ('open'|'answered'|'dismissed'),
                                     openQuestionSchema (read shape), captureOpenQuestionInput =
                                     { questionText: z.string().trim().min(1).max(1000) } —
                                     deliberately NOT topicId/sourceItemText: those are resolved
                                     server-side from the source item id in the route path, exactly
                                     like submitItemFeedbackInput's precedent (prevents a spoofed
                                     topic/context on a captured question),
                                     resolveOpenQuestionInput = { status: 'answered'|'dismissed',
                                     answerText: z.string().trim().max(2000).optional() }

packages/core/src/
  open-questions/
    select-banner-questions.ts   — selectBannerQuestions deriver (see Derivers table above),
                                     pure — takes the repo's already-capped rows + a total count,
                                     returns { shown, remainingCount }

apps/api/src/
  shared/study-item.ts           — resolveProbeQuestionItem, resolveSocraticTurnItem, MOVED here
                                     from feedback.controller.ts (currently private to that file)
                                     so this plan's controller can reuse them instead of
                                     duplicating the topic/item-text resolution logic
  open-questions/
    open-questions.repo.ts       — insertOpenQuestion, listOpenQuestions(status, limit?),
                                     countOpenQuestions(status), resolveOpenQuestion
    open-questions.controller.ts — handleCaptureOpenQuestion (resolves source item via
                                     study-item.ts, 404s if missing, then inserts),
                                     handleListOpenQuestions, handleResolveOpenQuestion

apps/web/src/
  open-questions/
    capture-question-button.tsx  — "❓ Ask later" button + popover textarea, mirrors
                                     item-feedback-buttons.tsx's button+popover structure
    open-questions.api.ts        — createServerFn wrappers for the 4 routes
  routes/
    open-questions.tsx           — full review list: open questions oldest-first, grouped by
                                     topic, inline "Answer" (textarea + submit → status=answered)
                                     and "Not needed" (→ status=dismissed) per row; a filter toggle
                                     to view answered/dismissed history
```

### Files to modify

```
apps/api/src/
  db/schema.ts                              — + openQuestions table
  router.ts                                 — + "captureProbeQuestionOpenQuestion",
                                                "captureSocraticTurnOpenQuestion",
                                                "listOpenQuestions", "resolveOpenQuestion" route
                                                names, POST /probe-session-questions/:id/open-questions,
                                                POST /socratic-turns/:id/open-questions,
                                                GET /open-questions, PATCH /open-questions/:id
  server.ts                                 — dispatch the four new route names to
                                                open-questions.controller.ts (mirrors the existing
                                                switch-on-RouteName pattern)
  feedback/feedback.controller.ts           — resolveProbeQuestionItem/resolveSocraticTurnItem
                                                moved out to shared/study-item.ts; this file imports
                                                them back (no behavior change, pure reuse)

apps/web/src/
  curriculum/probe-session-quiz.tsx         — renders CaptureQuestionButton next to
                                                ItemFeedbackButtons, per question
  curriculum/socratic-chat.tsx              — renders CaptureQuestionButton next to
                                                ItemFeedbackButtons, per turn bubble
  routes/today.tsx                          — loader fetches listOpenQuestions({status:'open',
                                                limit:3}) alongside the existing nudges fetch;
                                                renders OpenQuestionsBanner above/below
                                                CrossCuttingNudgeBanner
  routes/__root.tsx                         — adds a permanent "Open questions" nav link
                                                alongside Decide/Admin (added during
                                                implementation, not in the original file list —
                                                needed so the list is reachable even when the
                                                /today banner has 3 or fewer open questions and
                                                never renders a "+N more" link; matches Decision 4's
                                                "standing, revisitable list")
```

### Data model changes

Drizzle-generated migration, one new table:

```
open_questions
  id              text PK
  source_type     text NOT NULL      -- 'probe_question' | 'socratic_turn'
  source_item_id  text NOT NULL      -- FK-by-convention to probe_session_questions.id or socratic_turns.id
  topic_id        text               -- nullable, resolved+denormalized at capture time (mirrors
                                         study_item_feedback.topic_id's nullability — probe_session_questions.topic_id
                                         is itself nullable in schema.ts:372, so this must be too)
  topic_title     text               -- nullable, denormalized snapshot so the review list and
                                         /today banner never need a join to render context, and
                                         still render sensibly if a topic is later deleted/renamed
  question_text   text NOT NULL
  status          text NOT NULL DEFAULT 'open'   -- 'open' | 'answered' | 'dismissed'
  answer_text     text               -- nullable, set only on status='answered'
  created_at      timestamptz NOT NULL DEFAULT now()
  resolved_at     timestamptz         -- nullable, set when status leaves 'open'
```

Index: `(status, created_at)` — both the `/today` banner query and the review list query filter on
`status = 'open'` ordered by `created_at ASC` (oldest-first, so long-standing unanswered questions
surface before ones just captured).

No `next_surface_at` / schedule column — see Decision 2.

### Decisions made autonomously

1. **Capture is anchored to the source item (quiz question or Socratic turn), not directly to
   `topicId`** — mirrors `study_item_feedback`'s exact precedent: the client sends only the
   question text; the server resolves `topicId` and a denormalized `topicTitle` from the source
   item via `resolveProbeQuestionItem`/`resolveSocraticTurnItem` (moved to a shared module so both
   this feature and `feedback.controller.ts` use the same resolvers instead of duplicating them).
   This prevents a client from spoofing which topic a question is "about," identical to why
   feedback resolves `topicId` server-side rather than trusting a client-supplied value.

2. **Resurfacing is a live query, not a stored schedule** — no `next_surface_at` column, no cron,
   no background job. `/today` is itself the app's periodically-visited page (daily push); its
   loader already re-queries live state (`getDailyPush`, `getGapMasteryCrossCuttingNudges`) on every
   visit. Adding `listOpenQuestions({status:'open', limit:3})` to that same loader IS the periodic
   resurfacing — identical in shape to the existing `CrossCuttingNudgeBanner`, whose own code
   comment states the precedent this plan follows: "no dismiss-tracking queue, no badge count
   anywhere else — matches silent on non-response/no-nagging." Building a scheduling column and a
   dispatcher would be new machinery this app has never needed for an analogous "periodically show
   me something I haven't dealt with" feature — the closest existing scheduler
   (`gap-mastery.repo.ts`'s `scheduledForSequence`) is deliberately not reused because it counts
   generated-question sequence position, a concept that doesn't exist for a free-text open
   question that is never served as a quiz item. Verified the "appear-once" language in
   `today.tsx:27-30`'s comment doesn't mean a shown-once-ever suppression: `detectCrossCuttingGaps`
   (`packages/core/src/gap-mastery/cross-cutting-nudge.ts`) has no persistence, no "already shown"
   tracking — it recomputes fresh from current mastery state on every call, so the banner
   re-renders on every `/today` visit for as long as the underlying condition holds. "Periodic"
   here means "recomputed on each visit to the periodically-visited page," identical to precedent,
   not a scheduled one-time-only appearance.

3. **Three-state status (`open` / `answered` / `dismissed`), not a boolean `resolved`** — the
   issue's "Done when" requires the system to let the user "address" an open question, and
   addressing has two genuinely different end states: the user actually answers it (captured as
   `answer_text`, kept as a personal answer-log entry), or decides it's no longer relevant
   (`dismissed`, no answer text). Collapsing both into `resolved: true` would make the review list
   unable to distinguish "I answered this" from "I don't care about this anymore," which matters
   for a personal knowledge log.

4. **Review list is its own route (`/open-questions`), not folded into `/dashboard` or `/today`** —
   `/today` is the *nudge* surface (passive banner, capped at 3, silent-on-non-response); the full
   list — including answered/dismissed history, and the actual answer-writing interaction — needs
   its own dedicated page with its own controls, exactly the same reasoning that gave
   `subject.$subjectId.priority-review.tsx` its own route rather than being folded into
   `/dashboard`.

5. **`capture-question-button.tsx` is a new shared `apps/web/src/open-questions/` component,
   structurally mirroring `item-feedback-buttons.tsx`** (button → popover with a text field → save)
   rather than a bespoke UI — same interaction shape the user already knows from thumbs
   feedback, attached at the exact same two call sites (`probe-session-quiz.tsx`,
   `socratic-chat.tsx`), for the same reason `item-feedback-buttons.tsx` itself was placed there:
   "the item is rendered — mid-answer, post-reveal, or later" with no gating on answered state.

6. **Question text capped at 1000 characters, answer text at 2000** — a mid-study open question is
   a quick capture, not a document; the cap keeps both the review list and any future prompt/digest
   use bounded. Chosen larger than feedback's 500-char comment cap because a genuine question (as
   opposed to a reaction comment) plausibly needs more room to state precisely.

7. **No LLM call anywhere in this feature** — capture, list, and resolve are pure CRUD. The issue's
   "Done when" never asks for classification, routing, or auto-answering; it asks for capture +
   list + periodic resurfacing. Consistent with `question-feedback-memory`'s own explicit
   no-LLM-on-the-write-path decision.

8. **`open_questions.topic_id` is nullable, matching `probe_session_questions.topic_id`'s existing
   nullability** (`schema.ts:372`) rather than assuming every quiz question always has a topic —
   verified in schema rather than assumed. `socratic_sessions.topic_id` (`schema.ts:397`) IS
   `NOT NULL`, so Socratic-sourced open questions will always carry a topic in practice, but the
   column stays nullable to be honest about the quiz-question source path.

9. **Added at consistency-gate time (executor session, not the original planning session)** — the
   original draft had no Derivers table, unlike every other medium+ plan in this repo
   (`separate-progress-overlay-from-structure`, `question-feedback-memory`). The banner's "cap at 3,
   show +N more" arithmetic (SCENARIO 5, 8) is genuine pure business logic that was otherwise going
   to land directly in a route handler or component, violating this repo's layering constitution
   (principle 2: pure computation lives in derivers). Extracted to `selectBannerQuestions` and given
   its own unit tests, exactly as `domainMasteryStatus` and `buildFeedbackDigest` were for their
   respective plans. This is the only content change made to promote this plan past the gate — no
   other section required a fix.

### Implementation order

1. `packages/shared/src/open-questions.ts` — schemas
2. `apps/api/src/db/schema.ts` — add `open_questions`, generate + apply migration
3. `packages/core/src/open-questions/select-banner-questions.ts` — deriver, unit-tested first
4. `apps/api/src/shared/study-item.ts` — extract the two resolvers out of `feedback.controller.ts`
5. `apps/api/src/open-questions/open-questions.repo.ts` — insert/list/count/resolve
6. `apps/api/src/open-questions/open-questions.controller.ts` + `router.ts` + `server.ts` — the four routes
7. `apps/web/src/open-questions/capture-question-button.tsx` + `open-questions.api.ts`
8. Wire capture button into `probe-session-quiz.tsx` and `socratic-chat.tsx`
9. `apps/web/src/routes/open-questions.tsx` — review list, answer/dismiss actions
10. `apps/web/src/routes/today.tsx` — `OpenQuestionsBanner`, loader fetch
11. E2e — see `playwright.md`

### Scope boundary

Out of scope: any LLM classification/routing of captured questions (this is a distinct concern from
the `#78` learning-capture-inbox pattern, which this plan explicitly does not build or depend on —
see verification above); scheduled push notifications/email digests of open questions (the banner
IS the resurfacing mechanism, no external notification channel); editing a question's text after
capture (only its status/answer can change); a topic-scoped or subject-scoped open-questions view
(the review list is global across all topics — matches "a standing, revisitable list" from the
issue body, not a per-topic sub-view); reopening an answered/dismissed question back to `open`.
