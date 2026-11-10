# impl-report-1 — Inngest README + dashboard due counts

## Task 1 — Inngest dev UI README

Added a "Local development — Inngest" section to `apps/api/README.md` explaining
how to start the local Inngest server (`npm run inngest:dev` from project root),
where the dev UI lives (http://localhost:8288), and which env vars to set in
`apps/api/.env` to route extractions through it (`DURABLE_EXTRACTION_ENGINE=inngest
DURABLE_EXTRACTION=1`).

Added a conditional log line to `apps/api/src/server.ts` inside the `server.listen`
callback that prints `"Inngest dev UI: http://localhost:8288 (run \`npm run
inngest:dev\`)"` only when `env.INNGEST_DEV === "1"`.

Files changed:
- `apps/api/README.md`
- `apps/api/src/server.ts`

## Task 2 — Dashboard due counts

Skipped. Per-subject due counts are already wired end-to-end: `routes/index.tsx`
loads `subjectDueCounts` via `getSubjectReviewDueCounts`, passes `dueBySubjectId`
down through `DashboardView` → `DashboardSubjectList` → `SubjectTreeItem`, which
renders `<SubjectDueSummary>` when a count is present (line 270 of
`dashboard-subject-list.tsx`).

## Quality gates

- `npx tsc --noEmit -p apps/api/tsconfig.json`: pre-existing errors only (none in
  changed files `server.ts`/`README.md`).
- No lint script defined in `apps/api/package.json`.
- `npx vitest run apps/api/src/server.ts`: no test files for entry-point file
  (expected).

Diff command used: `git diff --cached apps/api/README.md apps/api/src/server.ts`

END-OF-REPORT
