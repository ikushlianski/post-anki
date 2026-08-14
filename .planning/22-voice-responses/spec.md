---
type: spec
branch: 22-voice-responses
task: "[Story] User responds to questions by voice (#22)"
complexity: medium
state: planned
updated: 2026-08-14
verification:
  targetDb: none (no schema/DB changes — bot preprocessing step + one new stateless API endpoint)
---

# Plan: User responds to questions by voice (#22)

## What this story is, in one paragraph

Today any Telegram message without `.text` — including a native voice note — is declined with "I
can only read text for now." (`apps/bot/src/conversation/reply.ts:36-38`,
`webhook.handler.ts:104-107`, pinned by `reply.test.ts`'s "non-text attachments" `it.each` and
`webhook.handler.test.ts`'s "declines a voice message"). Path 1 of this issue (external dictation —
Wispr Flow, iOS dictation) already works with zero code, because the transcribed text arrives as a
normal `message.text` and is handled identically to any typed message
(`.planning/THOUGHTS.md:298,356`). This plan builds Path 2: when a Telegram voice note arrives, the
bot downloads it, sends it to a new `apps/api` endpoint that transcribes it via OpenRouter's audio
input support (reusing the already-configured `OPENROUTER_API_KEY`, no new vendor), and feeds the
resulting text through the **exact same classification and dispatch path** typed text already uses —
so a spoken "let's talk about Lambda" or a spoken answer to today's question behaves identically to
typing it. Non-voice, non-text attachments (photo, sticker, document, video, generic audio file)
keep declining exactly as today.

## Verified facts

- **Dependencies real and closed.** `gh issue view 13/28/34 --json state` — all `CLOSED`, matching
  PM triage. Independently confirmed the decline path is real code, not just a tracker claim: `grep
  -rn "message.voice" apps/bot/src` returns only test fixtures and the `it.each` in
  `reply.test.ts:159` — no production branch reads `message.voice` today.
- **No speech-to-text code exists anywhere.** `grep -rn "whisper\|transcri" apps/api/src apps/bot/src`
  (case-insensitive) returns zero hits outside `.planning/`.
- **`.planning/THOUGHTS.md` already scoped this as Path 2, native in-bot transcription** (lines
  31-32, 216, 297-298, 356) — "requires server-side transcription," "covered by #12 (local setup
  includes all API keys), no new dep declaration needed." Confirmed against the issue body itself
  (`gh issue view 22`), which spells out the same two-path design directly.
- **OpenRouter supports audio input via chat completions, no dedicated transcription endpoint.**
  Verified against OpenRouter's own docs (`openrouter.ai/docs/features/multimodal/audio`, fetched
  during planning): audio is sent as an `input_audio` content part on a normal
  `/api/v1/chat/completions` call, base64-encoded, with OGG explicitly among the supported formats.
  OpenRouter's own worked example uses Google's Gemini 2.5 Flash. There is no `/audio/transcriptions`-
  style endpoint the way OpenAI's Whisper API has one — this only works through the same chat-
  completions surface `apps/api` already calls for everything else.
- **`OPENROUTER_API_KEY` is the only LLM credential in this repo**, loaded by `apps/api/src/shared/
  env.ts:3` and reused across every AI call (`apps/api/package.json` — `@mastra/core` +
  `openrouter.ai` base URL). `apps/bot` has no AI SDK dependency at all
  (`apps/bot/package.json` — grammy, drizzle-orm, pg, pino, zod only) and no `OPENROUTER_API_KEY` in
  its own env schema (`apps/bot/src/env.ts:3-12`) — every existing AI call in this product happens in
  `apps/api`, never in `apps/bot`. This is the strongest architectural fact driving Decision 1 below.
- **`CURRICULUM_MODEL`'s configured value is not reliably audio-capable.** Root `.env.example` sets
  it to `openrouter/google/gemini-2.5-flash` (audio-capable, per OpenRouter's own docs example), but
  `apps/api/.env.example` — the file `apps/api` actually loads for local dev — sets it to
  `openrouter/openai/gpt-4o-mini` (a text-only chat model; audio input on OpenAI-family models needs
  the separate `gpt-4o-audio-preview` variant, not `gpt-4o-mini`). Reusing `CURRICULUM_MODEL` as-is
  would silently break transcription in local dev depending on which `.env.example` value is active.
  See Decision 2.
- **`apps/api`'s JSON body reader caps every request at `MAX_BODY_BYTES = 1_000_000` bytes**
  (`apps/api/src/shared/http.ts:4,58-84`), applied uniformly by `readJsonBody` to every controller,
  including whatever new transcription controller this plan adds — not something this plan should
  special-case around. Base64 inflates raw bytes by ~4/3, so this caps raw voice-audio size at well
  under 1MB, not 1MB itself. See Decision 4 — this is a real, load-bearing constraint on the duration
  guard, not just a hygiene nice-to-have.
- **No "unextractable claim" / clarifying-redirect machinery exists anywhere in this codebase.**
  The issue's own body describes: "if the AI cannot identify a clear knowledge claim... it makes one
  clarifying redirect attempt... [a second failure] is treated the same as 'I don't know' — offers
  the gap path per #34/#28." Grepped directly: `grep -rn "sounds like you might be getting at\|
  unextractable\|clarifying redirect" apps/api/src apps/bot/src` → zero hits. `evaluateAnswer`
  (`apps/api/src/probe/probe.service.ts:306-354`) has no attempt counter and no redirect branch — it
  either extracts `newGaps`/`nextPrompt` or returns empty arrays; there's no two-strikes state
  anywhere for typed answers either. This is not a voice-specific gap — the redirect/counter/gap-path
  machinery described in the issue doesn't exist for *any* input modality yet. See Decision 5 and
  "Flagged for Ilya" below — this mirrors the exact "closed-but-unbuilt tracker claim" failure mode
  `.planning/27-session-end-summary/spec.md` and `.planning/33-untriaged-gaps-auto-defer/spec.md`
  both independently hit and disclosed rather than silently building around.
- **`selectReply` is the single place every message gets classified**, and its result (`ReplyDecision`)
  drives every downstream branch in `webhook.handler.ts`'s `handleMessage` — study/continue/today/
  done/skip/process, plus the socratic/quiz mode overrides. Nothing in the issue or in `.planning/
  THOUGHTS.md` narrows voice handling to a subset of these (e.g. "only inside an active Socratic
  session") — the issue's own acceptance criteria ("no minimum or maximum length," "same quality as
  typed answers," "not silently dropped") and THOUGHTS.md's framing of Path 1 as "handled identically
  to any typed message" both describe voice as a parallel *input channel* into the same dispatch,
  not a narrower feature. See Decision 3.
- **`sendChatAction` already exists** (`apps/bot/src/telegram/bot.ts:52-57`) — a bare pass-through to
  grammy's `api.sendChatAction`. Telegram's typing indicator persists ~5 seconds once sent; the
  issue's "if transcription takes longer than 2 seconds, send a typing indicator" is satisfied by
  sending it unconditionally right before the transcription call, not by building a 2-second timer.
  See Decision 6.
- **Cards-related files are untouched by this plan.** `git status --short` confirms
  `packages/shared/src/cards.ts`, `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`,
  `apps/api/src/topic/topic.repo.ts` all carry pre-existing uncommitted WIP; none of this plan's own
  files overlap them.

## Decision 1 — Transcription lives in `apps/api`, not `apps/bot`

**Why not `apps/bot`.** `apps/bot` has zero AI SDK dependencies and zero knowledge of
`OPENROUTER_API_KEY` today — every single AI call in this product, without exception, is made from
`apps/api`. Adding a direct OpenRouter call from `apps/bot` would mean duplicating credential loading,
retry/timeout handling, and the `OPENROUTER_BASE_URL` e2e-mock override in a second place, for a
product that has deliberately kept exactly one process that talks to the model provider.

**What this plan builds instead:** a new stateless `apps/api` endpoint, `POST /transcriptions`,
mirroring `embeddings-client.ts`'s own precedent for "direct `fetch()` to OpenRouter, not a Mastra
`Agent`" (`apps/api/src/subject-duplicate/embeddings-client.ts:1-18`) — this is a single non-
conversational call with no multi-turn state, exactly the same shape as an embeddings call, not a
chat/generation flow that needs an `Agent`. `apps/bot` downloads the raw voice bytes from Telegram
(it already holds `TELEGRAM_BOT_TOKEN`), base64-encodes them, and POSTs to this new endpoint via the
existing `apiFetch` pattern (`apps/bot/src/api/client.ts:73-84`) — the same pattern already used for
every other bot→api call.

```
apps/api/src/transcription/
  transcription-client.ts   — direct fetch() to OpenRouter /chat/completions with an input_audio
                               content part, mirrors embeddings-client.ts's retry/timeout/base-url-
                               override shape exactly
  transcription.controller.ts — readJsonBody → transcription-client → { text }
```

## Decision 2 — New `TRANSCRIPTION_MODEL` env var, not a reused `CURRICULUM_MODEL`

**Why not reuse `CURRICULUM_MODEL`.** Its configured value differs by environment and is not
guaranteed audio-capable — `apps/api/.env.example`'s own local-dev default (`gpt-4o-mini`) is a
text-only model. Reusing it directly would make transcription silently fail (or 400 from OpenRouter)
in the exact environment a developer is most likely to test it in first.

**What this plan adds:** one new non-secret env var, `TRANSCRIPTION_MODEL`, defaulting to
`openrouter/google/gemini-2.5-flash` — the same model OpenRouter's own audio-input docs demonstrate,
and the same value the root `.env.example`'s `CURRICULUM_MODEL` already uses (so it's a value already
proven to work against the shared `OPENROUTER_API_KEY` in this project's own config, just pinned to
its own var instead of piggybacking on a var whose value is free to drift for unrelated reasons).
**No new secret, no new vendor, no new credential** — same `OPENROUTER_API_KEY`, same billing account,
one new plain config line with a safe default:

- `apps/api/src/shared/env.ts` — `TRANSCRIPTION_MODEL: z.string().min(1).default("openrouter/
  google/gemini-2.5-flash")`
- Root `.env.example` and `apps/api/.env.example` — one new line each, with a short comment
  explaining why it's separate from `CURRICULUM_MODEL` (this exact reasoning, condensed).

This repo has no root `README.md` today (`#12`'s own "README lists every required env var"
acceptance criterion is itself unbuilt) — there is no README to extend, so this plan's only
documentation surface for the new var is the two `.env.example` files, consistent with what actually
exists.

## Decision 3 — Voice is a parallel input channel into the existing dispatch, not a separate feature

**The core mechanism: extract `classifyText(text: string): ReplyDecision` as a pure function**,
pulling out everything in `selectReply` from `reply.ts:40` onward (command parsing, `SKIP_PATTERN`,
`TALK_ABOUT_PATTERN`, `CONTINUE_PATTERNS`, the `"process"` fallback) — unchanged logic, just named and
exported separately from the `message`-shaped wrapper around it. `selectReply(message)` becomes:

```ts
export function selectReply(message: Message): ReplyDecision {
  const text = message.text?.trim();
  if (text) return classifyText(text);
  if (message.voice) {
    return { kind: "voice", fileId: message.voice.file_id, durationSec: message.voice.duration };
  }
  return { kind: "decline" };
}
```

`ReplyDecision` gains one new member: `{ kind: "voice"; fileId: string; durationSec: number }`.
Every other attachment shape (photo, sticker, document, video, generic `audio`) still falls through
to `{ kind: "decline" }` unchanged — `message.audio` (a shared/forwarded audio file) is deliberately
**not** treated as a voice note; only `message.voice` (the microphone-button recording) is.

**Dispatch reuse in `webhook.handler.ts`.** `handleMessage` computes `decision = selectReply(message)`
exactly as today. A new preprocessing block, before any of the existing `decision.kind === "..."`
checks, handles `"voice"`: on success it **reassigns** `decision = classifyText(transcribedText)` and
`text = transcribedText`, then falls straight into the untouched, existing chain of `if (decision.kind
=== "start") ...` branches below. No new branch is added for "study from voice" or "continue from
voice" — the classification of the transcript is identical to the classification of typed text,
because it runs through the same `classifyText` call. This is the one architectural choice that
prevents two divergent dispatch paths (typed vs. spoken) from drifting apart over time.

## Decision 4 — Duration guard sized against `apps/api`'s real 1MB body cap, not Telegram's 20MB file cap

Telegram's own `getFile` limit for bots is 20MB — far too generous to use as the guard here, because
the payload doesn't stop at Telegram: it gets base64-encoded (~4/3 inflation) and sent as a JSON body
to `apps/api`, which rejects anything over `MAX_BODY_BYTES = 1_000_000` bytes
(`apps/api/src/shared/http.ts:4`) for *every* endpoint, this one included. A duration guard belongs in
`apps/bot`, before any download happens — `message.voice.duration` is present on the message for
free, so the check costs nothing.

**Concrete threshold — flagged for empirical confirmation, not asserted as fact.** Telegram voice
notes are OGG/Opus, typically encoded in the 16–24kbps range for voice-optimized recording (this
figure is an assumption, not independently verified against a real Telegram-issued file). At a
conservative 24kbps (~3KB/s raw, ~4KB/s after base64 inflation), staying under the 1MB cap with
headroom allows roughly 200+ seconds. This plan sets `MAX_VOICE_DURATION_SEC = 180` (3 minutes) as a
deliberately conservative default with real margin below that estimate. **`todo.md`'s "critical first
step"** (mirroring `embeddings-client.ts:30-40`'s own "confirmed against the real endpoint" precedent)
is to record one real Telegram voice note's actual file size at implementation time and confirm 180s
stays comfortably under 1MB — adjust the constant only if that check disagrees with the estimate
above, and only downward (never loosen it past what's actually measured).

A voice note over the cap is rejected before any download or API call, with `VOICE_TOO_LONG_REPLY`
("That voice message is a bit long — try a shorter one, or just type it.").

## Decision 5 — Transcription failure gets one flat fallback message, not the issue's spec'd redirect/
counter/gap-path

The issue's body describes a two-strike "clarifying redirect, then treat as 'I don't know', then
offer the gap path per #34/#28" flow for any voice response the AI can't extract a claim from —
explicitly including "transcription failures are treated as unextractable claims." Verified above:
**none of that machinery exists in this codebase for any input modality**, typed or spoken. Building
it as a side effect of "add voice as an input channel" would mean inventing, from scratch, a new
per-session attempt-counter, a new AI-driven "is this claim extractable" classifier, and a new call
site wiring into the gap-offer path (#34/#28) — a distinct, sizable feature in its own right, not
something a transcription-plumbing story should smuggle in unreviewed. This mirrors
`.planning/27-session-end-summary/spec.md`'s Decision 1 and `.planning/33-untriaged-gaps-auto-defer/
spec.md`'s Decision 1: disclose the missing substrate plainly, don't fake the trigger, don't build a
parallel feature under this story's name.

**What this plan builds instead:** a single fallback message, `TRANSCRIPTION_FAILED_REPLY` ("I
couldn't catch that — try again, or type your answer."), covering every mechanical failure mode
uniformly — Telegram file-download error, OpenRouter API error/timeout, or an empty/whitespace-only
transcript. No attempt counter, no semantic "was this extractable" judgment, no gap-path hook. Chat
context and any pending state are left completely untouched on failure — same as today's `decline`
path — so the user can just try again or fall back to typing with no side effects to undo.

### Flagged for Ilya (non-blocking, but material to what "done" means here)

This is not a request to redesign anything now — proceeding as written — but stated plainly: **the
issue's "unextractable claim → clarifying redirect → I don't know → gap path" behavior does not ship
in this story**, because it has no substrate to attach to anywhere in this codebase today, for typed
or spoken answers alike. What ships instead is mechanical transcription with a flat failure message.
If that redirect/gap-path behavior is wanted before this is considered "really done" per the issue's
literal text, it's a separate, real feature (an attempt-counter concept, a semantic extractability
check, a new call site into the gap-offer path) that applies to the whole answer pipeline, not just
voice — sized comparably to #27's own "Flagged for Ilya" follow-up.

## Decision 6 — Typing indicator sent once, unconditionally, right before the transcription call

The issue's "if transcription takes longer than 2 seconds, send a typing indicator" invites building
a 2-second timer around the transcription call. Simpler and equally correct: Telegram's typing
indicator persists ~5 seconds once sent and is cheap to send even when unneeded. This plan calls
`sendChatAction(chatId, "typing")` unconditionally, immediately before invoking the transcription
call — satisfying the intent ("the user sees the bot is working on anything but the fastest replies")
with no timer logic. `HandlerDeps` gains one new **optional** dep, `sendChatAction?: (chatId: number,
action: "typing") => Promise<void>`, matching every other injected side effect on this type
(`onStart`, `onStudy`, `onSteer`, `clearChatContext`, etc. — `sendMessage` and `flow` are the only two
non-optional deps today) — wired in `server.ts` straight to the existing `bot.ts` export in the real
deployment, called only when present (`if (deps.sendChatAction) await deps.sendChatAction(chatId,
"typing")`) so every existing `HandlerDeps` test fixture that doesn't supply it keeps compiling
unchanged.

## Architecture

### Business logic changes

- A Telegram voice note (tap the microphone, speak, send) is now transcribed and processed exactly
  like a typed answer — recognizing `/today`-equivalent phrasing was never in scope (voice notes
  can't literally say a slash command), but "let's talk about Lambda," a plain answer to today's
  question, or free-text steering mid-Socratic-session all work identically whether typed or spoken.
- A voice note over ~3 minutes gets a friendly "try shorter, or type it" reply instead of a silent
  drop or an opaque failure.
- If transcription fails for any mechanical reason (download error, API error, empty result), the
  user sees "I couldn't catch that — try again, or type your answer," with no side effects — no
  pending state consumed, no session advanced.
- Photos, stickers, documents, videos, and generic (non-voice) audio files keep declining exactly as
  today — this story only adds one new input channel, not a general "handle any attachment" feature.

### Architectural changes

- `apps/bot/src/conversation/reply.ts` — extracts `classifyText(text)` as a pure, exported function;
  `selectReply` gains voice recognition; `ReplyDecision` gains the `"voice"` member; new exported
  constants `VOICE_TOO_LONG_REPLY`, `TRANSCRIPTION_FAILED_REPLY`.
- `apps/bot/src/telegram/webhook.handler.ts` — `handleMessage` gains a voice-preprocessing block
  ahead of the existing dispatch chain; `HandlerDeps` gains `onVoice` (transcription entry point) and
  `sendChatAction`.
- New `apps/bot/src/voice/voice-transcription.ts` — downloads the file from Telegram via the bot's own
  `getFile`/file-URL mechanism, base64-encodes it, calls the new `apps/api` endpoint via
  `apps/bot/src/api/client.ts`'s new `transcribeAudio` function, returns `string | null`.
- New `apps/api/src/transcription/` feature folder — `transcription-client.ts` (direct-fetch OpenRouter
  call, mirrors `embeddings-client.ts`) and `transcription.controller.ts` (HTTP glue).
- `apps/api/src/router-table.ts` / `router.ts` / `server.ts` — one new route, `POST /transcriptions`.
- `apps/api/src/shared/env.ts` — new `TRANSCRIPTION_MODEL` var (non-secret, safe default).
- New `packages/shared/src/transcription.ts` — the `POST /transcriptions` request/response shapes
  shared between `apps/bot` and `apps/api`, matching how every other cross-package DTO in this repo
  is defined (e.g. `daily-push.ts`, `probe.ts`).
- Root `.env.example` and `apps/api/.env.example` gain one new line each for `TRANSCRIPTION_MODEL`.
- No schema/migration changes anywhere — nothing in this story persists any new state.
- No changes to `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`, `apps/api/src/topic/
  topic.repo.ts`, `packages/shared/src/cards.ts` — confirmed via `git status` that none of this plan's
  files overlap the uncommitted cards WIP.

## Quality gates

1. `npx tsc --noEmit` clean across `apps/api`, `apps/bot`, `packages/shared`.
2. `npx vitest run` green — new coverage for `classifyText`/`selectReply`'s voice branch
   (`reply.test.ts`), the voice-preprocessing block in `webhook.handler.test.ts` (duration guard,
   missing-dep fallback, successful transcription reusing existing dispatch, mechanical failure),
   `voice-transcription.test.ts` (download + encode + call, all failure branches), and
   `transcription-client.test.ts`/`transcription.controller.test.ts` on the `apps/api` side (mirroring
   `embeddings-client.ts`'s own test shape, including the `OPENROUTER_BASE_URL` override).
3. No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s verified finding, still
   true) — the typecheck gate is the lint gate.
4. No `npm run test:integration` gate — nothing in this story touches the database.
5. Manual/empirical check (not an automated gate, but required before this ships): confirm the
   `input_audio` `format` value OpenRouter expects for Telegram's OGG/Opus voice notes against the
   real endpoint, and confirm a real voice note's base64 size at `MAX_VOICE_DURATION_SEC` stays under
   `apps/api`'s 1MB body cap. See `todo.md`'s "critical first step."

## Explicitly out of scope

- The issue's "unextractable claim → clarifying redirect → I don't know → gap path" behavior —
  Decision 5, "Flagged for Ilya." No substrate exists for it anywhere in this codebase, for any input
  modality.
- Any change to `evaluateAnswer` / `probe.service.ts`'s answer-evaluation logic — this plan feeds
  transcribed text into the exact same dispatch typed text already uses; it does not change how
  answers are evaluated once they arrive as text.
- Handling `message.audio` (shared/forwarded audio files, as opposed to `message.voice` recordings) —
  stays declined, exactly as today. Not requested by the issue, and semantically a different
  attachment kind (often music/podcasts, not a spoken answer).
- Any transcoding of the audio (e.g. converting OGG/Opus to another container) — Telegram voice notes
  are sent to OpenRouter as-is; if empirical testing (todo.md) finds the target model rejects OGG
  directly, that's a blocking finding to raise, not something to route around silently.
- A root `README.md` documenting env vars — none exists today; out of scope to create one as a side
  effect of this story.
- Any change to `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`, `apps/api/src/topic/
  topic.repo.ts`, `packages/shared/src/cards.ts`, or any other file carrying uncommitted cards WIP.
