import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import {
  subjects,
  domainNodes,
  curricula,
  curriculumDomainNodeMappings,
} from "../db/schema.js";
import { newId } from "../shared/id.js";

// seed-static-taxonomy (#82 follow-up to #84) — proves seed-domain-taxonomy.ts
// (apps/api/scripts/seed-domain-taxonomy.ts), rewired to load the real
// 208-node/15-domain taxonomy via parseTaxonomyYaml, against a real, freshly
// migrated throwaway Postgres database. Mirrors
// seed-domain-nodes.integration.test.ts's exact pattern (fresh DB per test
// group, created + migrated + dropped via createMigratedTestDb/dropTestDb,
// never the shared local dev database).
//
// SCENARIO 1, 2, 3, 5, 6, 7 (.planning/unassigned/seed-static-taxonomy/
// scenarios.md). SCENARIO 4 (duplicate-sibling-name rejection) is covered by
// parse-taxonomy-yaml.test.ts instead — it's a pure-parser concern, no DB
// needed.
//
// Deliberately co-located under src/domain-map/ rather than at
// apps/api/scripts/seed-domain-taxonomy.integration.test.ts — this
// project's apps/api/vitest.config.ts `include` glob is `src/**/*.test.ts`
// only, so a test file under scripts/ is invisible to vitest regardless of
// exclude rules (same fact seed-domain-nodes.integration.test.ts's own
// comment documents). The seed script itself still lives at
// apps/api/scripts/seed-domain-taxonomy.ts; only this test file's location
// moved, and it imports the script by relative path below.

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
  const dbName = `dt_seed_${label}_${randomUUID().replace(/-/g, "_")}`;
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

type Db = ReturnType<typeof drizzle>;

// The exact 4-domain/16-node in-file placeholder hierarchy #84 originally
// shipped in seed-domain-taxonomy.ts, before this ticket rewired the script
// to read the real taxonomy from YAML. Reproduced here only as a fixture for
// SCENARIO 6/7 ("pre-existing placeholder tree"), inserted directly (no
// existence-check needed — each test's database starts empty).
interface PlaceholderNode {
  name: string;
  description?: string;
  children?: PlaceholderNode[];
}

const PLACEHOLDER_HIERARCHY: PlaceholderNode[] = [
  {
    name: "Frontend",
    description: "Client-side web development — UI frameworks, styling, browser fundamentals.",
    children: [
      { name: "React", description: "Components, hooks, and the wider React ecosystem." },
      {
        name: "Meta-frameworks",
        description: "Full-stack React/Vue frameworks layered on top of a routing convention.",
        children: [
          { name: "Next.js", description: "The App Router, server components, and edge rendering." },
          { name: "Remix", description: "Nested routing and loader/action data conventions." },
        ],
      },
    ],
  },
  {
    name: "Backend",
    description: "Server-side application development — runtimes, APIs, data access.",
    children: [
      { name: "Node.js", description: "The event loop, streams, and the wider npm ecosystem." },
      {
        name: "APIs",
        description: "Designing and building service interfaces.",
        children: [
          { name: "REST", description: "Resource-oriented HTTP API design." },
          { name: "GraphQL", description: "Schema-first, query-driven API design." },
        ],
      },
    ],
  },
  {
    name: "Cloud & DevOps",
    description: "Deploying, scaling, and operating applications in production.",
    children: [
      { name: "AWS", description: "Core AWS services and their common application patterns." },
      {
        name: "Containers & Orchestration",
        description: "Docker, Kubernetes, and container-native deployment.",
      },
    ],
  },
  {
    name: "Architecture & Patterns",
    description: "Cross-cutting design knowledge independent of any one language or framework.",
    children: [
      { name: "System Design", description: "Scalability, reliability, and distributed-systems tradeoffs." },
      { name: "Design Patterns", description: "Reusable object-oriented and functional design solutions." },
    ],
  },
];

async function seedPlaceholderTaxonomy(db: Db, subjectId: string): Promise<void> {
  async function insertNode(
    node: PlaceholderNode,
    parentId: string | null,
    order: number,
  ): Promise<void> {
    const id = newId("dnode");

    await db.insert(domainNodes).values({
      id,
      subjectId,
      parentId,
      name: node.name,
      description: node.description ?? null,
      order,
      source: "static_taxonomy",
    });

    for (const [index, child] of (node.children ?? []).entries()) {
      await insertNode(child, id, index);
    }
  }

  for (const [index, root] of PLACEHOLDER_HIERARCHY.entries()) {
    await insertNode(root, null, index);
  }
}

async function walkToRootHopCount(
  db: Db,
  rows: { id: string; parentId: string | null }[],
  startId: string,
): Promise<number> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  let hops = 0;
  let currentId: string | null = startId;
  const visited = new Set<string>();

  while (true) {
    const current = byId.get(currentId as string);

    if (!current) {
      throw new Error(`walkToRootHopCount: node ${currentId} not found in row set`);
    }

    if (current.parentId === null) {
      return hops;
    }

    if (visited.has(current.id)) {
      throw new Error(`walkToRootHopCount: cycle detected at node ${current.id}`);
    }

    visited.add(current.id);
    currentId = current.parentId;
    hops += 1;

    if (hops > 10) {
      throw new Error(`walkToRootHopCount: exceeded 10 hops walking from ${startId}`);
    }
  }
}

describe("seed-domain-taxonomy — full 208-node taxonomy (SCENARIO 1, 2, 3)", () => {
  let dbName: string;
  let adminPool: pg.Pool;
  let testPool: pg.Pool;
  let db: Db;
  let subjectId: string;
  let otherNodeId: string;

  beforeAll(async () => {
    const created = await createMigratedTestDb("full");
    dbName = created.dbName;
    adminPool = created.adminPool;
    testPool = created.testPool;
    db = created.db;

    subjectId = newId("sub");
    await db.insert(subjects).values({ id: subjectId, name: "Throwaway IT Taxonomy Subject" });

    // A pre-existing, unrelated domain node + a curriculum confirmed-mapped
    // to it — SCENARIO 3 needs a non-empty curriculum_domain_node_mappings
    // table with a real row pointing somewhere else, so the "0 mappings to
    // the newly-seeded ids" assertion actually discriminates instead of
    // passing trivially against an empty table.
    otherNodeId = newId("dnode");
    await db.insert(domainNodes).values({
      id: otherNodeId,
      subjectId,
      parentId: null,
      name: "Pre-existing unrelated node",
      order: 0,
      source: "ai_generated",
    });

    const curriculumId = newId("curr");
    await db.insert(curricula).values({
      id: curriculumId,
      subjectId,
      name: "Pre-existing curriculum",
    });

    await db.insert(curriculumDomainNodeMappings).values({
      id: newId("cdnm"),
      curriculumId,
      domainNodeId: otherNodeId,
      status: "confirmed",
      source: "ai_suggested",
    });
  }, 60_000);

  afterAll(async () => {
    await dropTestDb(dbName, adminPool, testPool);
  }, 30_000);

  it("seeds exactly 208 rows, 15 roots, all static_taxonomy, no orphans/cycles (SCENARIO 1)", async () => {
    const { seedDomainTaxonomy } = await import("../../scripts/seed-domain-taxonomy.js");

    const result = await seedDomainTaxonomy(db, subjectId);

    expect(result).toEqual({ created: 208, skipped: 0 });

    const rows = await db
      .select({
        id: domainNodes.id,
        parentId: domainNodes.parentId,
        source: domainNodes.source,
      })
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, subjectId));

    // otherNodeId is a pre-existing node in the same subject, so the raw
    // row count is 209; filter it out to isolate the newly-seeded set.
    const seededRows = rows.filter((row) => row.id !== otherNodeId);

    expect(seededRows).toHaveLength(208);

    const roots = seededRows.filter((row) => row.parentId === null);

    expect(roots).toHaveLength(15);
    expect(seededRows.every((row) => row.source === "static_taxonomy")).toBe(true);

    for (const row of seededRows) {
      const hops = await walkToRootHopCount(db, seededRows, row.id);

      expect(hops).toBeLessThanOrEqual(2);
    }
  });

  it("is idempotent on a second run — created: 0, skipped: 208, no duplicates (SCENARIO 2)", async () => {
    const { seedDomainTaxonomy } = await import("../../scripts/seed-domain-taxonomy.js");

    const second = await seedDomainTaxonomy(db, subjectId);

    expect(second).toEqual({ created: 0, skipped: 208 });

    const rows = await db
      .select({ id: domainNodes.id })
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, subjectId));

    expect(rows.filter((row) => row.id !== otherNodeId)).toHaveLength(208);
  });

  it("maps zero curricula to the newly-seeded nodes, even though the table is non-empty (SCENARIO 3)", async () => {
    const seededRows = await db
      .select({ id: domainNodes.id })
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, subjectId));

    const seededIds = seededRows.map((row) => row.id).filter((id) => id !== otherNodeId);

    const unfiltered = await db.select().from(curriculumDomainNodeMappings);

    expect(unfiltered).toHaveLength(1);

    const filtered = await db
      .select()
      .from(curriculumDomainNodeMappings)
      .where(inArray(curriculumDomainNodeMappings.domainNodeId, seededIds));

    expect(filtered).toHaveLength(0);
  });
});

describe("seed-domain-taxonomy — missing subject (SCENARIO 5)", () => {
  let dbName: string;
  let adminPool: pg.Pool;
  let testPool: pg.Pool;
  let db: Db;

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

  it("throws naming the missing subject id and inserts nothing", async () => {
    const { seedDomainTaxonomy } = await import("../../scripts/seed-domain-taxonomy.js");

    const missingSubjectId = "sub_does_not_exist";

    await expect(seedDomainTaxonomy(db, missingSubjectId)).rejects.toThrow(missingSubjectId);

    const rows = await db.select().from(domainNodes);

    expect(rows).toHaveLength(0);
  });
});

describe("seed-domain-taxonomy — pre-existing data in other subjects (SCENARIO 6)", () => {
  let dbName: string;
  let adminPool: pg.Pool;
  let testPool: pg.Pool;
  let db: Db;
  let targetSubjectId: string;
  let otherSubjectId: string;

  beforeAll(async () => {
    const created = await createMigratedTestDb("othersubjects");
    dbName = created.dbName;
    adminPool = created.adminPool;
    testPool = created.testPool;
    db = created.db;

    targetSubjectId = newId("sub");
    await db.insert(subjects).values({ id: targetSubjectId, name: "Target Subject" });

    otherSubjectId = newId("sub");
    await db.insert(subjects).values({ id: otherSubjectId, name: "Unrelated Subject" });

    // ai_generated legacy node
    await db.insert(domainNodes).values({
      id: newId("dnode"),
      subjectId: otherSubjectId,
      parentId: null,
      name: "Legacy AI-generated node",
      order: 0,
      source: "ai_generated",
    });

    // a second, unrelated static_taxonomy tree
    await seedPlaceholderTaxonomy(db, otherSubjectId);
  }, 60_000);

  afterAll(async () => {
    await dropTestDb(dbName, adminPool, testPool);
  }, 30_000);

  it("leaves a second, unrelated subject's rows (ai_generated + static_taxonomy) untouched", async () => {
    const before = await db
      .select()
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, otherSubjectId));

    expect(before).toHaveLength(17); // 1 ai_generated + 16 placeholder

    const { seedDomainTaxonomy } = await import("../../scripts/seed-domain-taxonomy.js");

    await seedDomainTaxonomy(db, targetSubjectId);

    const after = await db
      .select()
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, otherSubjectId));

    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

    expect([...after].sort(byId)).toEqual([...before].sort(byId));
  });
});

describe("seed-domain-taxonomy — re-seeding over the old placeholder tree (SCENARIO 7)", () => {
  let dbName: string;
  let adminPool: pg.Pool;
  let testPool: pg.Pool;
  let db: Db;
  let subjectId: string;

  beforeAll(async () => {
    const created = await createMigratedTestDb("overplaceholder");
    dbName = created.dbName;
    adminPool = created.adminPool;
    testPool = created.testPool;
    db = created.db;

    subjectId = newId("sub");
    await db.insert(subjects).values({ id: subjectId, name: "Webdev-like Subject" });

    await seedPlaceholderTaxonomy(db, subjectId);
  }, 60_000);

  afterAll(async () => {
    await dropTestDb(dbName, adminPool, testPool);
  }, 30_000);

  it("forms two disjoint forests: 224 total rows, 19 roots, original 16 unchanged", async () => {
    const placeholderRowsBefore = await db
      .select()
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, subjectId));

    expect(placeholderRowsBefore).toHaveLength(16);

    const { seedDomainTaxonomy } = await import("../../scripts/seed-domain-taxonomy.js");

    const result = await seedDomainTaxonomy(db, subjectId);

    expect(result).toEqual({ created: 208, skipped: 0 });

    const allRows = await db
      .select()
      .from(domainNodes)
      .where(eq(domainNodes.subjectId, subjectId));

    expect(allRows).toHaveLength(224);

    const roots = allRows.filter((row) => row.parentId === null);

    expect(roots).toHaveLength(19);

    const placeholderIds = new Set(placeholderRowsBefore.map((row) => row.id));
    const placeholderRowsAfter = allRows.filter((row) => placeholderIds.has(row.id));

    expect(placeholderRowsAfter).toHaveLength(16);
    expect(
      [...placeholderRowsAfter].sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual([...placeholderRowsBefore].sort((a, b) => a.id.localeCompare(b.id)));
  });
});
