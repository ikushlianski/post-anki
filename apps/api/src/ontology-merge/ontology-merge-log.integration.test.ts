import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 2 + 3 + 4 (.planning/ontology-audit-trail/scenarios.md) — the
// write-path proof for the ontology_merges audit log across the three merge
// types NOT covered by an e2e test (mergeSubjects is proven end-to-end by
// @ontology-audit-trail.S1 instead — see spec.md's Definition of Done). Each
// case cross-checks reassigned_counts against the merge function's OWN
// returned counts exactly, not just non-zero, plus SCENARIO 3's co-located
// negative case (a rejected mergeCurricula call — target_failed — writes
// zero ontology_merges rows) and the backend read-path ordering/limit proof
// for listRecentOntologyMerges.
//
// Real Postgres (the e2e docker-compose DB on localhost:5436, never mocked),
// mirrors tag-merge.integration.test.ts /
// curriculum-merge-target-failed-precondition.integration.test.ts's own
// harness shape exactly.

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

const dbName = `ontology_log_${randomUUID().replace(/-/g, "_")}`;
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

const { mergeTags } = await import("../tag/tag.repo.js");
const { mergeCurricula } = await import("../curriculum/curriculum.repo.js");
const { mergeDomainNodes } = await import("../domain-map/domain-map.repo.js");
const { insertOntologyMergeLog, listRecentOntologyMerges } = await import(
  "./ontology-merge.repo.js"
);
const { getDb } = await import("../db/client.js");

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

async function insertSubject(subjectId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, name],
  );
}

async function insertTag(tagId: string, name: string): Promise<void> {
  await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, lower($2))`, [
    tagId,
    name,
  ]);
}

async function insertAssignment(
  tagId: string,
  nodeType: "module" | "topic",
  nodeId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, $3, $4)`,
    [id("tga"), tagId, nodeType, nodeId],
  );
}

async function insertProbeSessionForTag(sessionId: string, scopeId: string): Promise<void> {
  await client.query(`INSERT INTO probe_sessions (id, scope, scope_id, status) VALUES ($1, 'tag', $2, 'active')`, [
    sessionId,
    scopeId,
  ]);
}

async function insertCurriculum(
  curriculumId: string,
  subjectId: string,
  name: string,
  status = "ready",
): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, $4)`, [
    curriculumId,
    subjectId,
    name,
    status,
  ]);
}

async function insertModule(moduleId: string, curriculumId: string, title: string): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 0)`, [
    moduleId,
    curriculumId,
    title,
  ]);
}

async function insertTopic(
  topicId: string,
  moduleId: string,
  curriculumId: string,
  title: string,
): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 0)`,
    [topicId, moduleId, curriculumId, title],
  );
}

async function insertSource(sourceId: string, curriculumId: string): Promise<void> {
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value) VALUES ($1, $2, 'url', 'https://example.test/source')`,
    [sourceId, curriculumId],
  );
}

async function insertSocraticSession(
  sessionId: string,
  topicId: string,
  curriculumId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO socratic_sessions (id, topic_id, curriculum_id, status) VALUES ($1, $2, $3, 'active')`,
    [sessionId, topicId, curriculumId],
  );
}

async function insertProbeSessionForCurriculum(
  sessionId: string,
  curriculumId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO probe_sessions (id, scope, scope_id, curriculum_id, status) VALUES ($1, 'curriculum', $2, $2, 'active')`,
    [sessionId, curriculumId],
  );
}

async function insertDomainNode(
  nodeId: string,
  subjectId: string,
  parentId: string | null,
  name: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order") VALUES ($1, $2, $3, $4, 0)`,
    [nodeId, subjectId, parentId, name],
  );
}

// decouple-curricula-from-domain-nodes (issue #84) — curricula.domain_node_id
// was migrated and dropped; placement is now a confirmed row in
// curriculum_domain_node_mappings.
async function insertCurriculumUnderDomainNode(
  curriculumId: string,
  subjectId: string,
  domainNodeId: string,
  name: string,
): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'ready')`,
    [curriculumId, subjectId, name],
  );
  await client.query(
    `INSERT INTO curriculum_domain_node_mappings (id, curriculum_id, domain_node_id, status, source)
     VALUES ($1, $2, $3, 'confirmed', 'manual')`,
    [id("cdnm"), curriculumId, domainNodeId],
  );
}

async function getOntologyMergeRow(
  entityType: string,
  sourceId: string,
): Promise<{
  target_name: string;
  source_name: string;
  reassigned_counts: Record<string, number>;
} | null> {
  const { rows } = await client.query(
    `SELECT target_name, source_name, reassigned_counts FROM ontology_merges WHERE entity_type = $1 AND source_id = $2`,
    [entityType, sourceId],
  );

  return rows[0] ?? null;
}

async function countOntologyMerges(entityType: string, sourceId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM ontology_merges WHERE entity_type = $1 AND source_id = $2`,
    [entityType, sourceId],
  );

  return rows[0]!.n;
}

interface MergeTagsOutcome {
  error?: string;
  assignmentsMoved?: number;
  assignmentsDeduped?: number;
  sessionsMoved?: number;
}

interface MergeCurriculaOutcome {
  error?: string;
  modulesMoved?: number;
  topicsMoved?: number;
  sourcesMoved?: number;
  socraticSessionsMoved?: number;
  probeSessionsMoved?: number;
}

interface MergeDomainNodesOutcome {
  error?: string;
  curriculaMoved?: number;
  childNodesMoved?: number;
}

describe("SCENARIO 2 — mergeTags writes a correctly-populated ontology_merges row", () => {
  it("logs entity_type 'tag' with exact reassigned_counts matching mergeTags' own return value", async () => {
    const targetId = id("tag");
    const sourceId = id("tag");
    const targetName = `S2 Target Tag ${randomUUID()}`;
    const sourceName = `S2 Source Tag ${randomUUID()}`;
    const sharedNodeId = id("topic");
    const sourceOnlyNodeId = id("module");
    const sourceSessionId = id("psess");

    await insertTag(targetId, targetName);
    await insertTag(sourceId, sourceName);
    await insertAssignment(targetId, "topic", sharedNodeId);
    await insertAssignment(sourceId, "topic", sharedNodeId);
    await insertAssignment(sourceId, "module", sourceOnlyNodeId);
    await insertProbeSessionForTag(sourceSessionId, sourceId);

    const result = (await mergeTags(targetId, sourceId)) as MergeTagsOutcome;

    expect(result.error).toBeUndefined();
    expect(result.assignmentsMoved).toBeGreaterThan(0);
    expect(result.assignmentsDeduped).toBeGreaterThan(0);
    expect(result.sessionsMoved).toBeGreaterThan(0);

    const logRow = await getOntologyMergeRow("tag", sourceId);

    expect(logRow).not.toBeNull();
    expect(logRow!.target_name).toBe(targetName);
    expect(logRow!.source_name).toBe(sourceName);
    expect(logRow!.reassigned_counts).toEqual({
      assignmentsMoved: result.assignmentsMoved,
      assignmentsDeduped: result.assignmentsDeduped,
      sessionsMoved: result.sessionsMoved,
    });

    const rowCount = await countOntologyMerges("tag", sourceId);
    expect(rowCount).toBe(1);
  });
});

describe("SCENARIO 3 — mergeCurricula writes a correctly-populated ontology_merges row, and a rejected merge writes zero", () => {
  it("logs entity_type 'curriculum' with exact reassigned_counts (all five fields) matching mergeCurricula's own return value", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S3 subject");

    const targetId = id("target");
    const sourceId = id("source");
    const targetName = `S3 Target Curriculum ${randomUUID()}`;
    const sourceName = `S3 Source Curriculum ${randomUUID()}`;
    await insertCurriculum(targetId, subjectId, targetName);
    await insertCurriculum(sourceId, subjectId, sourceName);

    const moduleId = id("mod");
    await insertModule(moduleId, sourceId, "S3 module");
    const topicId = id("topic");
    await insertTopic(topicId, moduleId, sourceId, "S3 topic");
    const sourceRowId = id("src");
    await insertSource(sourceRowId, sourceId);
    const socraticSessionId = id("socr");
    await insertSocraticSession(socraticSessionId, topicId, sourceId);
    const probeSessionId = id("psess");
    await insertProbeSessionForCurriculum(probeSessionId, sourceId);

    const result = (await mergeCurricula(targetId, sourceId)) as MergeCurriculaOutcome;

    expect(result.error).toBeUndefined();
    expect(result.modulesMoved).toBeGreaterThan(0);
    expect(result.topicsMoved).toBeGreaterThan(0);
    expect(result.sourcesMoved).toBeGreaterThan(0);
    expect(result.socraticSessionsMoved).toBeGreaterThan(0);
    expect(result.probeSessionsMoved).toBeGreaterThan(0);

    const logRow = await getOntologyMergeRow("curriculum", sourceId);

    expect(logRow).not.toBeNull();
    expect(logRow!.target_name).toBe(targetName);
    expect(logRow!.source_name).toBe(sourceName);
    expect(logRow!.reassigned_counts).toEqual({
      modulesMoved: result.modulesMoved,
      topicsMoved: result.topicsMoved,
      sourcesMoved: result.sourcesMoved,
      socraticSessionsMoved: result.socraticSessionsMoved,
      probeSessionsMoved: result.probeSessionsMoved,
    });
  });

  it("writes zero ontology_merges rows when mergeCurricula is rejected (target_failed precondition)", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S3 negative-case subject");

    const targetId = id("target");
    const sourceId = id("source");
    await insertCurriculum(targetId, subjectId, "S3 Failed Target", "failed");
    await insertCurriculum(sourceId, subjectId, "S3 Healthy Source", "ready");

    const sourceModuleId = id("mod");
    await insertModule(sourceModuleId, sourceId, "S3 negative-case module");

    const result = (await mergeCurricula(targetId, sourceId)) as MergeCurriculaOutcome;

    expect(result.error).toBe("target_failed");

    const rowCount = await countOntologyMerges("curriculum", sourceId);
    expect(rowCount).toBe(0);
  });
});

describe("SCENARIO 4 — mergeDomainNodes writes a correctly-populated ontology_merges row", () => {
  it("logs entity_type 'domain_node' with exact reassigned_counts matching mergeDomainNodes' own return value", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S4 subject");

    const targetId = id("target");
    const sourceId = id("source");
    const targetName = `S4 Target Node ${randomUUID()}`;
    const sourceName = `S4 Source Node ${randomUUID()}`;
    await insertDomainNode(targetId, subjectId, null, targetName);
    await insertDomainNode(sourceId, subjectId, null, sourceName);

    const attachedCurriculumId = id("curr");
    await insertCurriculumUnderDomainNode(
      attachedCurriculumId,
      subjectId,
      sourceId,
      "S4 attached curriculum",
    );

    const childNodeId = id("child");
    await insertDomainNode(childNodeId, subjectId, sourceId, "S4 child node");

    const result = (await mergeDomainNodes(targetId, sourceId)) as MergeDomainNodesOutcome;

    expect(result.error).toBeUndefined();
    expect(result.curriculaMoved).toBeGreaterThan(0);
    expect(result.childNodesMoved).toBeGreaterThan(0);

    const logRow = await getOntologyMergeRow("domain_node", sourceId);

    expect(logRow).not.toBeNull();
    expect(logRow!.target_name).toBe(targetName);
    expect(logRow!.source_name).toBe(sourceName);
    expect(logRow!.reassigned_counts).toEqual({
      curriculaMoved: result.curriculaMoved,
      childNodesMoved: result.childNodesMoved,
    });
  });
});

describe("listRecentOntologyMerges — newest-first ordering and limit, proven via explicit createdAt (never Postgres now())", () => {
  it("returns exactly `limit` rows, ordered newest-first by the caller-supplied createdAt values", async () => {
    // Far-future timestamps guarantee these 3 rows are always the most
    // recent in the whole ontology_merges table, regardless of what other
    // tests in this file (or concurrently-run test files hitting the same
    // DB) have written with real "now" timestamps — the same reasoning
    // spec.md's own createdAt design note applies to same-transaction
    // ordering, extended here to cross-test isolation.
    const farFuture = Date.now() + 10 * 24 * 60 * 60 * 1000;

    const rowA = {
      entityType: "subject" as const,
      targetId: id("sub"),
      targetName: "Ordering Row A Target",
      sourceId: id("sub"),
      sourceName: "Ordering Row A Source",
      reassignedCounts: { curriculaMoved: 1, domainNodesMoved: 0 },
      createdAt: new Date(farFuture + 0),
    };
    const rowB = {
      entityType: "tag" as const,
      targetId: id("tag"),
      targetName: "Ordering Row B Target",
      sourceId: id("tag"),
      sourceName: "Ordering Row B Source",
      reassignedCounts: { assignmentsMoved: 1, assignmentsDeduped: 0, sessionsMoved: 0 },
      createdAt: new Date(farFuture + 1_000),
    };
    const rowC = {
      entityType: "curriculum" as const,
      targetId: id("cur"),
      targetName: "Ordering Row C Target",
      sourceId: id("cur"),
      sourceName: "Ordering Row C Source",
      reassignedCounts: {
        modulesMoved: 1,
        topicsMoved: 0,
        sourcesMoved: 0,
        socraticSessionsMoved: 0,
        probeSessionsMoved: 0,
      },
      createdAt: new Date(farFuture + 2_000),
    };

    for (const row of [rowA, rowB, rowC]) {
      await getDb().transaction(async (tx) => {
        await insertOntologyMergeLog(row, tx);
      });
    }

    try {
      const recent = await listRecentOntologyMerges(2);

      expect(recent).toHaveLength(2);
      expect(recent[0]!.sourceName).toBe(rowC.sourceName);
      expect(recent[1]!.sourceName).toBe(rowB.sourceName);
    } finally {
      // Clean up — these far-future rows would otherwise sit permanently at
      // the top of every future ORDER BY created_at DESC LIMIT 50 read
      // (including the admin-observability page's own read and S5's e2e
      // seed rows), silently starving them out of the 50-row window after
      // enough repeated runs against a long-lived e2e DB.
      await client.query(`DELETE FROM ontology_merges WHERE source_id = ANY($1)`, [
        [rowA.sourceId, rowB.sourceId, rowC.sourceId],
      ]);
    }
  });
});
