# Spec: create or edit a knowledge item from per-item chat

## The ask
From single-item knowledge-bit chat, let the learner turn a clarifying exchange into a drafted
new item (committed via the existing knowledge-source pipeline) or a drafted revision of the
current item (committed via a new edit endpoint that resets derived state).

## What to do

1. **Shared schema** (`packages/shared/src/knowledge-bit-chat.ts`) — add
   `draftKnowledgeBitChatInput = z.object({ transcript: z.array(chatMessageSchema), mode:
   z.enum(["create", "edit"]) })` and `editKnowledgeBitInput = z.object({ body: z.string().min(1)
   })`.
2. **Draft agent** (`apps/api/src/mastra/knowledge-bit-chat-draft.agent.ts`, new) — no tools ever
   attached, regardless of any request-context flag. Instructions branch on `mode`: `edit` revises
   the existing body to fold in what the transcript clarified; `create` drafts a new, standalone
   item body for what the transcript covered that the existing bit doesn't. Grounded only on the
   bit's own body + transcript — same grounded-only posture as the base chat agent.
3. **Draft service + controller + route** — `apps/api/src/knowledge-bit/knowledge-bit-chat-draft.service.ts`,
   controller, `POST /knowledge-bits/:id/chat/draft`. Returns `{ proposedBody: string }` or
   `{ error: "not_found" }`.
4. **Edit repo function** (`apps/api/src/knowledge-bit/knowledge-bit.repo.ts`, new function
   `updateKnowledgeBitBody(id, body)`) — one transaction: update `body` + reset every derived
   column per plan.md's table, delete `knowledge_bit_question_variants` rows for this bit. Returns
   null if the row doesn't exist.
5. **Edit service + controller + route** — `PATCH /knowledge-bits/:id`, validates `editKnowledgeBitInput`,
   calls the repo function, 404 on missing, 400 on empty body.
6. **Create commit** — no new code. Caller passes the draft's `proposedBody` straight to the
   existing `POST /knowledge-sources`. Document this reuse in this spec, not new code.

## Files by scenario

| Scenario | Files |
|---|---|
| Draft edit-mode / create-mode / not_found / no-tools | `knowledge-bit-chat-draft.agent.ts`, `knowledge-bit-chat-draft.service.ts`, `knowledge-bit-chat-draft.controller.ts`, their `.test.ts` |
| Edit resets embedding/tag/placement, keeps topicId | `knowledge-bit.repo.ts` (`updateKnowledgeBitBody`), its integration test |
| Edit resets wh-question/fill-blank state | same repo function + test |
| Edit deletes stale variant rows | same repo function + test |
| Edit not_found / empty body 400 | `knowledge-bit-edit.controller.ts` (or folded into the bit controller), its `.test.ts` |
| Create reuses POST /knowledge-sources | no new test — existing `knowledge-source.controller.test.ts` coverage already proves this; note only |

## Decisions made autonomously
- Draft and commit are two separate calls, never one — keeps the model's own turn write-free even
  under `allowWebSearch`.
- `topicId` is never reset by an edit — it's confirmed placement, not scan-derived state.
- No new "create" endpoint — `POST /knowledge-sources` already accepts arbitrary text.
