---
type: plan
item: review-placement-suggestions
direction: prose-knowledge-fisher
stakes-tier: Guarded
---

# Review and act on a knowledge bit's placement suggestion

## The ask

A knowledge bit with a `placementSuggestion` (no matched topic) sits unresolved forever today —
nothing ever turns that free-text suggestion into a real topic or dismisses it. This item adds the
accept/reject review step: an admin sees each pending suggestion, either accepts it (creating a
real topic under a module they pick, and matching the bit to it) or rejects it (dismissing the
suggestion, bit stays unplaced). Completes "Suggest a new hierarchy spot when no existing topic
fits a bit" — the capture half already shipped as `knowledgeBits.placementSuggestion`.

## Existing infrastructure (from research — reuse, do not rebuild)

- `domainTopicSuggestions`' claim-then-act accept/reject pattern
  (`apps/api/src/domain-map/domain-map.repo.ts:752-824`): a conditional
  `UPDATE ... WHERE status = 'pending'` claims the row before acting, returning
  `already_resolved` (409) on a second attempt instead of double-creating. Copy this shape, not
  `domainTopicSuggestions`' advisory subject-lock (that's for concurrent-suggestion write
  contention on one subject; a single `knowledgeBits` row's own conditional UPDATE is enough here).
- `createTopic` (`apps/api/src/topic/topic.repo.ts:45`) — the only public entry point for a new
  topic row: takes `{moduleId, title, summary?, suggestedDepth?}`, resolves `curriculumId` from
  the module, auto-orders. **No `createModule`/`createCurriculum` call from this item** — the admin
  picks an existing module (see Non-goals).
- `PriorityReviewPanel` (`apps/web/src/domain-map/priority-review-panel.tsx:109-149`,
  `resolveNewTopic`) — the accept/reject UI shape to copy: optimistic remove-from-list on any
  resolution (including `already_resolved`, since the row is decided either way), a transient
  confirmation banner on accept, row stays in the list to retry on a genuine failure.
- REST convention for this kind of action: `PATCH /{resource}/:id` with `{status: "accepted" |
  "rejected"}` body, same Bearer/API-token `authorized()` gate as every other route
  (`apps/api/src/server.ts:250-275`).

## Design

1. **Schema — one nullable column** on `knowledgeBits`: `placementSuggestionResolvedAt: timestamp
   ("placement_suggestion_resolved_at", { withTimezone: true })`. A pending suggestion is
   `placementSuggestion IS NOT NULL AND topicId IS NULL AND placementSuggestionResolvedAt IS NULL`
   — no separate status enum needed, mirrors the existing `*CheckedAt`/`*FailedAt` nullable-
   timestamp convention already used on this same table. Generate + apply migration.
2. **Repo** — new functions in `knowledge-bit-placement.repo.ts`:
   `listPendingPlacementSuggestions(limit, db?)` (the three-condition filter above, newest first),
   `resolvePlacementSuggestion(bitId, decision: "accepted" | "rejected", moduleId?, title?, db?)`:
   - Conditional claim: `UPDATE knowledge_bits SET placement_suggestion_resolved_at = now() WHERE
     id = $1 AND placement_suggestion IS NOT NULL AND topic_id IS NULL AND
     placement_suggestion_resolved_at IS NULL RETURNING *`. No row claimed → `{error:
     "already_resolved"}` if the bit exists, `{error: "not_found"}` if it doesn't (same two-error
     shape as `resolveDomainTopicSuggestion`).
   - `"rejected"` → claim alone is the whole action, return the resolved bit.
   - `"accepted"` → after the claim, call `createTopic({moduleId, title})`. `moduleId` not
     resolving to a real module → roll the claim back (clear `placementSuggestionResolvedAt`
     again) and return `{error: "module_not_found"}`, never leave the bit claimed with no topic.
     On success, set `topicId` to the new topic's id in the same call (bit is now both matched and
     resolved).
3. **Route** — `GET /knowledge-bits/placement-suggestions` (list, same auth as every other
   knowledge-bit route) and `PATCH /knowledge-bits/:id/placement-suggestion` (body:
   `{status: "accepted" | "rejected", moduleId?: string, title?: string}` — `moduleId`/`title`
   required only when `status === "accepted"`, validated in the handler before calling the repo).
4. **Frontend** — a new panel (co-located under `apps/web/src/knowledge-bit/` — a new folder for
   this direction's own frontend, not added to `domain-map/`) listing pending suggestions with a
   module picker (reuse whatever existing module-listing API/select the topic-creation admin flow
   already uses) and an editable title field defaulted from the suggestion text, plus accept/reject
   buttons copying `resolveNewTopic`'s optimistic-remove-and-confirm shape. Mounted on the existing
   `/admin-settings` page as a new section (reuses that page's existing auth-gated shell, no new
   route needed).

## Non-goals (Guarded tier — explicit)

- **No automatic module/curriculum creation from this flow.** The admin picks an existing module;
  if none fits, they use the existing module-creation UI first, then come back — same boundary
  `domainTopicSuggestions` draws for domain nodes (it never auto-creates a subject either).
- **No re-running the placer agent on reject.** A rejected bit stays permanently unplaced — same
  terminal-state treatment as `placementFailedAt`, no automatic retry loop.
- **No bulk accept/reject.** One suggestion resolved at a time, same as the existing doc-scan
  suggestion panel.

## Rollback note

Additive: one new nullable column (no FK), two new repo functions in an existing file, two new
routes, one new frontend panel + its own small API client file. Revert by dropping the migration,
removing the route entries, and removing the panel's mount point from the admin-settings page.
