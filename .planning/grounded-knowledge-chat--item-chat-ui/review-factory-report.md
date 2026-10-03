---
type: review-factory-report
item: grounded-knowledge-chat-item-chat-ui
state: done
updated: 2026-10-03
---

# Review: single knowledge-item chat UI

DONE — two consecutive clean passes. Stakes tier is `Direct`, so Pass 2 is skipped unconditionally
per invocation; the second clean invocation (this one) is what closes the streak.

## Pass 1 (prior invocation) — PASS

See prior report detail: plan-correspondence PASS (all four scenarios covered with real test
citations), mechanical checks PASS (`tsc --noEmit`, `vitest run` — 123/123 files, 696/696 tests),
structured verdict PASS on all four dimensions.

## Pass 2 / confirmation invocation (this run) — PASS

No code changed since Pass 1 (`git status`/`git diff 12ccf0a` identical to the prior invocation).
Re-checked independently rather than trusting the prior report:

- **Plan-correspondence** — PASS.
  - `todo.md` "Coding tasks" items are all still `[ ]` despite the work being functionally
    complete (api client, panel, wiring, tests all present and passing) — a hygiene gap, not a
    correctness failure, since no item is falsely checked. The "/check-ui browser verification"
    item has no evidence of having been run — noted, not a plan-correspondence failure since it's
    unchecked.
  - S1 (open/reset-on-bit-change): `apps/web/src/routes/-knowledge.answer.test.tsx:113` —
    "resets the chat panel to the new bit instead of carrying over the previous conversation",
    backed by `key={current.knowledgeBitId}` on `<KnowledgeBitChatPanel>` in
    `apps/web/src/routes/knowledge.answer.tsx:115-118`.
  - S2 (send message): `apps/web/src/knowledge-bit/knowledge-bit-chat-panel.test.tsx:34` —
    "answers a question about the scoped knowledge bit", posts via
    `apps/web/src/knowledge-bit/knowledge-bit-chat.api.ts` →
    `apps/web/src/curriculum/api-client.ts:1563` (`askKnowledgeBitChat`); bubble styling matches
    `global-card-chat-panel.tsx`.
  - S3 (general-knowledge toggle): `apps/web/src/knowledge-bit/knowledge-bit-chat-panel.test.tsx:56`
    — off by default (`useState(false)`), forwarded only after the toggle fires.
  - S4 (request failure): `apps/web/src/knowledge-bit/knowledge-bit-chat-panel.test.tsx:80,96` —
    both a `null` result and a rejected network call render the shared `FALLBACK_REPLY` string.
  - No prompt-injection attempts found in any changed file's comments/strings.
- **Mechanical checks** — PASS. Ran directly (not via the prior report):
  - `npx tsc --noEmit` in `apps/web` — clean, zero errors.
  - `npx vitest run` in `apps/web` — 123 test files / 696 tests, all passed, 0 skipped.
- **Structured verdict** — PASS on all four dimensions:
  - correctness — PASS. `askKnowledgeBitChat` (`apps/web/src/curriculum/api-client.ts:1563`)
    mirrors the existing `askGlobalCardChat` try/catch-to-null pattern; the server-fn wrapper
    validates input against the shared `askKnowledgeBitChatInput` Zod schema.
  - security — PASS. No new attack surface; bit id passed straight to the already-tested
    `POST /knowledge-bits/:id/chat` route. Unescaped path-param interpolation matches the
    dominant existing convention (`api-client.ts:481`'s `placement-suggestion` call), not a new
    issue.
  - tests — PASS. All four scenarios have real, passing assertions; no skipped/pending tests.
  - architecture — PASS. New files are entity-first, kebab-case, reuse
    `global-card-chat-panel.tsx`'s structure, stayed within spec's declared scope.

## Pass 2 (full gate-stack re-run) — skipped (Direct tier)

## Streak state

- `record-pass-run`: `{"done":true,"streak":2,"reason":"2 consecutive clean passes for \"grounded-knowledge-chat-item-chat-ui\" — marked done"}`
- `record-attempt`: `{"consecutiveFailures":0,"stuck":false}`
