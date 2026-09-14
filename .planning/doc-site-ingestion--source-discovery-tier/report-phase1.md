# Phase 1 — Persist and surface discoveryTier end to end (backend)

## Verdict

Shipped. `discoveryTier` now survives from candidate gathering through the `sources` row and back
out on the `Source` object, with legacy rows reading as `null`.

## What changed

- One shared union type, `SourceDiscoveryTier` (`"llms_txt" | "docs_crawl" | "trusted_search"`),
  now lives in `packages/shared/src/source.ts` alongside the other source-related types
  (`sourceKindSchema`, `sourceApprovalStatusSchema`) rather than in `curriculum.ts`, which only
  imports/re-exports them. Derived via `sourceDiscoveryTierSchema` (zod enum), matching the file's
  existing `SourceKind`/`SourceApprovalStatus` convention.
- The three ad hoc string typings are gone: `DocSiteCandidate.discoveryTier`,
  `TrustedSourceCandidate.discoveryTier`, and `GatheredSourceCandidate.discoveryTier` all type as
  `SourceDiscoveryTier`.
- `Source` (shared `sourceSchema`) gains `discoveryTier: SourceDiscoveryTier | null` — required in
  the schema shape, nullable so a pre-migration source is representable.

## Key pieces

- Schema column: `apps/api/src/db/schema.ts:376` — `discoveryTier: text("discovery_tier")`,
  plain nullable text, no pg enum, no backfill.
- Migration: `apps/api/src/db/migrations/0052_cute_starbolt.sql`
  (`ALTER TABLE "sources" ADD COLUMN "discovery_tier" text;`), generated with
  `npm run db:generate:api` and applied with `npm run db:migrate:api` (dev DB on localhost:5562).
- Shared union + Source field: `packages/shared/src/source.ts:13` and `:22`.
- `insertPendingSources`: `apps/api/src/curriculum/curriculum.repo.ts:1497`; draft field at
  `:1494` (optional), insert value at `:1515` (`d.discoveryTier ?? null`).
- `toSource`: `apps/api/src/curriculum/curriculum.repo.ts:2266`, field at `:2274`
  (`row.discoveryTier as SourceDiscoveryTier | null`); exported so a unit test can reach it.
- Call-site threading: `apps/api/src/curriculum/curriculum-parse.orchestrator.ts:157`
  (`discoveryTier: c.discoveryTier`).

## Verification

- `npx tsc --noEmit` clean for `apps/api`, `packages/core`, `packages/shared`.
- New `apps/api/src/curriculum/curriculum.repo.test.ts` (4 tests) covers the round-trip: a
  non-null tier survives `toSource`, a legacy `null` maps to `null` without throwing, and
  `insertPendingSources` persists a provided tier vs stores `null` when omitted. All pass.
- Existing unit suites touching these modules pass (116 tests across curriculum-structure,
  tech-research-grounding, curriculum.controller, curriculum-prompt, curriculum-rules).

## Notes / not done

- Integration suites (`*.integration.test.ts`) were not run: they need the e2e Postgres on
  localhost:5578, which is down in this environment.
- Backend-only per scope: no frontend file touched. Phase 2 (approval-panel labels) is out of
  scope for this dispatch.
