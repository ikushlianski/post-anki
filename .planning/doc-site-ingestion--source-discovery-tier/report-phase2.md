# Phase 2 report — Show discovery tier in the approval panel

## Verdict

Shipped. Frontend-only; no `apps/api` file touched.

## What changed

- `apps/web/src/curriculum/model.ts` — added a local `sourceDiscoveryTierSchema`
  (`llms_txt | docs_crawl | trusted_search`) and `SourceDiscoveryTier` type, plus
  `discoveryTier: sourceDiscoveryTierSchema.nullable()` on `sourceSchema`. Follows the
  file's existing self-contained-mirror convention (same as `sourceKindSchema` /
  `sourceApprovalStatusSchema`), not an import from `@post-anki/shared`.
- `apps/web/src/curriculum/source-approval-panel.tsx` — each pending-source row now shows a
  small `badge-neutral` pill next to the title: `Official docs` (`llms_txt`), `Docs site`
  (`docs_crawl`), `Web search` (`trusted_search`). Null `discoveryTier` renders nothing.
- `apps/web/src/curriculum/source-approval-panel.test.tsx` — existing fixtures gained
  `discoveryTier: null` (required key after the schema change); added a
  `SourceApprovalPanel.discoveryTier` describe covering the `llms_txt` label and the
  null/no-label case.

## Verification

- `npx tsc --noEmit` in `apps/web` — clean, no output.
- `npx vitest run src/curriculum/source-approval-panel.test.tsx` — 6 passed.

## Not done

`SourceDraft` was intentionally left untouched: discovery tier is a discovery-time value,
never user-supplied on manual add, matching the shared package's own `sourceDraftSchema`.
