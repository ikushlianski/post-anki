---
type: todo
branch: 25-topic-steering
task: "[Story] User steers discussion to any topic mid-session (#25)"
state: open
updated: 2026-08-14
---

# Todo: User steers discussion to any topic mid-session (#25)

## Decisions made autonomously

Nothing blocking implementation. Seven forks had a safe, reversible, pattern-following default;
logged one line each below for `ORCHESTRATOR-MEETING-NOTES.md`, full reasoning in spec.md's
per-decision sections. None touches auth, money, or schema.

1. One shared `finalizeForPivot`/`finalizeForSkip` helper serves both pivot entry points (menu tap,
   free text) and `skip` — the 0-1-vs-2+ exchange split is applied once, in the bot layer, by
   reading `result.summary.exchangeCount`, never by changing `finalizeSession`'s own
   `answered.length === 0` threshold on the backend (spec.md Decision 1).
2. Free-text matching is gated by message shape (≤40 chars, no comma, no sentence-internal
   punctuation) before any curriculum-tree fetch or word-overlap scoring — directly reusing
   `reply.ts:19-24`'s own existing `TOOL_TAIL` discipline rather than inventing a new rule (spec.md
   Decision 2).
3. The topic matcher scores by shared significant-word count (recall-biased, tie-break toward the
   shorter/more specific title) rather than exact-title or substring-anywhere matching — a false
   negative just falls through to normal answer handling; a false positive is prevented upstream by
   the shape gate, not by matcher precision (spec.md Decision 2).
4. The free-text pivot's acknowledgment message is sent via `sendMessageWithKeyboard(..., [])` to
   obtain a real message id to edit into the new topic's first question — no new primitive added to
   `telegram/bot.ts`, no signature change to `startSocratic`/`startQuiz` (spec.md Decision 3).
5. `skip` is a new `ReplyDecision` kind (bare "skip", case-insensitive) reusing the pivot split's
   finalize logic but never starting a new session — the acknowledgment copy ("No problem — I'll
   skip this one.") is fixed and distinct from the pivot's "Switching to…" copy, since skip is
   explicitly not steering (spec.md Decision 4).
6. `nav/callback.ts` gains a real `"save_for_next"` `CallbackKind`/prefix now, reusing `endSocratic`
   verbatim for its handler — but no caller ever passes `isIntensityMode: true`, so the button stays
   unreachable until intensity mode ships. Disclosed explicitly rather than worked around with an
   invented flag source (spec.md Decision 5).
7. Every new check in this story is gated on `chat_context.mode === "socratic"` — quiz-mode and
   idle-mode navigation/free-text are completely untouched, mirroring #27's own choice to leave MCQ
   quiz out of its session vocabulary and the PM triage's literal scope carve (spec.md Decision 6).

## Flagged for Ilya (read before or during implementation — not a blocker, but material)

**The "Save for next session" button will not appear anywhere after this story ships.** Its only
caller (`socratic-flow.ts:87`) always passes `isIntensityMode: false`, and intensity mode — the only
thing that would ever pass `true` — is explicitly out of scope here (PM triage: no rigor/intensity
concept exists anywhere in the Socratic service today). What ships is a real, tested `CallbackKind`
and a working handler (reusing `/done`'s exact `endSocratic` path) ready the moment a future story
supplies the flag. If a working "Save for next session" button needs to be visible before that
future story lands, that changes this story's scope — say so and this plan can be revised to also
supply a (smaller, standalone) trigger for the second button, short of full intensity mode. If not,
say nothing and this plan proceeds as written — same non-blocking framing #27's own "Flagged for
Ilya" used for the empty gap line.

## To review / clarify (not blockers, flagged for awareness)

1. **Free-text steering only pivots to topics, never to whole modules.** The issue's own free-text
   examples ("AWS Lambda", "lambda cold starts") are topic-level; module-level free-text steering
   ("let's do the whole Cloud Fundamentals module") is not designed here. If module-level free-text
   steering turns out to matter in practice, it's a small, additive follow-up to `topic-match.ts`
   (candidates would need to include module titles alongside topic titles) — not a redesign.
2. **The word-overlap matcher is deliberately simple, not NLP-grade, with two known tradeoffs.**
   First, it will occasionally pick the wrong topic when two registered topics share a common
   significant word (e.g., "AWS Lambda" and "AWS Step Functions" both contain "AWS" — a bare "aws"
   steer phrase would tie-break toward whichever title is shorter, which may not be what the user
   meant). Second, `significantWords`' `length >= 3` floor means a topic titled "Go" or "S3" can
   never be matched by its own name alone (both are below the floor) — steering to such a topic
   would need a longer phrase that includes another word from the title, or fail through to normal
   answer handling. Given this is a single-user personal bot with a curriculum set the user
   themselves defines, both are judged acceptable, correctable-by-rephrasing tradeoffs rather than a
   reason to build real fuzzy/embedding matching or a title-length-aware floor. Flagging so neither
   is mistaken for an oversight if it misfires once in practice.
3. **Free-text steering during an active session takes priority over the pre-existing
   "let's talk about X" → curriculum-research path**, but only when the phrase matches an
   *already-registered* topic. When it doesn't match, today's behavior (starting AI-driven source
   research for what looks like a brand-new study item) fires exactly as it does on `main`, even
   mid-session — this story does not change what happens for an unmatched phrase, only intercepts
   the matched case. Worth confirming this reads as intuitive: typing an unrecognized tool name
   mid-discussion still kicks off unrelated curriculum research today, and continues to after this
   ships.

## Manual steps / sequencing constraints

None. No migration, no new environment variable or secret, no new infrastructure resource, no
manual `pulumi config set` step. This story is pure application code across `apps/bot/src` (and the
`apps/api`-side reuse is read-only — calling `completeSocraticSessionNow`, an endpoint #27 already
shipped and deployed).

## Quality gates (all must pass)

- `npx tsc --noEmit` (root, fans out to every workspace)
- `npx vitest run` (root) — in particular `topic-match.test.ts` (new, pure), `session-pivot-flow.
  test.ts` (new), `reply.test.ts` (`skip`), `dispatcher.test.ts` (pivot + `save_for_next` branches),
  `webhook.handler.test.ts` (steer interception + `onSkip` dispatch), `session-checkpoint-view.
  test.ts` (real callback replacing the `noop` placeholder)
- No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s verified finding,
  still true) — the typecheck gate is the lint gate
- No integration test suite addition and no `pulumi preview` gate — no new concurrency surface, no
  infrastructure change (spec.md Quality Gates 4-5)

## Easiest things to get wrong (read before implementing)

1. **Don't change `finalizeSession`'s suppression threshold on the backend.** The 0-1-vs-2+ split is
   a bot-layer filter on `result.summary.exchangeCount`, applied in `finalizeForPivot`/
   `finalizeForSkip` only. Changing the `answered.length === 0` check in `socratic.service.ts`
   would silently change `/done`'s and the idle sweep's behavior, which #27 already shipped and
   this story must not touch. AC 29.
2. **Don't match topic titles as a substring inside a sentence.** The shape gate (`isSteerShaped`)
   must run and reject a message *before* `matchTopicTitle` is ever called — skipping the gate, or
   loosening it to allow commas/multi-sentence text through, reopens the exact false-positive risk
   ("unlike Kubernetes, Lambda keeps the container warm…" ending a real session mid-answer) this
   story's Decision 2 exists to close. AC 10, 11, 18.
3. **Don't invent an `isIntensityMode` source to make "Save for next session" reachable.** That is
   intensity mode's job, explicitly out of scope here. The button and its handler must be correct
   and tested in isolation, not wired to a fake trigger just to demo it working end-to-end. AC 27.
4. **Don't give the free-text pivot's acknowledgment message an id via `sendMessage`.** Only
   `sendMessageWithKeyboard` returns a message id (`bot.ts:17-31`) — `startSocratic`/`startQuiz`
   both require one to edit in place. AC 14.
5. **Don't call `finalizeForPivot` when re-tapping the currently-active topic.** `scopeId ===
   targetTopicId` for a `start_topic` tap means "resume," not "pivot" — `startSocraticSession`
   already handles resuming an active session correctly on its own; finalizing it first would
   incorrectly end a session the user meant to continue. AC 2.
6. **`skip` inside an active session must not start anything.** This is the one behavioral line that
   makes `skip` different from a pivot — reusing `finalizeForPivot`'s split logic is correct, but the
   caller (`finalizeForSkip`'s wrapper in `webhook.handler.ts`) must never proceed to call
   `startSocratic`/`startQuiz` afterward, unlike every pivot caller. AC 20.
7. **Free-text steering must stay gated to `mode === "socratic"`.** Running the shape-gate → matcher
   → lookup chain for idle or quiz-mode text would be both wasted I/O and a behavior change nobody
   asked for outside an active discussion (PM's own scope carve names socratic mode specifically).
   AC 17.

## Follow-ups this story deliberately does not build

- **Intensity mode in every form** — the session-scoped flag, "harder"/"challenge me"/"test me hard
  on X" detection, and "return to normal calibration after an intensity session ends." This story
  only wires the `CallbackKind`/handler extension point #27 left for it (spec.md Decision 5); the
  flag's real source, the detection logic, and the end-of-intensity behavior are a separate, sizable
  story, out of proportion to what #25 was scoped to build.
- **The unregistered-tool registration offer** (`/learn drizzle [url]`-style prompts when free text
  names something not yet registered). No `/learn` command or tool-registry table exists on `main`;
  the real registration path is `/study <name>`, a vocabulary mismatch from an earlier phase of this
  issue's own text (PM triage). An implementing agent finding this AC in the original issue body
  should map it to the real curriculum-registration flow or flag it back for a decision — not invent
  a parallel tool registry.
- **Module-level free-text steering** — see "To review / clarify" above; a small, additive follow-up
  to `topic-match.ts` if it turns out to matter.
- **Quiz-mode (`probeSessions`) interruption** — has its own completion concept already; #25's and
  #27's session vocabulary was never asked to apply there (mirrors #27's own explicit carve).
- **Appending #24's topic-menu keyboard to the pivot/skip acknowledgment messages** — same small,
  separable follow-up #27's own todo.md already deferred for its summary message.
- **#40 (PM2 vs launchd vs Docker for the Mac Mini)** — genuinely unresolved architectural fork,
  flagged three times in `.planning/THOUGHTS.md`; nothing in this story's scope depends on it or
  resolves it.
