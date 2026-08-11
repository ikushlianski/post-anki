import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Real Postgres (the e2e docker-compose DB on localhost:5436, never mocked)
// — SCENARIO 12's claim-first "WHERE status = 'suggested'" guard only means
// anything against a real engine's row-level locking and READ COMMITTED
// re-check, same reasoning as suggestion-double-resolve.integration.test.ts.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

// A dedicated, freshly-migrated throwaway Postgres database — never the
// shared e2e/dev database BASE_DATABASE_URL resolves to — so this file never
// leaves fixture rows behind in a database a developer might also be pointing
// DATABASE_URL at for unrelated local work (e.g. `npm run dev`). Same pattern
// as db/migrations.integration.test.ts and seed-domain-nodes.integration.test.ts.
function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `cdnm_repo_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const {
  insertSuggestedMappings,
  insertConfirmedMapping,
  listMappingsForCurriculum,
  resolveMapping,
  deleteMappingsForCurriculum,
  getPrimaryConfirmedDomainNodeId,
  getPrimaryConfirmedDomainNodeIdsByCurriculumIds,
  rejectAllConfirmedForCurriculum,
  findCurriculumMappedToNode,
} = await import("./curriculum-domain-mapping.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function insertSubject(subjectId: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `cdnm repo subject ${subjectId}`],
  );
}

async function insertDomainNode(nodeId: string, subjectId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source) VALUES ($1, $2, NULL, $3, 0, 'static_taxonomy')`,
    [nodeId, subjectId, name],
  );
}

async function insertCurriculum(curriculumId: string, subjectId: string): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    `curriculum ${curriculumId}`,
  ]);
}

describe("insertSuggestedMappings — dedup against an already-pending or already-confirmed pair", () => {
  it("skips inserting a duplicate suggestion for a (curriculum, node) pair that already has a non-rejected row", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Existing Node");
    await insertCurriculum(curriculumId, subjectId);

    const first = await insertSuggestedMappings(curriculumId, [{ nodeId, depth: "working" }]);
    expect(first).toHaveLength(1);

    const second = await insertSuggestedMappings(curriculumId, [{ nodeId, depth: "deep" }]);
    expect(second).toHaveLength(0);

    const all = await listMappingsForCurriculum(curriculumId);
    expect(all).toHaveLength(1);
  });
});

describe("resolveMapping — SCENARIO 12, concurrent accept/reject on the same suggestion", () => {
  it("exactly one of two simultaneous resolutions succeeds; the other gets already_resolved, never a duplicate write", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Race Node");
    await insertCurriculum(curriculumId, subjectId);

    const [inserted] = await insertSuggestedMappings(curriculumId, [{ nodeId, depth: "working" }]);
    const mappingId = inserted!.id;

    const [resultA, resultB] = await Promise.all([
      resolveMapping(mappingId, { status: "confirmed" }),
      resolveMapping(mappingId, { status: "rejected" }),
    ]);

    const outcomes = [resultA, resultB];
    const succeeded = outcomes.filter((o) => !("error" in o));
    const failed = outcomes.filter((o) => "error" in o);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as { error: string }).error).toBe("already_resolved");

    const { getDb } = await import("../db/client.js");
    const { curriculumDomainNodeMappings } = await import("../db/schema.js");
    const { eq } = await import("drizzle-orm");
    const db = getDb();

    const rows = await db
      .select()
      .from(curriculumDomainNodeMappings)
      .where(eq(curriculumDomainNodeMappings.id, mappingId));

    expect(rows).toHaveLength(1);
    expect(["confirmed", "rejected"]).toContain(rows[0]!.status);
  });

  it("accepting with a depth override persists the override, not the originally suggested depth", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Depth Override Node");
    await insertCurriculum(curriculumId, subjectId);

    const [inserted] = await insertSuggestedMappings(curriculumId, [{ nodeId, depth: "awareness" }]);

    const resolved = await resolveMapping(inserted!.id, { status: "confirmed", depth: "deep" });

    expect("error" in resolved).toBe(false);
    expect((resolved as { depth: string | null }).depth).toBe("deep");
  });
});

describe("getPrimaryConfirmedDomainNodeId / batch — the legacy single-value compatibility read", () => {
  it("returns null when nothing is confirmed, and the most recently confirmed node id once something is", async () => {
    const subjectId = id("sub");
    const nodeIdA = id("dnode");
    const nodeIdB = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeIdA, subjectId, "A");
    await insertDomainNode(nodeIdB, subjectId, "B");
    await insertCurriculum(curriculumId, subjectId);

    expect(await getPrimaryConfirmedDomainNodeId(curriculumId)).toBeNull();

    await insertConfirmedMapping({ curriculumId, domainNodeId: nodeIdA, source: "manual" });
    expect(await getPrimaryConfirmedDomainNodeId(curriculumId)).toBe(nodeIdA);

    // A real gap between the two confirms — "most recent" is only a
    // meaningful, deterministic assertion once the two rows' created_at
    // values are guaranteed to differ; back-to-back inserts in the same
    // test tick can otherwise land on the same DB timestamp.
    await new Promise((resolve) => setTimeout(resolve, 5));

    await insertConfirmedMapping({ curriculumId, domainNodeId: nodeIdB, source: "manual" });
    expect(await getPrimaryConfirmedDomainNodeId(curriculumId)).toBe(nodeIdB);

    const batch = await getPrimaryConfirmedDomainNodeIdsByCurriculumIds([curriculumId]);
    expect(batch.get(curriculumId)).toBe(nodeIdB);
  });
});

describe("rejectAllConfirmedForCurriculum — the 'change placement' panel's clear-to-unplaced path", () => {
  it("flips every confirmed row to rejected, never deletes it", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Clear Me");
    await insertCurriculum(curriculumId, subjectId);

    await insertConfirmedMapping({ curriculumId, domainNodeId: nodeId, source: "manual" });
    expect(await getPrimaryConfirmedDomainNodeId(curriculumId)).toBe(nodeId);

    await rejectAllConfirmedForCurriculum(curriculumId);

    expect(await getPrimaryConfirmedDomainNodeId(curriculumId)).toBeNull();

    const all = await listMappingsForCurriculum(curriculumId);
    expect(all).toHaveLength(1);
    expect(all[0]!.status).toBe("rejected");
  });
});

describe("findCurriculumMappedToNode — learning-list 0.1, anti-sprawl match for an Area", () => {
  it("finds the curriculum through a merely-suggested mapping, not just a confirmed one", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Hooks");
    await insertCurriculum(curriculumId, subjectId);

    expect(await findCurriculumMappedToNode(nodeId)).toBeNull();

    await insertSuggestedMappings(curriculumId, [{ nodeId, depth: "working" }]);

    const match = await findCurriculumMappedToNode(nodeId);

    expect(match).toEqual({ curriculumId, title: `curriculum ${curriculumId}` });
  });

  it("never matches through a rejected mapping", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Rejected Node");
    await insertCurriculum(curriculumId, subjectId);
    await insertConfirmedMapping({ curriculumId, domainNodeId: nodeId, source: "manual" });
    await rejectAllConfirmedForCurriculum(curriculumId);

    expect(await findCurriculumMappedToNode(nodeId)).toBeNull();
  });

  it("picks the most recently placed curriculum when more than one matches the same Area", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const olderCurriculumId = id("cur");
    const newerCurriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Shared Node");
    await insertCurriculum(olderCurriculumId, subjectId);
    await insertCurriculum(newerCurriculumId, subjectId);
    await insertSuggestedMappings(olderCurriculumId, [{ nodeId, depth: "working" }]);

    await new Promise((resolve) => setTimeout(resolve, 5));

    await insertSuggestedMappings(newerCurriculumId, [{ nodeId, depth: "working" }]);

    const match = await findCurriculumMappedToNode(nodeId);

    expect(match?.curriculumId).toBe(newerCurriculumId);
  });
});

describe("deleteMappingsForCurriculum — SCENARIO 13, curriculum delete cleanup", () => {
  it("removes every mapping row regardless of status", async () => {
    const subjectId = id("sub");
    const nodeId = id("dnode");
    const curriculumId = id("cur");

    await insertSubject(subjectId);
    await insertDomainNode(nodeId, subjectId, "Delete Me");
    await insertCurriculum(curriculumId, subjectId);

    await insertConfirmedMapping({ curriculumId, domainNodeId: nodeId, source: "auto" });
    await insertSuggestedMappings(curriculumId, [
      { nodeId: id("dnode-never-inserted"), depth: "working" },
    ]);

    await deleteMappingsForCurriculum(curriculumId);

    expect(await listMappingsForCurriculum(curriculumId)).toHaveLength(0);
  });
});
