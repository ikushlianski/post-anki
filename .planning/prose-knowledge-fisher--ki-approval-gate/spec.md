---
type: spec
direction: prose-knowledge-fisher
task: "Knowledge-item approval gate"
updated: 2026-10-03
---

# Spec: require learner approval before a knowledge bit is live

## Facts
- `knowledgeBits` (`apps/api/src/db/schema.ts:1099-1170`) has no status/approval column today — every
  bit auto-created by `detectBitsForSource` (`apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts:71`,
  inserting via `knowledge-bit.repo.ts:49/148`) is immediately live: answerable
  (`listNextQuestionVariantsToAnswer`, `knowledge-bit-question-variant.repo.ts:97-178`, joins
  `knowledgeBits` at line 116 with no status filter), chattable (`knowledge-bit-chat.service.ts:33-36`
  only checks existence), and surfaced in search/browse (`search-tag-and-bit.repo.ts:43,99`,
  `list-nodes-by-tag.repo.ts:17`) and the MCP `search-knowledge-items` tool.
- `knowledgeSources.status` already uses `"pending"` to mean "not yet bit-detected" — a same-named
  column on `knowledgeBits` would collide in meaning. Use a different column name.
- `fillBlankGenerationAttempts`/`whQuestionGenerationAttempts`/etc. columns already exist in
  `schema.ts` for the still-unfinished fill-blank unit's Phase 1 — drizzle-kit's migration diff must
  be checked by hand so it only emits the new approval column, not those pre-existing ones.
- No bot/mock-exam/probe path reads `knowledgeBits` — confirmed by grep; this gate only touches the
  prose-knowledge-fisher surfaces listed in Scope.

## Decision made autonomously
Existing bits default to the new column's default value (`pending`), same as every new bit — not
grandfathered as approved. The user's own words ("it should not be able to get into our knowledge
base without being approved") describe every bit ingested with no human check, which includes every
bit already live today. Told the user this in-session before proceeding; logged as the top default
judgment call for this unit.

## Scope
- New column `knowledgeBits.approvalState` (`"pending" | "approved" | "rejected"`, default
  `"pending"`, not null) — one migration, hand-checked to contain only this column.
- Approve/reject/edit endpoints on a knowledge bit:
  - Approve/reject set `approvalState`.
  - Edit on a question variant creates a new variant row and marks the old one superseded (same
    mechanism `listNextQuestionVariantsToAnswer` already uses to skip superseded variants) — never
    an in-place rewrite, to keep any future attempt history honest.
  - Edit on the bit's own body/background text is a plain in-place update — a pending bit has no
    attempts yet, so there's nothing to keep consistent against.
- A shared `bitApproved` predicate (`eq(knowledgeBits.approvalState, "approved")`), same pattern as
  `topicNotDeclined` (`search-tag-and-bit.repo.ts:9`), applied at every learner-facing read:
  - `listNextQuestionVariantsToAnswer` (`knowledge-bit-question-variant.repo.ts`)
  - `knowledge-bit-chat.service.ts` and `knowledge-bit-chat-draft.service.ts`
  - `searchKnowledgeBitsRanked`, `searchByTagNameAcrossNodes` (`search-tag-and-bit.repo.ts`)
  - `listNodesByTagId` (`list-nodes-by-tag.repo.ts`)
  - the MCP `search-knowledge-items` tool (`apps/api/src/mcp/search-knowledge-items.tool.ts`)
  - defensive check in `knowledge-bit-variant-attempt.repo.ts`'s attempt-recording path, so a direct
    call can't record an attempt against an unapproved bit even if a caller bypassed the list
- Background generation (tagging, embedding, wh-question, fill-blank, placement) keeps running for
  `pending` bits — the review screen needs the Q&A to exist before a human can approve it. Only
  `rejected` bits get excluded from future generation claims, to stop spending on content the
  learner already said no to.
- Review screen (new route, reusing the accept/reject-list pattern from
  `placement-suggestions-panel.tsx`): one entry per pending knowledge source's bits — source text,
  each bit's generated Q&A and example, Approve/Reject/Edit per bit.

## Out of scope
- Any change to `knowledgeSources.status` or the source-level pending/detected flow — this unit is
  bit-level only.
- Blocking background generation for `pending` bits (explicitly kept running, see Scope).
- Bulk approve-all — one bit at a time, per the user's own description of the review screen.

## Implementation order (phased — later phases depend on earlier ones existing)
1. **Schema + approve/reject/edit API** — the column, migration (hand-checked diff), the three
   endpoints. Nothing blocks yet — must land before Phase 2, or pasted content would disappear with
   no way to approve it back.
2. **Block every learner-facing surface** — the `bitApproved` predicate applied at all 6 read sites
   listed in Scope, now that an approve path exists to unblock them.
3. **Review screen** — the frontend UI, now that the API it needs is live.
