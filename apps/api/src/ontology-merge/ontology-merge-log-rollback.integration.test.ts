import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Not part of spec.md's own Definition-of-Done list, but explicitly required
// by this task's own instructions: prove — with a real test against real
// Postgres, not just an inline code comment asserting it's true — that the
// ontology_merges log write genuinely runs INSIDE each merge's own
// transaction, so a failing log insert rolls back the merge's reassignment
// too (spec.md's "Where the log write happens": "if the log insert fails,
// the whole merge transaction rolls back with it, so a merge can never
// succeed silently un-logged").
//
// Mechanism: mock insertOntologyMergeLog (the one call site every merge
// callback invokes) to reject, then call the real mergeTags/mergeDomainNodes
// against real Postgres and confirm NONE of their reassignment work
// persisted — not just that the function rejected. If a future change moved
// the log write outside the transaction (e.g. after tx.commit()), these
// tests would start failing: the source row would already be deleted and its
// children already reassigned by the time the mocked insertOntologyMergeLog
// throws.
//
// Covers two of the four merges (mergeTags, mergeDomainNodes), not all four
// — `Tx` and the Db returned by `getDb()` are structurally similar in
// Drizzle, so the type signature alone can't stop a future callback from
// passing the wrong one; a second, structurally different merge (one that
// re-parents an existing row, unlike mergeTags) makes this a real
// cross-callback proof rather than a single-function coincidence.

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

const dbName = `ontology_log_rollback_${randomUUID().replace(/-/g, "_")}`;
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

const SIMULATED_FAILURE_MESSAGE = "simulated ontology_merges insert failure (rollback proof)";

vi.mock("../ontology-merge/ontology-merge.repo.js", () => ({
  insertOntologyMergeLog: vi.fn().mockRejectedValue(new Error(SIMULATED_FAILURE_MESSAGE)),
}));

const { mergeTags } = await import("../tag/tag.repo.js");
const { mergeDomainNodes } = await import("../domain-map/domain-map.repo.js");

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

async function insertTag(tagId: string, name: string): Promise<void> {
  await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, lower($2))`, [
    tagId,
    name,
  ]);
}

async function insertAssignment(tagId: string, nodeType: "module" | "topic", nodeId: string): Promise<void> {
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, $3, $4)`,
    [id("tga"), tagId, nodeType, nodeId],
  );
}

async function insertSubject(subjectId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, name],
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

describe("ontology_merges log write runs inside the merge's own transaction", () => {
  it("a failed log insert rolls back mergeTags' reassignment too — the source tag survives, the assignment never moves", async () => {
    const targetId = id("tag");
    const sourceId = id("tag");
    const sourceOnlyNodeId = id("module");

    await insertTag(targetId, `rollback-target-${randomUUID()}`);
    await insertTag(sourceId, `rollback-source-${randomUUID()}`);
    await insertAssignment(sourceId, "module", sourceOnlyNodeId);

    await expect(mergeTags(targetId, sourceId)).rejects.toThrow(SIMULATED_FAILURE_MESSAGE);

    // The whole transaction must have rolled back — not just the log
    // insert's own row. If the log write ran outside the merge's
    // transaction, these would show the merge already applied.
    const { rows: sourceTagRows } = await client.query(
      `SELECT count(*)::int AS n FROM tags WHERE id = $1`,
      [sourceId],
    );
    expect(sourceTagRows[0]!.n).toBe(1);

    const { rows: assignmentRows } = await client.query(
      `SELECT tag_id FROM tag_assignments WHERE node_type = 'module' AND node_id = $1`,
      [sourceOnlyNodeId],
    );
    expect(assignmentRows).toHaveLength(1);
    expect(assignmentRows[0]!.tag_id).toBe(sourceId);
  });

  it("a failed log insert rolls back mergeDomainNodes' reassignment too — the source node and its child both survive untouched", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "rollback-domain-node subject");

    const targetId = id("target");
    const sourceId = id("source");
    const childId = id("child");
    await insertDomainNode(targetId, subjectId, null, `rollback-target-${randomUUID()}`);
    await insertDomainNode(sourceId, subjectId, null, `rollback-source-${randomUUID()}`);
    await insertDomainNode(childId, subjectId, sourceId, `rollback-child-${randomUUID()}`);

    await expect(mergeDomainNodes(targetId, sourceId)).rejects.toThrow(SIMULATED_FAILURE_MESSAGE);

    // The whole transaction must have rolled back — the source node must
    // still exist and the child must still point at it, not at the target.
    const { rows: sourceNodeRows } = await client.query(
      `SELECT count(*)::int AS n FROM domain_nodes WHERE id = $1`,
      [sourceId],
    );
    expect(sourceNodeRows[0]!.n).toBe(1);

    const { rows: childRows } = await client.query(
      `SELECT parent_id FROM domain_nodes WHERE id = $1`,
      [childId],
    );
    expect(childRows).toHaveLength(1);
    expect(childRows[0]!.parent_id).toBe(sourceId);
  });
});
