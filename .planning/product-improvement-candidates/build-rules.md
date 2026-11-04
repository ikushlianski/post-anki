# Build rules for the improvement items

- Repo /Users/ikushlianski/webdata/ilya-projects/post-anki (monorepo: apps/api, apps/web, packages/shared, apps/extension).
- The working tree holds ~150 unrelated uncommitted edits. Keep them intact. Do not stage, commit or revert anything.
- Dev servers run with hot reload; leave them alone.
- Style: match surrounding code. Zod, no `any`, comments only if needed and at most 2 lines, padding lines around blocks, kebab-case entity-specific filenames, files under 300 lines.
- Tests: vitest and react-testing-library, co-located, describe/it "should ...", names state the business guarantee, vi.mocked over casts. Run `npx vitest run <paths>` from the package dir, never npm test.
- Migrations: change apps/api/src/db/schema.ts, generate with the project's generate script (see apps/api/package.json), apply with `npm run db:migrate:api` from the repo root. Never push schema directly.
- Run `npx tsc --noEmit` once at the end in each package you touched and fix your errors.
- Batch independent tool calls. Never use AskUserQuestion: pick the pattern-following default and note it.
- Report: write impl-report.md in the item's plan folder with files changed, behavior, test commands with pass/fail counts, tsc results, defaults, anything undone, and one file:line citation that satisfies the item. Last line exactly END-OF-REPORT. Return only the path plus a 2-sentence summary.
