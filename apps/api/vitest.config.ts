import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // *.integration.test.ts files hit a real Postgres instance (the e2e
    // docker-compose DB on localhost:5436) and must never run as part of the
    // default fast `npm run test` pass — every other test in this project is
    // pure/mocked. Excluded here from the broad `vitest run` sweep; still
    // runnable directly via `npx vitest run <path>` (an explicit CLI path
    // bypasses `exclude`, confirmed empirically), which is how the dedicated
    // integration-test commands in the plan's Definition of Done invoke them.
    exclude: [
      "**/node_modules/**",
      "src/**/*.integration.test.ts",
      // domain-priority-review.orchestrator.test.ts is a named exception to
      // the *.integration.test.ts-only rule above: spec.md's Definition of
      // Done pins this exact file+path (not *.integration.test.ts) as the
      // SCENARIO 4/8 proof command, and requires a real SELECT against
      // domain_priority_suggestions, which only a real Postgres connection
      // (not the mocked-repo shape every other *.orchestrator.test.ts here
      // uses) can produce. Excluded by exact name so it still doesn't leak
      // into this fast, DB-free sweep — same reasoning as the glob above,
      // just naming a single file instead of a pattern.
      "src/domain-map/domain-priority-review.orchestrator.test.ts",
      // decide.orchestrator.test.ts / decide.repo.test.ts (decide-mode) are
      // the same named exception, for the same reason: spec.md's Backend DoD
      // pins these two exact paths (not *.integration.test.ts) as the
      // ordering/nested-attribution/502-mapping proof command, which
      // requires a real Postgres connection.
      "src/decide/decide.orchestrator.test.ts",
      "src/decide/decide.repo.test.ts",
      // doc-scan.orchestrator.test.ts is the same named exception, for the
      // same reason: spec.md's Backend DoD pins this exact path (not
      // *.integration.test.ts) as the SCENARIO 2/3/4/10 proof command,
      // requiring real SELECTs against 3 new tables that only a real
      // Postgres connection can produce.
      "src/domain-map/doc-scan.orchestrator.test.ts",
      // subject-duplicate.orchestrator.test.ts / subject-duplicate.repo.test.ts
      // (ai-duplicate-detection, issue #63) are the same named exception,
      // for the same reason: spec.md's Backend DoD pins these two exact
      // paths (not *.integration.test.ts) as the proof commands, requiring
      // a real Postgres connection (the DB partial unique index, SCENARIO
      // 8b, and the cross-table transaction behavior, SCENARIO 4/5b, can
      // only be proven against a real connection).
      "src/subject-duplicate/subject-duplicate.orchestrator.test.ts",
      "src/subject-duplicate/subject-duplicate.repo.test.ts",
      // curriculum-domain-mapping.orchestrator.test.ts (decouple-curricula-
      // from-domain-nodes, issue #84) is the same named exception, for the
      // same reason: the plan's own Definition of Done pins this exact path
      // (not *.integration.test.ts) as the hallucinated-node-id proof
      // command, requiring a real Postgres connection (the same pattern
      // domain-priority-review.orchestrator.test.ts already established).
      "src/curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.test.ts",
    ],
  },
});
