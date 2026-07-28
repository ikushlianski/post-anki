import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { subjects, domainNodes } from "../db/schema.js";
import { newId } from "../shared/id.js";

// SCENARIO 1 (.planning/seed-knowledge-map/scenarios.md) — seed-domain-nodes.ts
// (apps/api/scripts/seed-domain-nodes.ts, per spec.md's Files-to-touch list)
// mirrors seed-subjects.ts's own precedent: a static tree, no LLM call,
// idempotent by (subjectId, parentId, name) existence check before insert.
// This test proves it against a real, freshly-migrated throwaway Postgres
// database (same technique as db/migrations.integration.test.ts), never the
// shared e2e/dev database.
//
// Deliberately co-located under src/domain-map/ rather than at
// apps/api/scripts/seed-domain-nodes.integration.test.ts (the path
// spec.md's Backend DoD names) — this project's apps/api/vitest.config.ts
// `include` glob is `src/**/*.test.ts` only, so a *.test.ts file living
// under scripts/ is invisible to `npx vitest run <path>` regardless of
// exclude rules (confirmed empirically: "No test files found"). The actual
// seed script itself still lives at apps/api/scripts/seed-domain-nodes.ts,
// exactly where the plan puts it; only this test file's own location moved,
// and it imports the script by relative path below.
//
// RED right now for two independent reasons: the `domainNodes` schema
// export doesn't exist yet (import fails to resolve), and even once it did,
// the migrations folder has no domain_nodes migration to apply — either
// failure is the correct "feature not built" signal.

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

async function createMigratedTestDb(label: string): Promise<{
  dbName: string;
  adminPool: pg.Pool;
  testPool: pg.Pool;
  db: ReturnType<typeof drizzle>;
}> {
  const dbName = `dn_seed_${label}_${randomUUID().replace(/-/g, "_")}`;
  const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);
  const testPool = new pg.Pool({ connectionString: testDatabaseUrl });
  const db = drizzle(testPool);

  await migrate(db, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });

  return { dbName, adminPool, testPool, db };
}

async function dropTestDb(dbName: string, adminPool: pg.Pool, testPool: pg.Pool): Promise<void> {
  await testPool.end();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}

describe("seed-domain-nodes — idempotent starter hierarchy (SCENARIO 1)", () => {
  describe("when 'Programming / Web Development' already exists", () => {
    let dbName: string;
    let adminPool: pg.Pool;
    let testPool: pg.Pool;
    let db: ReturnType<typeof drizzle>;
    let subjectId: string;

    beforeAll(async () => {
      const created = await createMigratedTestDb("present");
      dbName = created.dbName;
      adminPool = created.adminPool;
      testPool = created.testPool;
      db = created.db;

      subjectId = newId("sub");
      await db.insert(subjects).values({
        id: subjectId,
        name: "Programming / Web Development",
      });
    }, 60_000);

    afterAll(async () => {
      await dropTestDb(dbName, adminPool, testPool);
    }, 30_000);

    it("inserts a real, nested starter hierarchy and is a no-op the second time it runs", async () => {
      const { seedDomainNodes } = await import("../../scripts/seed-domain-nodes.js");

      const first = await seedDomainNodes(db);

      expect(first.created).toBeGreaterThan(0);
      expect(first.skipped).toBe(0);

      const rowsAfterFirst = await db
        .select()
        .from(domainNodes)
        .where(eq(domainNodes.subjectId, subjectId));

      expect(rowsAfterFirst).toHaveLength(first.created);
      // Real nesting, not a flat list — at least one node has a non-null
      // parentId (a genuine child of another seeded node, not just a direct
      // child of the subject root).
      expect(rowsAfterFirst.some((row) => row.parentId !== null)).toBe(true);

      const second = await seedDomainNodes(db);

      expect(second.created).toBe(0);
      expect(second.skipped).toBe(first.created);

      const rowsAfterSecond = await db
        .select()
        .from(domainNodes)
        .where(eq(domainNodes.subjectId, subjectId));

      // Idempotency proven at the row-count level, not just the summary
      // line the script prints — no duplicates were actually inserted.
      expect(rowsAfterSecond).toHaveLength(rowsAfterFirst.length);
    });
  });

  describe("when 'Programming / Web Development' does not exist", () => {
    let dbName: string;
    let adminPool: pg.Pool;
    let testPool: pg.Pool;
    let db: ReturnType<typeof drizzle>;

    beforeAll(async () => {
      const created = await createMigratedTestDb("missing");
      dbName = created.dbName;
      adminPool = created.adminPool;
      testPool = created.testPool;
      db = created.db;
    }, 60_000);

    afterAll(async () => {
      await dropTestDb(dbName, adminPool, testPool);
    }, 30_000);

    it("throws loudly and inserts nothing when the prerequisite subject is missing", async () => {
      const { seedDomainNodes } = await import("../../scripts/seed-domain-nodes.js");

      await expect(seedDomainNodes(db)).rejects.toThrow();

      const rows = await db.select().from(domainNodes);

      expect(rows).toHaveLength(0);
    });
  });
});
