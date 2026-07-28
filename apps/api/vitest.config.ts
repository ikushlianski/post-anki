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
    exclude: ["**/node_modules/**", "src/**/*.integration.test.ts"],
  },
});
