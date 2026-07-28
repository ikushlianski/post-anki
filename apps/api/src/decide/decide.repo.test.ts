import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIOS 2 and 3 (.planning/decide-mode/scenarios.md) — decide.repo.ts's
// insertDecideSession / listDecideSessions / updateDecideBlindSpotStatus
// (apps/api/src/decide/decide.repo.ts, per spec.md's Files-touched list),
// mirroring writing-check.repo.ts's shape for insert/list and
// resolvePrioritySuggestion's transaction shape for the accept/reject
// update. Uses the same fresh-migrated-throwaway-Postgres technique as
// decide.orchestrator.test.ts and domain-priority-review.orchestrator.test.ts
// — real inserts/selects, not a mocked repo shape, because ordering and
// nested-attribution claims can only be proven against real rows.
//
// Kept at this exact path (not *.integration.test.ts) because spec.md's DoD
// pins the precise command
// `npx vitest run apps/api/src/decide/decide.orchestrator.test.ts
// apps/api/src/decide/decide.repo.test.ts`; vitest.config.ts's exclude list
// carries this filename as a named exception.
//
// RED right now: apps/api/src/decide/decide.repo.ts does not exist (import
// fails to resolve), and decide_sessions/decide_blind_spots don't exist as
// tables — every assertion below is unreachable until those are built.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `decide_repo_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const migratePool = new pg.Pool({ connectionString: testDatabaseUrl });
  const migrateDb = drizzle(migratePool);

  await migrate(migrateDb, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await migratePool.end();

  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.OPENROUTER_API_KEY = "e2e-dummy-key";
}, 60_000);

afterAll(async () => {
  const { closeDb } = await import("../db/client.js");
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 30_000);

describe("listDecideSessions — SCENARIO 2 (newest-first, blind spots nested and correctly attributed)", () => {
  it("returns sessions ordered created_at DESC, each carrying only its own blind spots", async () => {
    const { insertDecideSession } = await import("./decide.repo.js");
    const { newId } = await import("../shared/id.js");

    const sessionA = await insertDecideSession({
      id: newId("decidesession"),
      decision: "Session A — repo ordering test",
      opinion: "Opinion A",
      verdict: "Verdict A",
      strengths: ["Strength A"],
      questions: ["Question A"],
      blindSpots: ["Blind spot A1", "Blind spot A2"],
    });

    // Ensure a strictly later createdAt than session A even under a
    // low-resolution clock (documented near-simultaneous-insert collision
    // risk elsewhere in this project's stub-mode e2e runs).
    await new Promise((resolve) => setTimeout(resolve, 10));

    const sessionB = await insertDecideSession({
      id: newId("decidesession"),
      decision: "Session B — repo ordering test",
      opinion: "Opinion B",
      verdict: "Verdict B",
      strengths: ["Strength B"],
      questions: ["Question B"],
      blindSpots: ["Blind spot B1"],
    });

    const { listDecideSessions } = await import("./decide.repo.js");
    const all = await listDecideSessions();

    const indexA = all.findIndex((s) => s.id === sessionA.id);
    const indexB = all.findIndex((s) => s.id === sessionB.id);

    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThanOrEqual(0);
    // B was inserted later, so it must render before A — newest first.
    expect(indexB).toBeLessThan(indexA);

    const foundA = all.find((s) => s.id === sessionA.id)!;
    const foundB = all.find((s) => s.id === sessionB.id)!;

    expect(foundA.blindSpots.map((b) => b.description).sort()).toEqual(
      ["Blind spot A1", "Blind spot A2"].sort(),
    );
    expect(foundB.blindSpots.map((b) => b.description)).toEqual(["Blind spot B1"]);

    // Cross-attribution guard: session A's blind spots never leak into B's.
    expect(foundB.blindSpots.some((b) => b.description.startsWith("Blind spot A"))).toBe(false);
    expect(foundA.blindSpots.some((b) => b.description.startsWith("Blind spot B"))).toBe(false);
  });
});

describe("updateDecideBlindSpotStatus — SCENARIO 3 (accept/reject touches only the targeted row)", () => {
  it("sets status and a non-null resolvedAt on the targeted blind spot only", async () => {
    const { insertDecideSession, updateDecideBlindSpotStatus } = await import("./decide.repo.js");
    const { newId } = await import("../shared/id.js");

    const session = await insertDecideSession({
      id: newId("decidesession"),
      decision: "Session under blind-spot-update test",
      opinion: "Opinion",
      verdict: "Verdict",
      strengths: [],
      questions: [],
      blindSpots: ["Target blind spot", "Untouched sibling blind spot"],
    });

    const target = session.blindSpots.find((b) => b.description === "Target blind spot")!;
    const sibling = session.blindSpots.find(
      (b) => b.description === "Untouched sibling blind spot",
    )!;

    const updated = await updateDecideBlindSpotStatus(target.id, "accepted");

    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("accepted");
    expect(updated!.resolvedAt).not.toBeNull();

    const { listDecideSessions } = await import("./decide.repo.js");
    const refreshed = (await listDecideSessions()).find((s) => s.id === session.id)!;

    const refreshedTarget = refreshed.blindSpots.find((b) => b.id === target.id)!;
    const refreshedSibling = refreshed.blindSpots.find((b) => b.id === sibling.id)!;

    expect(refreshedTarget.status).toBe("accepted");
    expect(refreshedTarget.resolvedAt).not.toBeNull();
    expect(refreshedSibling.status).toBe("pending");
    expect(refreshedSibling.resolvedAt).toBeNull();
  });

  it("returns null for a non-existent blind-spot id, mirroring resolvePrioritySuggestion's not-found shape", async () => {
    const { updateDecideBlindSpotStatus } = await import("./decide.repo.js");

    const result = await updateDecideBlindSpotStatus("decideblindspot_does_not_exist", "rejected");

    expect(result).toBeNull();
  });
});
