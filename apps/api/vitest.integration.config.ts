import { defineConfig } from "vitest/config";

// Dedicated config for *.integration.test.ts files (real Postgres — the e2e
// docker-compose DB on localhost:5436 — never mocked). Split out from
// vitest.config.ts because this project's default config's own `exclude`
// deliberately keeps these out of the fast `npm run test` sweep, and this
// vitest version's CLI `--exclude` flag is additive-only (confirmed
// empirically: it appends to, never replaces, the config's exclude list),
// so there is no way to run an individual *.integration.test.ts file via
// `npx vitest run <path>` against the default config alone. Run via
// `npx vitest run --config vitest.integration.config.ts <path>` or
// `npm run test:integration -- <path>`.
//
// `npm run test:all -w @post-anki/api` is the full verification pass (fast
// sweep, then these). It is deliberately NOT what root `npm test` runs: that
// fans out to every workspace and is what CI's Test job invokes, and CI has
// no Postgres service — folding these into `test` would break the pipeline
// and make a checkout without `npm run e2e:db:up` fail confusingly.
export default defineConfig({
  test: {
    include: [
      "src/**/*.integration.test.ts",
      // ai-duplicate-detection (issue #63) — same named-exception shape as
      // decide.repo.test.ts/domain-priority-review.orchestrator.test.ts
      // (real Postgres, DB partial unique index + cross-table transaction
      // behavior that only a real connection can prove), listed here
      // explicitly rather than renamed to *.integration.test.ts because
      // spec.md's Backend DoD pins these two exact paths.
      "src/subject-duplicate/subject-duplicate.orchestrator.test.ts",
      "src/subject-duplicate/subject-duplicate.repo.test.ts",
      // Same named-exception shape, and the same reason they belong here:
      // each is pinned by its own spec.md's Backend Definition of Done to a
      // path that is not *.integration.test.ts, and each needs a real
      // Postgres connection. They were named in vitest.config.ts's `exclude`
      // without ever being added here, so until now they ran under neither
      // config — silently not executing rather than failing.
      "src/decide/decide.orchestrator.test.ts",
      "src/decide/decide.repo.test.ts",
      "src/domain-map/doc-scan.orchestrator.test.ts",
      "src/domain-map/domain-priority-review.orchestrator.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
