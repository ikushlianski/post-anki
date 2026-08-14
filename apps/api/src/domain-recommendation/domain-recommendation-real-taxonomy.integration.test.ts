import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// deepen-widen-recommendations (issue #90) — scenarios.md AC 17, the direct
// proof of the issue's own Done-when clause: "a real run against the
// taxonomy + user mastery data produces at least one deepen suggestion and
// one widen suggestion." Seeds the ACTUAL it-taxonomy.yaml (via
// seedDomainTaxonomy, the same fixture seed-domain-taxonomy.integration.test.ts
// uses) into a fresh throwaway Postgres, layers a realistic partial-mastery
// scenario on top (TCP/IP mastered via a real curriculum + topic, DNS left
// uncovered, Networking made "active" via a direct mapping), and calls the
// real orchestrator with zero mocks — this is a synthetic-fixture-free
// proof, not a stand-in for it.
//
// *.integration.test.ts is excluded from the default `npm run test` sweep
// (apps/api/vitest.config.ts) and runnable directly via
// `npx vitest run src/domain-recommendation/domain-recommendation-real-taxonomy.integration.test.ts`.

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

const dbName = `domainrec_realtax_${randomUUID().replace(/-/g, "_")}`;
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

it("a real trigger run over the actual it-taxonomy.yaml tree produces at least one deepen and one widen row (AC 17)", async () => {
  const { getDb } = await import("../db/client.js");
  const { subjects, domainNodes, curricula, curriculumDomainNodeMappings, modules, topics } =
    await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");
  const { seedDomainTaxonomy } = await import("../../scripts/seed-domain-taxonomy.js");
  const { triggerDomainRecommendations } = await import("./domain-recommendation.orchestrator.js");

  const db = getDb();
  const subjectId = newId("sub");

  await db.insert(subjects).values({ id: subjectId, name: `Real taxonomy subject ${subjectId}` });
  await seedDomainTaxonomy(db, subjectId);

  const nodeRows = await db
    .select({ id: domainNodes.id, parentId: domainNodes.parentId, name: domainNodes.name })
    .from(domainNodes)
    .where(eq(domainNodes.subjectId, subjectId));

  const networking = nodeRows.find((row) => row.parentId === null && row.name === "Networking")!;
  const tcpIp = nodeRows.find((row) => row.parentId === networking.id && row.name === "TCP/IP")!;
  const dns = nodeRows.find((row) => row.parentId === tcpIp.id && row.name === "DNS")!;

  expect(networking).toBeTruthy();
  expect(tcpIp).toBeTruthy();
  expect(dns).toBeTruthy();

  async function mapCurriculum(domainNodeId: string, maturity: number): Promise<void> {
    const curriculumId = newId("cur");
    const moduleId = newId("mod");
    const topicId = newId("top");

    await db.insert(curricula).values({ id: curriculumId, subjectId, name: "Real taxonomy curriculum" });
    await db.insert(modules).values({ id: moduleId, curriculumId, title: "Module", order: 0 });
    await db.insert(topics).values({
      id: topicId,
      moduleId,
      curriculumId,
      title: "Topic",
      order: 0,
      included: true,
      progressStatus: maturity >= 100 ? "mastered" : "not_started",
      progressMaturity: maturity,
    });
    await db.insert(curriculumDomainNodeMappings).values({
      id: newId("cdnm"),
      curriculumId,
      domainNodeId,
      status: "confirmed",
      source: "manual",
    });
  }

  // Networking made "active" (a direct mapping, low maturity — only
  // curricula.length matters for widen sourcing); TCP/IP mastered to 100% so
  // its uncovered child DNS becomes a deepen candidate.
  await mapCurriculum(networking.id, 10);
  await mapCurriculum(tcpIp.id, 100);

  const result = await triggerDomainRecommendations(subjectId);

  if ("error" in result) {
    throw new Error(`unexpected error: ${result.error}`);
  }

  const deepenRows = result.filter((row) => row.axis === "deepen");
  const widenRows = result.filter((row) => row.axis === "widen");

  expect(deepenRows.length).toBeGreaterThanOrEqual(1);
  expect(widenRows.length).toBeGreaterThanOrEqual(1);

  expect(deepenRows.some((row) => row.domainNodeId === dns.id && row.sourceNodeId === tcpIp.id)).toBe(
    true,
  );
  expect(widenRows.every((row) => row.sourceNodeId === networking.id)).toBe(true);
}, 60_000);
