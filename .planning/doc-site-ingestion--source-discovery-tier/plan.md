# Show why each source was found

## What and why
`gatherSourceCandidates` already tags every discovered source with a `discoveryTier`
(`llms_txt` / `docs_crawl` / `trusted_search`, at `apps/api/src/curriculum/doc-link-grounding.ts`
and `apps/api/src/curriculum/tech-research-grounding.ts`), but it's dropped the moment a candidate
becomes a pending `sources` row — `insertPendingSources` never receives or stores it. The approval
panel a learner reviews before generation (`apps/web/src/curriculum/source-approval-panel.tsx`)
shows a bare URL/title list with no signal for which candidates are the official docs versus a
generic web-search hit, so there's no way to actually triage what's found.

## Constraints and risks
- `sources` has no `.references()` FK conventions to break — a plain nullable column addition, no
  backfill needed (existing rows simply have no discovery tier, which the FE must render as "no
  info" rather than crash on).
- Migration must be generated via `npm run db:generate:api` then applied via
  `npm run db:migrate:api` — never a hand-written SQL file, never `drizzle-kit migrate` directly.
- `discoveryTier` is currently three different literal string unions across three files
  (`doc-link-grounding.ts`, `tech-research-grounding.ts`, `source-candidates.ts`'s own loose
  `string`) — consolidate into one exported union type in `packages/shared` rather than adding a
  fourth ad hoc string type.

## Phases

### Phase 1: Persist and surface discoveryTier end to end (backend)
Goal: the value survives from discovery through to the API response. Key files:
`apps/api/src/db/schema.ts` (new nullable `discovery_tier` text column on `sources`), a generated
migration under `apps/api/src/db/migrations/`, `apps/api/src/curriculum/source-candidates.ts`
(tighten `GatheredSourceCandidate.discoveryTier` to the shared union), `apps/api/src/curriculum/
curriculum-parse.orchestrator.ts` + `curriculum.repo.ts`'s `insertPendingSources`/`toSource` (thread
the field through insert and read), `packages/shared/src/curriculum.ts` (add `discoveryTier` to the
`Source` type, nullable).

### Phase 2: Show it in the approval panel (frontend)
Goal: each pending source row shows a short, plain-language label for its discovery tier (e.g.
"Official docs", "Site search", "Web search" — never the raw enum value) when present, nothing
extra when absent (pre-migration rows). Key files:
`apps/web/src/curriculum/source-approval-panel.tsx`, its model/type import from
`apps/web/src/curriculum/model.ts`.
