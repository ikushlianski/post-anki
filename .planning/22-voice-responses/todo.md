---
type: todo
branch: 22-voice-responses
task: "[Story] User responds to questions by voice (#22)"
state: open
updated: 2026-08-14
---

# Todo: User responds to questions by voice (#22)

## Critical first step (do this before writing the rest of the implementation)

1. **Confirm the real OpenRouter `input_audio` request against the live endpoint**, mirroring
   `embeddings-client.ts:30-40`'s own "confirmed against the real endpoint" precedent. Send one real
   Telegram voice note (record via Telegram, download the raw bytes, base64-encode) to
   `openrouter/google/gemini-2.5-flash` via `/api/v1/chat/completions` with an `input_audio` content
   part, `format: "ogg"`. Confirm: (a) OpenRouter/Gemini accepts Telegram's OGG/Opus container
   directly with no transcoding, (b) the transcript comes back in `choices[0].message.content` with no
   extra structure to parse, (c) the real file's base64-encoded size at ~180 seconds duration stays
   comfortably under `apps/api`'s 1MB `MAX_BODY_BYTES` cap (spec.md Decision 4's estimate is
   conservative but unverified against a real file). If any of these disagree with spec.md's
   assumptions, that's a real finding — fix the plan, don't route around it silently.

## Decisions made autonomously

Six forks had a safe, reversible, pattern-following default; logged one line each below for
`ORCHESTRATOR-MEETING-NOTES.md`, full reasoning in spec.md's per-decision sections. **One item below
("Flagged for Ilya") is not a safe-default item — it's surfaced for awareness, not blocking.**

1. Transcription lives in `apps/api` (new `POST /transcriptions`, direct-`fetch` OpenRouter call
   mirroring `embeddings-client.ts`), not `apps/bot` — `apps/bot` has no AI SDK dependency and no
   `OPENROUTER_API_KEY` today; every existing AI call in this product already lives in `apps/api`
   (spec.md Decision 1).
2. New `TRANSCRIPTION_MODEL` env var (default `openrouter/google/gemini-2.5-flash`), not a reused
   `CURRICULUM_MODEL` — `apps/api/.env.example`'s own local-dev `CURRICULUM_MODEL` value
   (`gpt-4o-mini`) is not audio-capable, so reusing it would silently break transcription in the
   environment a developer is most likely to test first. No new secret — same `OPENROUTER_API_KEY`
   (spec.md Decision 2).
3. Voice is a parallel input channel into the existing dispatch, not a separate feature — extracted
   `classifyText(text)` as a pure function so typed and transcribed text run through one identical
   classification path, with zero new special-casing per decision kind (spec.md Decision 3).
4. Duration guard set to 180 seconds, sized against `apps/api`'s real 1MB body cap (not Telegram's
   20MB file cap) — the binding constraint is the base64-inflated JSON body limit every endpoint
   already shares, not Telegram's own generous ceiling. Flagged above as this story's one empirical
   unknown (spec.md Decision 4).
5. Transcription failure gets one flat fallback message (`TRANSCRIPTION_FAILED_REPLY`), not the
   issue's spec'd redirect/counter/gap-path — that machinery doesn't exist anywhere in this codebase
   for any input modality, typed or spoken; building it here would be a separate, unreviewed feature
   smuggled into a plumbing story (spec.md Decision 5, "Flagged for Ilya" below).
6. Typing indicator sent once, unconditionally, right before the transcription call — Telegram's
   indicator persists ~5s on its own, so no 2-second timer is needed to satisfy the issue's intent
   (spec.md Decision 6).

## Flagged for Ilya (read before or during implementation — not a blocker, but material)

**The issue's "unextractable claim → clarifying redirect → I don't know → offer the gap path"
behavior does not ship in this story.** Verified independently: zero hits for any redirect/attempt-
counter/gap-path-trigger machinery anywhere in `apps/api/src` or `apps/bot/src`, for typed answers or
spoken ones. `evaluateAnswer` (`apps/api/src/probe/probe.service.ts:306-354`) has no attempt state at
all. This is not a voice-specific gap this story introduced — it's a pre-existing gap in the whole
answer-evaluation pipeline that the issue's text happens to describe in a voice-specific paragraph.
What ships instead: mechanical transcription, with a single flat "I couldn't catch that" message on
any failure. If the redirect/gap-path behavior is wanted before this is "really done" per the issue's
literal text, that's a separate, real feature — an attempt-counter concept, a semantic
extractability check, a new call site into #28's gap-offer path — sized comparably to #27's own
"Flagged for Ilya" follow-up, and it would apply to the whole answer pipeline, not just voice.

## To review / clarify (not blockers, flagged for awareness)

1. **`MAX_VOICE_DURATION_SEC = 180` is a conservative estimate, not a measured fact** — see "Critical
   first step" above. If the real per-second base64 size is higher than assumed, tighten the constant
   at implementation time; don't ship on an unverified number.
2. **This repo has no root `README.md`** — `#12`'s own "README lists every required env var"
   acceptance criterion is itself unbuilt. This plan's only documentation surface for
   `TRANSCRIPTION_MODEL` is the two `.env.example` files, since there's no README to extend.
3. **`message.audio` (shared/forwarded audio files) is deliberately not treated as a voice note** and
   keeps declining — only `message.voice` (the microphone-button recording) transcribes. Worth
   confirming this reading matches intent if it ever comes up; the issue's own language ("Telegram
   native voice messages," "the user taps the Telegram microphone button") supports it directly.

## Manual steps / sequencing constraints

1. No new secrets, no `pulumi config set` step, no new GCP resource — this story adds one plain,
   non-secret env var (`TRANSCRIPTION_MODEL`) with a safe default and reuses the already-configured
   `OPENROUTER_API_KEY`.
2. No migration, so no interaction with the currently-staged cards-WIP migration
   (`0039_robust_exodus.sql`) that blocked #27's migration numbering — this story has nothing to
   sequence around it.
3. `apps/api`'s prod env (Cloud Run, via GitHub Secrets per `deploy.yml`) needs
   `TRANSCRIPTION_MODEL` set for a real deploy — it has a safe default, so this is a "nice to pin
   explicitly" step, not a blocking one.

## Quality gates (all must pass)

- `npx tsc --noEmit` (root, fans out to every workspace)
- `npx vitest run` (root) — in particular `reply.test.ts` (`classifyText` extraction + voice
  classification), `webhook.handler.test.ts` (duration guard, missing-dep fallback, successful
  transcription reusing existing dispatch across process/study/today/socratic cases, mechanical
  failure with no side effects), `voice-transcription.test.ts` (download/encode/call + every failure
  branch), `transcription-client.test.ts`/`transcription.controller.test.ts` (OpenRouter call shape,
  `OPENROUTER_BASE_URL` override, body-size cap inherited unmodified)
- No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s verified finding, still
  true) — the typecheck gate is the lint gate
- No `npm run test:integration` gate — nothing in this story touches the database

## Easiest things to get wrong (read before implementing)

1. **Don't special-case a size check inside the new `apps/api` controller.** The existing
   `readJsonBody`/`MAX_BODY_BYTES` machinery already protects every endpoint uniformly — adding a
   second, controller-local check would drift out of sync with the shared one. AC 20.
2. **Don't skip the duration guard's ordering.** It must run before any Telegram download or `apps/api`
   call — the whole point is avoiding wasted work (and wasted OpenRouter cost) on a voice note that's
   going to be rejected anyway. AC 6.
3. **Don't build a 2-second timer for the typing indicator.** Send it once, unconditionally, right
   before the transcription call — Telegram's own ~5s persistence covers the intent. AC 9.
4. **Don't add a new dispatch branch per decision kind for the voice-sourced case.** The entire point
   of extracting `classifyText` is that a transcribed answer re-enters the *same* `if (decision.kind
   === ...)` chain a typed one does — a parallel "if voice, do X" branch anywhere below the
   preprocessing block is exactly the two-divergent-paths outcome this plan is designed to avoid. AC
   10, 11.
5. **Don't invent the redirect/counter/gap-path behavior from the issue's literal text.** It has no
   substrate anywhere in this codebase. See "Flagged for Ilya" above — this is deliberate, not an
   oversight to "complete."
6. **`message.audio` is not `message.voice`.** Keep the five-item `it.each` group in `reply.test.ts`
   (photo/sticker/document/video/audio) declining exactly as today; only pull `voice` out into its own
   case. AC 4.

## Follow-ups this story deliberately does not build

- The issue's unextractable-claim redirect/counter/gap-path behavior (see "Flagged for Ilya" above) —
  the single biggest thing this story leaves undone relative to the issue's literal text, for a
  disclosed, structural reason.
- Any change to `evaluateAnswer`/`probe.service.ts`'s answer-evaluation logic.
- Handling `message.audio` (non-voice audio files) as a transcribable input.
- Audio transcoding — voice notes go to OpenRouter as-is; if the "critical first step" above finds the
  model rejects raw OGG, that's a blocking finding to raise, not something to route around.
- A root `README.md` documenting env vars.
