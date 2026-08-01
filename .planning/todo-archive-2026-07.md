# Moonshine run — human checklist

Only what you need to do after the code is written. Updated live as units land.
See `LOG.md` for the running progress narrative.

## Goal 1 — Chrome extension note capture — CODE DONE, needs your hands now
Branch `chrome-extension-note-capture`, worktree
`.claude/worktrees/agent-a8fbd0bd564e4afe8`. Not pushed, no PR. 7 commits,
typecheck clean (independently re-verified), `apps/bot` untouched.

- [ ] **Do this first**: `cd apps/extension && npm install && npm run build`,
      then `chrome://extensions` → Developer mode → Load unpacked → select
      `apps/extension/dist`. Highlight text on any page, right-click → "Save
      to post-anki". **This exact flow was never smoke-tested live** —
      `chrome.action.openPopup()` (the context-menu → popup trigger) is
      Chrome-version-sensitive; if it silently fails, the selection still
      saves but no popup appears. If that happens, the fallback is the
      toolbar-icon popup (always works) — but the context-menu path needs a
      real fix if it's broken.
- [ ] Once loaded, copy the extension's ID from `chrome://extensions` and set
      `EXTENSION_ID` in `apps/api/.env` locally so CORS allows it. **Do NOT**
      wire it into `.github/workflows/deploy.yml` yet as-is — an empty
      `PROD_EXTENSION_ID` would crash the production API on next deploy (full
      explanation + two fix options in
      `.planning/chrome-extension-note-capture/todo.md`).
- [ ] Generate a real extension token from admin-settings → Extension Access,
      paste it into the extension's options page.
- [ ] Provide `PROD_DATABASE_URL` (Neon project "cool-night" — GitHub Actions
      secret is write-only, can't be read back) to seed the Webdev hierarchy
      into production. Local dev DB is already seeded and idempotency-tested.
- [ ] Review the worktree diff before merging.

## Goal 2 — Telegram quiz/Socratic selection
**Finding: already fully built** (commit 6ccfb76, before tonight's run) — no
code was written for this goal. Full plan/audit at
`.planning/telegram-quiz-socratic-selection/`.
- [ ] Activate the bot: run the one-time Telegram `setWebhook` with
      `PROD_TELEGRAM_WEBHOOK_SECRET` (already known from earlier project
      notes as the only pending step — `apps/bot/scripts/set-webhook.ts`).
- [ ] Sanity-check one interpretive call: mode selection (quiz vs Socratic) is
      currently **automatic**, chosen server-side by topic status — not a
      button you pick. If you actually wanted an explicit user-facing chooser
      instead, that's a small real gap (one callback + one dispatcher
      branch), not yet built. If automatic is fine, this goal is fully done.

## Goal 3 — use-case study mode — CODE DONE, needs your hands and judgment
Branch `worktree-agent-a94726c1157d3ae22`, worktree
`.claude/worktrees/agent-a94726c1157d3ae22`. Not pushed, no PR. 9 commits
(merge of main + migration-regen + derivers + migration + api-pipeline +
web-ui + bot-command + docs + one retry-research bug fix found during final
review). Typecheck clean (independently re-verified in all 4 workspaces) and
full test suites green. Scope-boundary diff against the merge base is 0
lines for `probe-session`/`socratic`/`quiz`/`nav/dispatcher.ts`/
`chat-context.repo.ts` — independently re-confirmed.

What it is, in one paragraph: name a technology (e.g. "Temporal") from the
web app's new "🔎 Study a technology" button, or trigger it via the new
`/study <name>` bot command; the system runs a two-pass web-research +
AI-synthesis pipeline to propose a knowledge map organized into
Basic/Medium/Advanced modules. Reviewing that map, picking the one
topic/module you actually want to study right now (everything else starts
unselected), and confirming all happen on the **web app only** — the bot
only triggers research and tells you to finish on the web. Once confirmed,
it hands off to the fully existing quiz/Socratic mechanics, unchanged.

- [ ] **Apply the migrations before testing anything live**:
      `apps/api/src/db/migrations/0006_add_app_settings.sql` and
      `0007_add_module_level.sql` were generated but never run against a real
      database (no DB available in the build sandbox). Run your normal
      migrate step first, or the first `/study` request fails on
      `column "level" does not exist` — easy to misdiagnose as a research
      problem when it isn't.
- [ ] **Then try this — the one thing typecheck can't verify**: run
      `/study Temporal` (or any real technology) against a live deploy.
      Judge whether one grounding search actually produces a useful
      Basic/Medium/Advanced map, or something too thin — a deliberate
      cost/latency tradeoff (see `.planning/use-case-study-mode/
      architecture.md`'s "Research breadth" section). If thin, the fix is
      scoped to `apps/api/src/curriculum/tech-research-grounding.ts` alone.
- [ ] **Also try this**: force a research curriculum into `failed` (e.g.
      temporarily break `OPENROUTER_API_KEY`) and click "Retry research" on
      the web app — confirm it actually re-runs research rather than
      no-oping. This exact path was broken once already (see the last
      commit) and only exercises at runtime, not in the test suite.
- [ ] Known, accepted limitation (not a gap): reparsing or adding sources to
      a research-origin curriculum routes through the existing
      pasted-material agent and silently drops the level tags. Not fixed —
      see `.planning/use-case-study-mode/todo.md`.
- [ ] Curriculum "origin" (sources vs. research, drives the "🔎 Researched"
      badge) is computed at read time from each curriculum's `sources` rows,
      not stored as a new column — confirmed compatible with the plan's
      constraints via a mid-implementation check, flagging only because it
      reads slightly different from the spec's original file-list wording.
- [ ] Review the worktree diff before merging.

## Full context
`.planning/chrome-extension-note-capture/todo.md` has the plan-level "to
review" items (e.g. whether reusing `confirmCurriculum`+`deleteModule` really
satisfies "AI suggests, I finalize or reject" — resolved with its recommended
default, flagged for a sanity check, not blocking).

## Doc-link technology intake — PLANNED, not yet built
`spec.md` confirmed at `.planning/doc-link-technology-intake/`, no code
written yet, no worktree/branch started. Full plan-level judgment calls are
in that folder's own `todo.md`; only the items needing your actual attention
are below.

- [ ] Nothing decided needs your input before implementation starts — every
      fork in this plan was resolved autonomously (unattended run, per your
      own instruction) with a logged default. Read
      `.planning/doc-link-technology-intake/todo.md`'s "Decisions to make"
      section for the list, purely to sanity-check, not because anything is
      blocked on you.
- [ ] One judgment call worth a deliberate look: the bot's `/study <name>`
      command is left completely untouched by this plan — no URL support, no
      level picker. Only the web app's "Study a technology" form gets the
      new docUrl + llms.txt + level behavior. If you actually wanted the bot
      to gain URL support too, that's additional scope not covered here, not
      an oversight.
- [ ] Once you're ready to build this: run `/implement-ie` (or launch it via
      `/moonshine` alongside other work) against
      `.planning/doc-link-technology-intake/spec.md`. Two real bugs in the
      *already-shipped* use-case-study-mode code were found and folded into
      this plan's fix list rather than filed separately — `retryResearch`
      re-searching by curriculum name instead of the original research
      input, and `deleteResearchSources` only clearing one of two
      research-provenance kinds. Both only matter once the new `llms_txt`
      kind exists, so they were dormant until now, not a regression from
      tonight's planning.
- [ ] Cross-plan note, not coordinated live: a second, parallel plan for
      "topic study experience" (quiz question types, Socratic web chat,
      dedicated topic pages) was also being planned the same night. It
      shouldn't need to touch this plan's two main shared files
      (`curriculum.controller.ts`, `curriculum-parse.orchestrator.ts`), but
      worth a glance when both are ready to merge.

## Topic study experience — PLANNED, not yet built
`spec.md` confirmed at `.planning/topic-study-experience/`, no code written
yet, no worktree/branch started. Full plan-level judgment calls (13 of them)
are in that folder's own `todo.md`; only what needs your actual attention is
below.

What it is, in one paragraph: opening a topic (from the curriculum page)
lands on that topic's existing "probe room" page as before, but its Quiz and
Socratic modes now run on the real, already-proven engines instead of the
old self-graded stand-in — quiz questions get a real `single`/`multi`
("select all that apply") type with options shuffled once and persisted, and
Socratic mode gets an actual web chat (message bubbles, typed answers, a
visible loading indicator) wired to the same session/turn API the Telegram
bot already uses. The Socratic tutor itself changes underneath both surfaces:
it no longer reveals the correct answer after just one more wrong guess
regardless of history — now it only reveals once the learner was at least
once partially correct, otherwise it moves on without revealing; partial-
credit feedback now names specifically what was right vs. wrong; blank/
garbled input re-asks instead of counting as wrong; and the follow-up depth
is capped at 1 extra turn for `awareness`/`working` topics or 2 for `deep`
ones.

- [ ] Nothing decided needs your input before implementation starts — every
      fork in this plan was resolved autonomously (unattended run, per your
      own instruction) with a logged default. Read
      `.planning/topic-study-experience/todo.md`'s "Judgment calls made
      autonomously" section for the full list, purely to sanity-check.
- [ ] One judgment call worth a deliberate look: the existing `/probe/$topicId`
      web route is being upgraded in place (same URL, same header/breadcrumb/
      topic-switcher), not replaced by a new page — its Quick-test and
      Socratic modes currently run on an older, self-graded, non-LLM flow
      that gets swapped out for the real batch-quiz and real Socratic
      engines. `today.tsx`'s separate cross-topic daily-review surface is
      deliberately left on the old flow untouched (different use case, never
      named in scope) — flag if that's not what you meant.
- [ ] Another judgment call worth a look: this plan's design caught and fixed
      a real correctness bug in the *existing* (unmodified) probe-session
      code during self-review — its reveal gate and its "don't re-score an
      already-answered question" check both currently key off the scalar
      `answered_index` column, which the new multi-select column layout
      leaves permanently null for `type: multi` rows. Both checks move to
      key off `outcome` instead (populated for both types). This is called
      out explicitly in `spec.md`'s "Decisions made autonomously" (#15) and
      `architecture.md`'s "Failure modes" section since it's exactly the kind
      of thing easy to silently miss during implementation.
- [ ] Multi-select quiz questions are structurally impossible in the
      Telegram bot (an explicit `allowMultiSelect` opt-in flag, left off for
      the bot's existing call site) — the bot's inline-keyboard UI has no way
      to let someone pick more than one option. Not a gap, a deliberate
      scope boundary — flag if you actually wanted bot multi-select too.
- [ ] Once you're ready to build this: run `/implement-ie` (or launch it via
      `/moonshine`) against `.planning/topic-study-experience/spec.md`.

## Question feedback memory — CODE DONE, needs your hands now
Branch `worktree-agent-a94b06db806364aa4`, worktree
`.claude/worktrees/agent-a94b06db806364aa4`. Not pushed, no PR. 8 commits,
typecheck clean across all 5 workspaces (independently re-verified),
`apps/api`/`packages/core`/`apps/web` vitest suites green, scope-boundary
diff against `main` for `apps/api/src/curriculum`, `socratic.agent.ts`,
`packages/core/src/socratic`, `apps/bot` is 0 lines.

What it is, in one paragraph: thumbs up/down on any quiz question or Socratic turn, with an
optional comment via a popover. A comment on a thumbs-down is treated as already being the
correction note — no summarization LLM call anywhere, at submission or generation time. When a new
quiz batch or Socratic turn is generated for a topic, a short "keep doing this / avoid this" digest
built from recent feedback on that topic is spliced into the existing generation prompt.

- [ ] **Apply the migration before testing anything live**:
      `apps/api/src/db/migrations/0011_shocking_iron_man.sql` was generated
      and already applied to the local dev DB during implementation — still
      needs applying wherever else you run this (staging/prod) before
      deploying the API build that reads/writes `study_item_feedback`.
      **Numbering note**: `0011` was picked against local `main` at
      implementation time; if another parallel unit's migration collides on
      that number by merge time, regenerate against the merged schema (same
      as handled twice already this run) — not a sign of a real conflict.
- [ ] Nothing decided needs your input before implementation — every fork in this plan was
      resolved autonomously with a logged default (see `.planning/question-feedback-memory/todo.md`).
- [ ] One judgment call worth a look: the task listed three things to store ("initial text,
      comment + date, what needs to be corrected") but this plan stores only two columns
      (`item_text` snapshot, `comment` + `created_at`/`updated_at`) — "what needs to be corrected"
      is computed as a view over `(rating: down, comment)` at generation-prompt-build time, not a
      third stored field. Defensible (the task explicitly authorized deciding this) but flagged as
      the one spot where this design reads slightly narrower than the task's literal three-item
      list — sanity-check if you want the raw column to exist too.
- [ ] Another judgment call made during implementation (not in the original plan): a bare re-vote
      (clicking the opposite thumb without touching the comment box) resubmits the currently-held
      comment as a full snapshot — so switching a vote without editing the comment preserves it,
      but explicitly clearing the comment box first and then re-voting will wipe it. This matches
      the plan's "current opinion, not a history" design (decision #7) but is worth a conscious
      glance since it wasn't spelled out at that level of detail in `spec.md`.
- [ ] Two e2e tests were added in `verification-repo`
      (`features/probe/tests/quiz-question-feedback/`,
      `features/probe/tests/socratic-turn-feedback/`) but **deliberately not run** — the shared
      Playwright config always boots `main`, not this worktree, so run them for real after merging
      (`npm run dev:pw` from the source repo, or via `verification-repo`'s own gate).
- [ ] Review the worktree diff before merging.

## Topic ordering & importance — PLANNED, not yet built
`spec.md` confirmed at `.planning/topic-ordering-importance/`, no code written yet, no
worktree/branch started. Full plan-level judgment calls (10 of them) are in that folder's own
`todo.md`; only what needs your actual attention is below.

What it is, in one paragraph: promote/demote buttons on any module or topic (a simple tri-state —
promoted, neutral, demoted, toggleable), plus a separate free-text comment log for personal notes
(deliberately never fed to any AI prompt — that would have duplicated the sibling
question-feedback-memory plan's job for no benefit). Promote/demote reshapes display order —
promoted items float up, demoted items sink, ties broken by today's existing manual order — unless
a curriculum is in "strict document order" mode, a flag `doc-research-architect.agent.ts` now sets
per curriculum at research time for step-by-step tutorial-style docs; in strict mode the vote is
still stored but display order stays doc-faithful until you flip a new per-curriculum toggle off.

- [ ] Nothing decided needs your input before implementation starts — every fork in this plan was
      resolved autonomously (unattended run, per your own instruction) with a logged default.
- [ ] One judgment call worth a look: `strict_order` is one boolean for the whole curriculum, not
      per-module — if a technology's docs are step-by-step for basics but reference-style for
      advanced topics, this plan can't express that split. Judged not worth the added complexity
      for a personal app; flag if that turns out too coarse once you've tried a few doc-research
      curricula.
- [ ] This plan deliberately does NOT touch `recommendedTopicId` (the "what to study next" logic)
      — it only exposes `priority` as a persisted, typed signal. A separate, not-yet-planned
      recommendation-engine unit (personal-learning-map chat + stats dashboard + streaks) is
      expected to read that signal later — nothing to do here, just don't expect promote/demote to
      change "what's recommended next" until that other unit lands.
- [ ] Once you're ready to build this: run `/implement-ie` against
      `.planning/topic-ordering-importance/spec.md`.

## Probe quiz grounded explanations — PLANNED, not yet built
`spec.md` confirmed at `.planning/probe-quiz-grounded-explanations/`, no code written yet, no
worktree/branch started. Full plan-level judgment calls are in that folder's own `todo.md`; only
what needs your actual attention is below.

What it is, in one paragraph: every quiz option gets a short "why this is right/wrong" explanation,
generated and stored alongside the question, shown the moment you submit an answer — not just for
the option you picked. Wrong answers can surface a real, clickable documentation link, but only one
that's independently verified to have actually appeared in the material the question was grounded
in for that curriculum; anything the model invents gets silently dropped rather than shown. The
topic page gains an explicit "Generate Probing Questions" button — nothing generates automatically
on page load — and batch size stops being a flat 12 (topic) / capped-at-20 (module) regardless of
how much there actually is to test.

- [ ] **This plan cannot be built before `topic-study-experience` merges.** It's a strict extension
      of that plan's not-yet-implemented DTO (`type`/`correctAnswerIndexes`/`answeredIndexes`), its
      shuffle-at-insert step, its outcome-gated reveal, and its rewritten `probe-quiz.agent.ts` —
      none of that exists on `main` yet. Implement `topic-study-experience` first, or stack this
      branch directly on top of it. Building this plan against unmodified `main` will silently
      produce the wrong thing.
- [ ] Nothing decided needs your input before implementation starts — every fork in this plan was
      resolved autonomously (unattended run, per your own instruction) with a logged default.
- [ ] One judgment call worth a look: removing the module-scope batch-size cap also uncaps the
      Telegram bot's existing module quiz (bot-only surface today, no module-scope quiz entry point
      exists on the web) — a deliberate, logged side effect of fixing the same flat-cap problem in
      shared generation code, not new bot scope. Flag if you wanted the web and bot batch-size
      behavior to diverge instead.
- [ ] One real limitation worth knowing about, not a bug: the shared grounding text a curriculum's
      quiz is generated from carries no per-source URL markers today (multiple source rows get
      concatenated with no attribution). This plan mitigates it cheaply (each citable URL is paired
      with its source row's title in the prompt) rather than restructuring the shared grounding
      pipeline other features also depend on — for curricula with just one or two sources (the
      common case) this is a non-issue; for ones with many, the model's citation choice is
      best-effort, not per-claim-verified.
- [ ] One additive migration needed (`option_explanations` jsonb column on `probe_session_questions`)
      — generate it only after `topic-study-experience`'s own migration has already landed, as a
      separate follow-up `drizzle-kit generate` pass, not combined with it.
- [ ] Once you're ready to build this: run `/implement-ie` against
      `.planning/probe-quiz-grounded-explanations/spec.md` — after the prerequisite above is met.

## Learning-map sidebar chat — CODE DONE, needs your hands now
`spec.md` at `.planning/learning-map-chat/` implemented on branch
`worktree-agent-a770064e5ca3c9d13` (6 commits), worktree at
`.claude/worktrees/agent-a770064e5ca3c9d13`. Not yet merged to `main` — needs a human (or the
orchestrator) to run the real e2e gate and merge.

What it is, in one paragraph: a persistent chat panel on a topic page, reachable from both Quiz
and Socratic mode, that knows the current topic, this session's exchanges, and a compact summary
of what you've mastered across *every* curriculum — so it can draw comparisons ("you know
Next.js, here's how this compares"). You can jump into it straight from a wrong quiz answer to
ask about that specific question without losing your place. Separately, once you've moved a
curriculum's topic into a Medium or Advanced module, new quiz/Socratic questions for it are
generated with awareness of what was already covered at the Basic level, so they build on it
instead of re-teaching it.

- [x] All 9 scenarios' acceptance boxes ticked with `file:line` citations in the worktree's copy of
      `scenarios.md`. All 5 workspaces typecheck clean; `npx vitest run` green everywhere (180 core +
      89 api + 2 web + 84 bot = 355 tests, bot untouched). Scope-boundary diff against the commit this
      worktree started from for `apps/api/src/socratic`, `probe-session.service.ts`, `apps/bot` is 0
      lines, confirmed by direct `git diff`.
- [ ] One judgment call worth a look: this is a brand-new, separate chat surface — not a reuse of
      `topic-study-experience`'s graded Socratic chat API. Verified that API is turn-graded and
      gap-advancing by design and can't sanely answer arbitrary questions, so a small new
      `apps/api/src/study-chat/` module was built instead. If you actually wanted one unified chat
      instead of two chat surfaces on the same page (quiz/Socratic transcript + this sidebar), that's
      a real redesign, not what's planned here — flag if so.
- [ ] Another judgment call: a wrong quiz/Socratic answer does **not** demote an already-mastered
      concept back to "needs review." Verified the existing gap-tracking already does what you
      described (wrong answers stay in the review pool, right ones count toward mastery) without
      that — adding demotion would be a new forgetting mechanic nobody asked for. Flag if you
      actually want mastery to erode after a later wrong answer.
- [x] This plan modifies `probe-session-quiz.tsx` (the "ask about this wrong answer" trigger) — built
      on top of `topic-study-experience`'s already-merged version, no follow-up diff needed.
- [ ] **Build-order note for the next plan below still stands**: `study-stats-dashboard`'s next-step
      recommender needs this plan's `getLearningMapSnapshots()` function and `LearningMapSnapshot`
      type, both of which now exist in `apps/api/src/curriculum/curriculum.repo.ts` /
      `packages/shared/src/learning-map.ts` — safe to build against now.
- [ ] Added 2 Playwright e2e tests in `verification-repo` (`features/probe/tests/study-chat-sidebar/`,
      `features/probe/tests/study-chat-ask-about-this/`) plus a reusable `sendStudyChatMessage` action
      and a new `study-chat` mock-openrouter responder (the catch-all for a plain-text, no-schema,
      no-web-search agent call). Deliberately **not run** here — the shared Playwright config always
      boots `main`, not this worktree; left for the orchestrator's real gate.
- [ ] Published `docs/architecture/learning-map-chat.md` (`state: shipped`) with a rendered Mermaid
      sequence diagram (`docs/architecture/assets/learning-map-chat.png`).

## Study stats dashboard — CODE DONE, needs your hands now
`spec.md` at `.planning/study-stats-dashboard/` implemented on branch
`worktree-agent-a9f5890442a8e1c68` (7 commits), worktree at
`.claude/worktrees/agent-a9f5890442a8e1c68`. Not yet merged to `main` — needs a human (or the
orchestrator) to run the real e2e gate and merge. This was the last unit of tonight's backlog —
every wave-3/4 plan is now implemented.

What it is, in one paragraph: a new stats page for a curriculum you're studying, showing weak
spots (open gaps) and strong points (mastered topics), plus an on-demand "get recommendations"
action that searches for real reading material and shows it only once you've actually attempted
a couple of topics — no fabricated links, ever. A next-step suggestion appears after finishing a
topic or level: continue the same curriculum at the next level if you've mastered the current one
and a higher tier exists, otherwise it points at your weakest topic elsewhere at a comparable
level. A streak counter (current + longest) lives on the main dashboard, incrementing once per day
you actually answer something.

- [x] All 9 scenarios' acceptance boxes ticked with `file:line` citations in the worktree's copy of
      `scenarios.md`. All 5 workspaces typecheck clean; `npx vitest run` green everywhere (193 core +
      89 api + 2 web + 84 bot = 368 tests, bot untouched). Scope-boundary diff against the commit this
      worktree started from for `curriculum.repo.ts`, `apps/api/src/gap`, `apps/bot` is 0 lines,
      confirmed by direct `git diff`.
- [x] Hard dependency confirmed before writing anything: `learning-map-chat`'s
      `getLearningMapSnapshots()`/`LearningMapSnapshot` existed post-merge; consumed as-is, not
      re-derived.
- [ ] **Real deviation from the plan's literal deriver signature, worth a look**: `spec.md` specified
      `nextStepRecommendation`'s `next_level` output as `{ curriculumId; moduleId; topicId }`. The
      actual `LearningMapModuleSnapshot` type (owned by `learning-map-chat`) carries no `moduleId` —
      only `level`/`progress`/`topics` — and the hard rule was to consume that shape as-is rather than
      extend `curriculum.repo.ts`'s aggregation. Shipped output uses `level` instead of `moduleId`;
      `topicId` alone is enough for the frontend to link to a topic. Flag if you actually need the
      real module id surfaced somewhere this doesn't cover.
- [x] "AI recommendations" here are a separate, topic-level "what to read next" feature reusing
      `probe-grounding.ts`'s existing web-search mechanism (now extracted into a shared `webSearch`
      helper) — not the same thing as `probe-quiz-grounded-explanations`'s per-answer-option
      citations. Built as planned, no shared data between the two.
- [x] Streak trigger is "any graded quiz or Socratic answer, once per calendar day" — built exactly
      as planned, via one additive line each in `probe-session.service.ts`/`socratic.service.ts`
      (confirmed via `git diff`: one import + one call line in each, zero grading-logic changes).
- [x] Two new tables (`topic_recommendations`, `user_streaks`) — Drizzle-generated migration
      applied to local dev Postgres, confirmed present via `psql \dt`. No changes to any existing
      table.
- [ ] Added 2 Playwright e2e tests in `verification-repo` (`features/stats/tests/weak-strong-spots/`,
      `features/stats/tests/streak-banner/`), reusing `features/probe/`'s existing
      `setupConfirmedTopic`/`openTopicQuiz`/`answerSingleSelect` to generate real progress/streak
      data rather than seeded rows. Registered in `docs/runbook.md`'s "What's registered so far".
      Read `mock-openrouter/responses.ts` in full first — the existing `web-grounding` responder
      already matches the new recommendation-generation call (matches on tool presence, not prompt
      text), so **no new responder was added**. Deliberately **not run** here — the shared Playwright
      config always boots `main`, not this worktree; left for the orchestrator's real gate.
- [ ] Published `docs/architecture/study-stats-dashboard.md` (`state: shipped`) with a rendered
      Mermaid sequence diagram (`docs/architecture/assets/study-stats-dashboard.png`).
