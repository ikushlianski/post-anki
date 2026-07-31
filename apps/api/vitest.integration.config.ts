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
export default defineConfig({
  test: {
    include: [
      "src/**/*.integration.test.ts",
      // Named exceptions (see vitest.config.ts's own exclude list for why
      // these aren't *.integration.test.ts-named): real-Postgres repo/
      // orchestrator tests whose spec.md pins the exact path as the DoD
      // proof command. `npx vitest run <path>` against the DEFAULT config
      // can't reach them (CLI args don't override a configured `exclude` in
      // this vitest version — confirmed empirically); this dedicated
      // integration config is the one place they're actually runnable.
      "src/curriculum/curriculum.repo.test.ts",
      "src/curriculum/course-refocus.repo.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
