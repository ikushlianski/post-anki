import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// separate-progress-overlay-from-structure (issue #85), SCENARIO 1/5/6. Real
// Postgres (the e2e docker-compose DB on localhost:5436, never mocked), same
// shape as domain-node-merge-concurrency.integration.test.ts: import
// getDomainMapForSubject directly from domain-map.repo.js and seed rows via
// raw SQL through a plain pg.Client, rather than the full
// migrate-a-throwaway-database setup domain-placement.integration.test.ts
// uses (that heavier setup exists because it also exercises a real HTTP
// controller path; this file only proves the repo's read path).
//
// This is a REGRESSION test, not new behavior — issue #84's rewrite of
// getDomainMapForSubject already returns every domain_nodes row
// unconditionally, independent of curriculum coverage. SCENARIO 1/5 lock
// that in; SCENARIO 6 proves the mixed-subtree rollup is the real output of
// domainNodeProgress's averaging, not a hand-set UI prop.

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

const dbName = `dm_full_structure_${randomUUID().replace(/-/g, "_")}`;
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

const { getDomainMapForSubject } = await import("./domain-map.repo.js");

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

async function insertDomainNode(
  nodeId: string,
  subjectId: string,
  parentId: string | null,
  name: string,
  order = 0,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order") VALUES ($1, $2, $3, $4, $5)`,
    [nodeId, subjectId, parentId, name, order],
  );
}

// Inserts a curriculum with one confirmed mapping to domainNodeId and one
// included topic at the given maturity, so domainNodeProgress's rollup
// (which averages included topics' progress_maturity, via moduleProgress)
// has a real, non-stubbed value to compute against.
async function insertMappedCurriculumWithTopic(params: {
  curriculumId: string;
  subjectId: string;
  domainNodeId: string;
  maturity: number;
}): Promise<void> {
  const { curriculumId, subjectId, domainNodeId, maturity } = params;

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    `curriculum mapped to ${domainNodeId}`,
  ]);
  await client.query(
    `INSERT INTO curriculum_domain_node_mappings (id, curriculum_id, domain_node_id, status, source)
     VALUES ($1, $2, $3, 'confirmed', 'manual')`,
    [id("cdnm"), curriculumId, domainNodeId],
  );

  const moduleId = id("mod");
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 0)`,
    [moduleId, curriculumId, "Module"],
  );
  await client.query(
    `INSERT INTO topics
       (id, module_id, curriculum_id, title, "order", included, progress_status, progress_maturity)
     VALUES ($1, $2, $3, 'Topic', 0, true, $4, $5)`,
    [id("topic"), moduleId, curriculumId, maturity >= 80 ? "mastered" : "in_progress", maturity],
  );
}

interface TreeNode {
  id: string;
  percent: number;
  curricula: unknown[];
  children: TreeNode[];
}

function findNode(tree: TreeNode[], nodeId: string): TreeNode | undefined {
  for (const node of tree) {
    if (node.id === nodeId) {
      return node;
    }

    const found = findNode(node.children, nodeId);

    if (found) {
      return found;
    }
  }

  return undefined;
}

describe("SCENARIO 1/5 — full structure always renders, regardless of coverage", () => {
  it("returns every node in a multi-level chain with zero curricula anywhere in its subtree, each with percent: 0 and curricula: []", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S1 full-structure subject");

    const grandparentId = id("gp");
    const parentId = id("parent");
    const leafId = id("leaf");

    await insertDomainNode(grandparentId, subjectId, null, "Grandparent");
    await insertDomainNode(parentId, subjectId, grandparentId, "Parent");
    await insertDomainNode(leafId, subjectId, parentId, "Leaf");

    const tree = await getDomainMapForSubject(subjectId);

    const grandparentNode = findNode(tree as unknown as TreeNode[], grandparentId);
    expect(grandparentNode).toBeDefined();
    expect(grandparentNode!.percent).toBe(0);
    expect(grandparentNode!.curricula).toEqual([]);

    const parentNode = findNode(grandparentNode!.children, parentId);
    expect(parentNode).toBeDefined();
    expect(parentNode!.percent).toBe(0);
    expect(parentNode!.curricula).toEqual([]);

    const leafNode = findNode(parentNode!.children, leafId);
    expect(leafNode).toBeDefined();
    expect(leafNode!.percent).toBe(0);
    expect(leafNode!.curricula).toEqual([]);
  });
});

describe("SCENARIO 6 — a mixed subtree does not hide a real gap behind a sibling's coverage", () => {
  it("produces percent > 0 at the parent (real rollup average) and percent === 0 at the unmapped child", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "S6 mixed-subtree subject");

    const parentId = id("parent");
    const coveredChildId = id("covered-child");
    const uncoveredChildId = id("uncovered-child");

    await insertDomainNode(parentId, subjectId, null, "Parent");
    await insertDomainNode(coveredChildId, subjectId, parentId, "Covered Child");
    await insertDomainNode(uncoveredChildId, subjectId, parentId, "Uncovered Child");

    await insertMappedCurriculumWithTopic({
      curriculumId: id("curr"),
      subjectId,
      domainNodeId: coveredChildId,
      maturity: 90,
    });

    const tree = await getDomainMapForSubject(subjectId);

    const parentNode = findNode(tree as unknown as TreeNode[], parentId);
    expect(parentNode).toBeDefined();
    expect(parentNode!.percent).toBeGreaterThan(0);

    const coveredChildNode = findNode(parentNode!.children, coveredChildId);
    expect(coveredChildNode).toBeDefined();
    expect(coveredChildNode!.percent).toBe(90);

    const uncoveredChildNode = findNode(parentNode!.children, uncoveredChildId);
    expect(uncoveredChildNode).toBeDefined();
    expect(uncoveredChildNode!.percent).toBe(0);
    expect(uncoveredChildNode!.curricula).toEqual([]);
  });
});
