import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// deepen-widen-recommendations (issue #90) — scenarios.md ACs 11, 12.
//
// AC 11: domain_recommendations_subject_node_unique is a TRUE (non-partial)
// unique index on (subject_id, domain_node_id) — proven with a raw second
// insert bypassing the orchestrator's own existence check, for a node that
// already has a row in EACH of the three statuses.
//
// AC 12: status defaults "pending"; the claim-first resolve clause is
// WHERE status = 'pending', matching domain_priority_suggestions'
// vocabulary, not curriculum_domain_node_mappings' 'suggested'.
//
// Touches a real, freshly-migrated throwaway Postgres (same pattern as
// domain-priority-review.orchestrator.test.ts) because AC 11 requires
// proving a real DB-level unique-index violation, which a mocked-repo shape
// can't produce. Named exception in apps/api/vitest.config.ts's exclude
// list, same reasoning as that file's own comment.

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

const dbName = `domainrec_repo_${randomUUID().replace(/-/g, "_")}`;
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

async function seedSubjectAndNode(): Promise<{ subjectId: string; domainNodeId: string }> {
  const { getDb } = await import("../db/client.js");
  const { subjects, domainNodes } = await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const subjectId = newId("sub");
  const domainNodeId = newId("dnode");

  await db.insert(subjects).values({ id: subjectId, name: `Repo test subject ${subjectId}` });
  await db.insert(domainNodes).values({
    id: domainNodeId,
    subjectId,
    parentId: null,
    name: "Node under test",
    order: 0,
    source: "static_taxonomy",
  });

  return { subjectId, domainNodeId };
}

describe("domain_recommendations — true unique index on (subject_id, domain_node_id) (AC 11)", () => {
  it.each(["pending", "accepted", "rejected"] as const)(
    "rejects a second raw insert for the same node while the existing row is %s",
    async (existingStatus) => {
      const { insertRecommendation } = await import("./domain-recommendation.repo.js");
      const { subjectId, domainNodeId } = await seedSubjectAndNode();

      const first = await insertRecommendation({
        subjectId,
        domainNodeId,
        sourceNodeId: domainNodeId,
        axis: "deepen",
        reason: "first row",
        source: "structural",
      });

      if (existingStatus !== "pending") {
        const { getDb } = await import("../db/client.js");
        const { domainRecommendations } = await import("../db/schema.js");

        await getDb()
          .update(domainRecommendations)
          .set({ status: existingStatus, resolvedAt: new Date() })
          .where(eq(domainRecommendations.id, first.id));
      }

      // Raw second insert, bypassing the orchestrator's own existence check
      // entirely — this is what proves the DB-level constraint itself, not
      // just the application-level guard in front of it.
      await expect(
        insertRecommendation({
          subjectId,
          domainNodeId,
          sourceNodeId: domainNodeId,
          axis: "widen",
          reason: "second row, should be rejected by the index",
          source: "structural",
        }),
      ).rejects.toThrow();
    },
  );

  it("allows a row for the same domain node in a DIFFERENT subject", async () => {
    const { insertRecommendation } = await import("./domain-recommendation.repo.js");
    const { subjectId: subjectA, domainNodeId } = await seedSubjectAndNode();
    const { subjectId: subjectB } = await seedSubjectAndNode();

    await insertRecommendation({
      subjectId: subjectA,
      domainNodeId,
      sourceNodeId: domainNodeId,
      axis: "deepen",
      reason: "subject A row",
      source: "structural",
    });

    await expect(
      insertRecommendation({
        subjectId: subjectB,
        domainNodeId,
        sourceNodeId: domainNodeId,
        axis: "deepen",
        reason: "subject B row, same node id, different subject",
        source: "structural",
      }),
    ).resolves.toBeDefined();
  });
});

describe("domain_recommendations — status defaults 'pending', claim-first resolve (AC 12)", () => {
  it("defaults a freshly inserted row to status 'pending'", async () => {
    const { insertRecommendation } = await import("./domain-recommendation.repo.js");
    const { subjectId, domainNodeId } = await seedSubjectAndNode();

    const row = await insertRecommendation({
      subjectId,
      domainNodeId,
      sourceNodeId: domainNodeId,
      axis: "deepen",
      reason: "defaults check",
      source: "structural",
    });

    expect(row.status).toBe("pending");
    expect(row.resolvedAt).toBeNull();
  });

  it("claims a pending row, sets resolvedAt, and refuses a second claim with already_resolved", async () => {
    const { insertRecommendation, resolveRecommendationClaim } = await import(
      "./domain-recommendation.repo.js"
    );
    const { subjectId, domainNodeId } = await seedSubjectAndNode();

    const row = await insertRecommendation({
      subjectId,
      domainNodeId,
      sourceNodeId: domainNodeId,
      axis: "deepen",
      reason: "claim check",
      source: "structural",
    });

    const claimed = await resolveRecommendationClaim(row.id, "rejected");

    expect("error" in claimed).toBe(false);
    if (!("error" in claimed)) {
      expect(claimed.status).toBe("rejected");
      expect(claimed.resolvedAt).not.toBeNull();
    }

    const second = await resolveRecommendationClaim(row.id, "accepted");

    expect(second).toEqual({ error: "already_resolved" });
  });

  it("returns not_found for a claim against a nonexistent id", async () => {
    const { resolveRecommendationClaim } = await import("./domain-recommendation.repo.js");

    const result = await resolveRecommendationClaim("domainrec_does_not_exist", "accepted");

    expect(result).toEqual({ error: "not_found" });
  });
});
