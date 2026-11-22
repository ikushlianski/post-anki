---
state: draft
updated: 2026-11-22
---
# Socratic courses: architecture

No new services, queues or modules. The change extends the existing `socratic` module and adds one data contract from a Socratic session to the knowledge pipeline.

## Where the tutor loop lives

- **Server owns the loop.** `apps/api/src/socratic/` keeps owning sessions, turns, grading and session end. Clients (web, iPhone/Mac, Telegram bot) only send an answer and render the reply.
- **Rule decides the rung, model writes the words.** `packages/core/src/socratic/` gains a pure function that turns prior tries, depth and the grade into a rung (CONFIRM / NARROW / POINTER / REVEAL / MOVE_ON) and a pure leak-guard function. The model call (existing `socraticEval` agent, new instructions) never chooses the rung.
- **One model call per answer.** Grading, verdict sentence, pointer, explanation and the narrower follow-up question come from one structured call. A new concept's opening question still comes from the existing probe question builder.
- **No tools.** The tutor agent has no tools and returns structured output only.

## What is stored per session

| Where | Field | Purpose |
|---|---|---|
| `socratic_turns` | `reference_answer` text, nullable | model's full reference explanation; server-only; source for review notes |
| `socratic_turns` | `rung` text, nullable | rung shown for this turn; drives summary and tests |
| `socratic_sessions` | `review_filed_count` integer, nullable | how many missed concepts were filed at session end; null = not filed yet |
| `socratic_sessions` | `end_reason` text, nullable | `learner`, `idle`, `topic_done`, `turn_cap` |

Learner answers and prompts are already stored per turn. No full transcript is stored or sent.

## Data contracts (shared, additive only)

- `socraticEvalSchema` gains `verdictLine`, `hint`, `followUpQuestion` (model output; server-internal).
- `answerSocraticResultSchema` gains optional `rung`, `nextTopic` (`{ topicId, title }` or null).
- `socraticSessionSummarySchema` gains optional `missedConcepts` (labels) and `reviewFiledCount`.
- `degree` keeps its meaning and becomes the client's on-track badge source.
- `correctAnswer` / `reference_answer` never appear in any client response.
- New error code `tutor_unavailable` (503) on answer when the model fails after retries.

## How it feeds cards and progress

- **Progress:** unchanged path. Covered concepts update `gaps.state`; `refreshTopicProgress` updates topic maturity and status.
- **Cards:** session finalize (single winner of the existing compare-and-set) collects turns whose rung was REVEAL or MOVE_ON and calls `fileKeyedNotes` with one note per concept, key `socratic:<sessionId>:<gapId|opening>`, subject = the course's subject, provenance `ai-session`, origin `Socratic tutor: <course> / <topic>`. The knowledge pipeline then owns extraction, approval, card generation and scheduling. Filing failure is logged and does not fail the session end; `review_filed_count` stays null so a later finalize retry can file (keys prevent duplicates).
- **Ownership boundary:** the `socratic` module only writes notes through `fileKeyedNotes`; it never writes knowledge bits or cards directly.

## Model tier

- Default: the existing cascade (course tier → subject tier → global tier; global default is `cheap`).
- Escalate by raising the course's tier when persona evaluation shows grading accuracy below target for that course's material. No automatic per-turn escalation in the MVP.

## Bounds

- Same-concept context: last 4 tries. Learner text in the prompt: 4,000 characters. Answered turns per session: 30, then finalize with `end_reason = turn_cap`.
- Retries: existing 2 per call in `generateWithRetry`; global spend guard applies.

## Security

- Learner answer, earlier tries and grounding text are wrapped in named data blocks; the block tag names are stripped from the inserted text first; control characters removed.
- Static instructions first, dynamic content in the user message, no timestamps in instructions (prefix-cache friendly).
- Output is schema-validated; non-REVEAL fields pass the leak guard before leaving the server.
