---
type: spec
direction: prose-knowledge-fisher
task: tag-taxonomy-cap
stakes-tier: briefed
updated: 2026-09-24
---

# The ask

Give the future prose auto-tagger a single function that assigns a tag to a piece of text by
reusing an existing tag whenever one is close enough in meaning, and only creates a new tag while
the shared taxonomy is under its cap (default 40, configurable 20-50) — never a raw per-bit tag.

# What to do

The real `tags` table (`apps/api/src/db/schema.ts:791`) and its repo
(`apps/api/src/tag/tag.repo.ts`) already exist, with `resolveOrCreateTag` (exact
normalized-name match only), `mergeTags` (human-triggered, via the ontology-merge-log), and no
concept of a taxonomy size cap. No schema change is needed — this is a new read-then-decide
function layered on the existing table, reusing `listTags`/`resolveOrCreateTag`.

Add `assignTagForAutoTag(candidateName: string, context?: string): Promise<Tag>` to
`apps/api/src/tag/tag.repo.ts` (or a sibling `tag-auto-assign.repo.ts` if that keeps the file
under ~150 lines):
1. Normalize `candidateName` the same way `resolveOrCreateTag` does; if it exact-matches an
   existing tag's `normalizedName`, return that tag immediately (cheapest path, no LLM call).
2. Otherwise call `listTags()`. If the taxonomy is under the cap, ask a cheap LLM
   (`tierToModelId("cheap")`, same pattern as `biz-education-distiller`) whether `candidateName`
   is a close-enough match to any existing tag name; a match reuses that tag via
   `resolveOrCreateTag(existingTag.name)`, no match creates a new tag via `resolveOrCreateTag`.
3. If the taxonomy is at or over the cap, skip the "is this genuinely new" branch — force the
   same close-match LLM call to pick the single nearest existing tag, no new-tag option.
4. The taxonomy-size cap is a plain exported constant (`TAG_TAXONOMY_CAP = 40`), not a DB setting
   — no admin UI in this pass.

# Files to touch

- `apps/api/src/tag/tag.repo.ts` (or a new sibling file) — `assignTagForAutoTag`.
- `packages/core/src/tag/` — pure taxonomy-cap check and prompt-input shaping, unit-tested without
  a live DB or LLM call, mirroring `packages/core/src/biz-education-distiller/`'s split.
- No `apps/api/src/db/schema.ts` change, no migration.

Design note (added after review): the at-cap forced-match LLM call happens inside
`resolveTagUnderCapGuard`'s held advisory lock, re-validated against the same fresh tag read — kept
inside the lock rather than done pre-lock, since only a lock-held read is guaranteed current; a
`freshTags[0]` array-order pick is a last-resort fallback only if that forced call itself fails to
return a real tag list member.

# Done when

`assignTagForAutoTag` reuses an exact-name match without any LLM call, reuses a close-meaning
match once the taxonomy is at the cap, and creates a new tag only while under the cap and no close
match exists — covered by scenarios.md.
