# Remove Notion ingestion

Goal
- PostAnki no longer pulls knowledge from Notion: no Notion sources, no Notion connection, no scheduled Notion runs, no "ingest from Notion" buttons, in API, web and native apps.

Where (verified)
- API: `apps/api/src/notion-ingestion/` (whole module), `apps/api/src/knowledge-source/notion-knowledge-source.controller.ts`, Notion routes in `apps/api/src/router-table.ts:21-32`, wiring in `router.ts` / `api-server.ts`, `subject/subject-notion-sources.error.ts` + its use in `subject.controller.ts`, Notion env in `shared/env.ts`.
- Scripts: `apps/api/scripts/notion-sources-run.ts`, `register-notion-source.ts` (and their package.json entries).
- Infra: `infra/index.ts:44,488-531` — `notion-source-tick` Cloud Scheduler job + export.
- Web: `apps/web/src/notion-source/`, `apps/web/src/routes/notion-sources.tsx` (+ test), nav links to it.
- Native: `apps/ios/Sources/Shared/notion-*.swift`, `NotionImportModel.swift`, `NotionImportScreen.swift`, `triage-notion-ingest-sheet.swift`, `onIngestFromNotion` in `PendingReviewScreen+content.swift`, `PostAnkiMac/Library/MacNotion*View.swift`, `MacLibraryFeatures.swift:69,78`, `MacSettingsView.swift:81`, `TriageNotionText` hint in `MacKnowledgeView.swift:202`; API client `Packages/PostAnkiAPI/.../APIClient+Notion*.swift`, `Notion*Models.swift` + decoding test.

Scope
- In: delete the code paths, routes, UI, scheduler job, tests; update docs that describe Notion ingestion.
- Out (kept): `apps/api/src/notion-connector/` (reading-notes router to project todos), `apps/api/src/biz-education-distiller/` (reads a biz-education Notion DB into facts/content inbox, scheduled by `biz-education-distill` in `infra/index.ts`) — separate pipeline, not knowledge sources. Existing `kind: notion` knowledge sources and their cards stay; DB columns/tables stay (no destructive migration).

Done when
- `npx tsc --noEmit`, api + web vitest for touched areas, `swift build`/`scripts/run-mac.sh --test` pass; `grep -ri notion` in the removed areas returns only kept modules; Pulumi preview shows the tick job deleted.

Assumptions
- Notion connector and biz-education distiller stay (the distiller is also Notion-fed: confirm whether it goes too).
- Old Notion-born cards are kept as normal cards.
