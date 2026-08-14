---
type: scenarios
branch: 22-voice-responses
task: "[Story] User responds to questions by voice (#22)"
state: planned
updated: 2026-08-14
---

# Scenarios: User responds to questions by voice (#22)

**21 acceptance criteria.** No migration, no scheduled job — one new stateless API endpoint, one
new env var, and a preprocessing step ahead of an otherwise-untouched dispatch chain. Smaller than
#27 (31 ACs, migration + scheduler job) and #25 (complex, multi-decision); closer to a plumbing story
than a new subsystem.

No Playwright plan — every surface here is the Telegram bot (message classification, dispatch) plus
one internal `apps/api` HTTP endpoint never called from `apps/web`; this project's verification-repo
integration targets `apps/web` only, and nothing in this story touches it.

## Master acceptance criteria list (21 items, each independently walkable)

**Classification (`reply.ts`)**

1. `classifyText(text)` is a pure, exported function containing exactly the logic currently inline in
   `selectReply` from `reply.ts:40` onward (command parsing, skip/talk-about/continue patterns, the
   `"process"` fallback) — proven by every existing `selectReply` test in `reply.test.ts` passing
   unmodified against the refactored implementation.
2. `selectReply(message)` with `message.text` present calls `classifyText(text)` and returns its
   result — unchanged observable behavior for every typed-message test case.
3. `selectReply(message)` with `message.voice` present (and no `.text`) returns `{ kind: "voice",
   fileId: message.voice.file_id, durationSec: message.voice.duration }`.
4. `selectReply(message)` for every other non-text attachment (photo, sticker, document, video,
   generic `audio`) still returns `{ kind: "decline" }` — proven by keeping those five cases in
   `reply.test.ts`'s existing `it.each`, with `voice` removed from that group into its own test (AC 3).
5. `selectReply(message)` for a message with neither `.text` nor `.voice` still returns `{ kind:
   "decline" }` — the existing empty-message test passes unmodified.

**Duration guard (`webhook.handler.ts`, before any download)**

6. A voice decision with `durationSec > MAX_VOICE_DURATION_SEC` (180s) sends `VOICE_TOO_LONG_REPLY`
   and returns — `deps.onVoice` is never called, proven by a mock assertion of zero calls.
7. A voice decision with `durationSec <= MAX_VOICE_DURATION_SEC` proceeds to the transcription step
   (AC 9+).

**Missing dep fallback**

8. A voice decision within the duration guard, when `deps.onVoice` is undefined, sends
   `DECLINE_REPLY` — mirrors every other optional-dep fallback already in `handleMessage` (`onStudy`,
   `onDone`, etc.) exactly, not a new fallback shape.

**Successful transcription reuses the exact existing dispatch**

9. Before calling `deps.onVoice`, `handleMessage` calls `deps.sendChatAction(chatId, "typing")`
   exactly once, unconditionally, whenever `deps.sendChatAction` is provided — proven by a mock call
   assertion, no timer/delay involved. `sendChatAction` is optional on `HandlerDeps` (matching
   `onStart`/`onStudy`/etc.); when absent, the transcription call proceeds without it — no crash, no
   fallback message, since a missing typing indicator is cosmetic, not a functional failure.
10. On a successful transcription (`deps.onVoice` resolves to a non-empty string), `handleMessage`
    reassigns its working `decision`/`text` via `classifyText(transcribedText)` and falls through into
    the **existing, unmodified** dispatch chain below — proven by three representative cases sharing
    one test harness: a transcript that classifies as `"process"` (routes into `answerPending`,
    identical to a typed answer), a transcript that classifies as `"study"` (routes into `onStudy`,
    identical to typing "let's talk about X"), and a transcript that classifies as `"today"` (routes
    into `sendTodaysQuestion`, identical to typing `/today` — even though no realistic recording would
    literally say a slash, this proves the dispatch code path has zero special-casing for voice-
    sourced text once classified).
11. A transcribed answer arriving mid-Socratic-session is steered/dispatched through the exact same
    `onSteer`/`onSocraticText` branches a typed answer would hit in the same context — proven by
    asserting `context.mode === "socratic"` routes a voice-sourced transcript through `onSocraticText`
    exactly as it would a typed one, no new branch added for this case.

**Transcription failure — one flat fallback, no side effects**

12. `deps.onVoice` resolving to `null` (any mechanical failure — download error, API error, empty
    result) sends `TRANSCRIPTION_FAILED_REPLY` and returns — no call to `classifyText`, no dispatch
    branch entered.
13. `deps.onVoice` resolving to an empty or whitespace-only string is treated identically to `null` —
    same fallback message, same no-dispatch outcome.
14. A transcription failure leaves any existing pending/chat-context state completely untouched —
    proven by asserting no `clearPending`/`clearChatContext`/context-mutating call happens on the
    failure path, mirroring the existing `decline` path's side-effect-free behavior.

**Voice download + transcription (`apps/bot/src/voice/voice-transcription.ts`)**

15. Given a valid `fileId`, the function calls Telegram's `getFile`, downloads the resulting file URL,
    base64-encodes the bytes, and calls the new `apps/api` `transcribeAudio` client function with
    `{ audioBase64, mimeType }` — `mimeType` read from `message.voice.mime_type` when present, falling
    back to `"audio/ogg"` when absent.
16. A `getFile` failure, a non-OK download response, or a rejected `transcribeAudio` call are all
    caught and produce `null` (never a thrown/unhandled rejection reaching `handleMessage`) — proven
    by one test per failure point, each asserting a logged error and a `null` return, not a throw.
17. A successful transcription with a real (non-empty, trimmed) result string returns that string.

**`apps/api` transcription endpoint**

18. `POST /transcriptions` with a valid `{ audioBase64, mimeType }` body calls the new
    `transcription-client.ts`'s OpenRouter chat-completions call (`input_audio` content part, model =
    `env.TRANSCRIPTION_MODEL`) and returns `{ text }` with the extracted transcript — proven with the
    OpenRouter call mocked at the `fetch` boundary, exactly like `embeddings-client.ts`'s own test
    shape.
19. The transcription client applies the `OPENROUTER_BASE_URL` override exactly like
    `embeddings-client.ts:5-18` and `tech-research-grounding.ts` already do — proven by a test
    asserting the call target changes when that env var is set, so e2e's mock server (if this project
    ever adds Playwright coverage for `apps/api` directly) is never silently bypassed.
20. `POST /transcriptions` with a body exceeding `MAX_BODY_BYTES` (1MB) is rejected by the existing,
    unmodified `readJsonBody` machinery (`apps/api/src/shared/http.ts`) with its existing "body too
    large" 400 response — proven by asserting no new size-check code was added to the new controller;
    it relies entirely on the shared reader.
21. `transcription-client.ts` reads `env.TRANSCRIPTION_MODEL` for the OpenRouter request's `model`
    field and never references `env.CURRICULUM_MODEL` — proven directly by the mocked-`fetch`
    assertion in AC 18/19 inspecting the request body's `model` value, not by toggling env vars against
    a cached `loadEnv()` (which caches module-level and isn't safely re-triggerable mid-test-file
    without a reset this codebase's existing env tests don't establish a pattern for).

---

## SCENARIO 1 — A user speaks their answer to today's question

**Given** the owner has an active pending question (`/today` already sent) and taps the Telegram
microphone to record a 20-second spoken answer
**When** the voice note arrives
**Then** the bot sends a typing indicator, downloads and transcribes the note via the new `apps/api`
endpoint, classifies the resulting text exactly as it would a typed answer, and dispatches it into
`answerPending` — the user sees the same feedback quality as if they had typed the same words.

Covers AC 3, 6 (negative — under threshold), 7, 9, 10 (process case), 15, 17, 18.
Proof: `webhook.handler.test.ts` (new success-path test), `voice-transcription.test.ts`,
`transcription.controller.test.ts`.

## SCENARIO 2 — A user speaks "let's talk about Lambda" instead of typing it

**Given** the owner is idle (no active session)
**When** they send a 3-second voice note whose transcript is "let's talk about Lambda"
**Then** the bot classifies the transcript via `classifyText` exactly as it would the typed phrase,
producing `{ kind: "study", name: "Lambda" }`, and dispatches into `onStudy` — proving voice is a
parallel input channel into the same classifier, not a separate feature with its own pattern-matching.

Covers AC 10 (study case), 3, 9, 15, 17, 18.
Proof: `webhook.handler.test.ts` (new test asserting `onStudy` called with `"Lambda"` from a voice
decision).

## SCENARIO 3 — A voice note runs long

**Given** the owner records a 4-minute voice note (240s, over the 180s cap)
**When** it arrives
**Then** the bot replies with `VOICE_TOO_LONG_REPLY` immediately — no Telegram file download, no
`apps/api` call, no typing indicator sent (nothing to be "typing" about; the rejection is instant).

Covers AC 6.
Proof: `webhook.handler.test.ts` (asserts `onVoice` and `sendChatAction` both uncalled).

## SCENARIO 4 — Transcription fails mid-conversation

**Given** the owner is mid-Socratic-session and sends a voice note, but the `apps/api` transcription
call times out or errors
**When** `deps.onVoice` resolves to `null`
**Then** the bot replies with `TRANSCRIPTION_FAILED_REPLY`, and the Socratic session's pending turn,
chat context, and mode are all completely unchanged — the user can just try again (voice or typed)
with no state to untangle.

Covers AC 12, 14, 16.
Proof: `webhook.handler.test.ts` (asserts no `clearPending`/`clearChatContext`/`onSocraticText` calls
on this path), `voice-transcription.test.ts` (each failure point produces `null`, not a throw).

## SCENARIO 5 — Non-voice attachments keep declining exactly as today

**Given** the owner sends a photo, sticker, document, video, or a shared (non-voice) audio file
**When** any of these arrive
**Then** the bot replies with the existing `DECLINE_REPLY`, completely unaffected by this story — no
download attempted, no `apps/api` call made, matching today's behavior byte-for-byte.

Covers AC 4, 5.
Proof: `reply.test.ts`'s existing `it.each` (unmodified except `voice` moved out of the group into its
own test per AC 3), `webhook.handler.test.ts`'s existing declines-non-text coverage.

## SCENARIO 6 — `apps/api`'s body-size cap is never bypassed for voice

**Given** a malformed or unexpectedly large `audioBase64` payload somehow reaches `POST
/transcriptions` (e.g. a future caller bypassing the bot's own duration guard)
**When** the request body exceeds `MAX_BODY_BYTES`
**Then** the existing `readJsonBody` machinery rejects it with its standard 400 "body too large"
response — the new controller adds no separate size check and inherits the same protection every
other `apps/api` endpoint already has.

Covers AC 20.
Proof: `transcription.controller.test.ts` (oversized body → 400, asserting no new size-check code
path was introduced).
