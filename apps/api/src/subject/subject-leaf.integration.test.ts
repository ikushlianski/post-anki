import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subject_leaf_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const repo = await import("./subject.repo.js");
const leaf = await import("./subject-leaf.js");
const { moveKnowledgeBitsBulk } = await import("../knowledge-bit/knowledge-bit-move.repo.js");

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

async function topLevel(name: string) {
  return repo.createSubject({ name, kind: "architecture-mentor" });
}

async function child(name: string, parentId: string) {
  return repo.createSubject({ name, kind: "architecture-mentor", parentId });
}

async function seedSource(subjectId: string | null): Promise<string> {
  const id = `ks_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'x', 'detected', $2)`,
    [id, subjectId],
  );

  return id;
}

async function seedApprovedBit(sourceId: string): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'b', 'approved')`,
    [id, sourceId],
  );

  return id;
}

async function sourceSubject(id: string): Promise<string | null> {
  return (await client.query(`SELECT subject_id FROM knowledge_sources WHERE id = $1`, [id])).rows[0].subject_id;
}

async function childNamesOf(parentId: string): Promise<string[]> {
  return (await client.query(`SELECT name FROM subjects WHERE parent_id = $1 ORDER BY name`, [parentId])).rows.map(
    (r) => r.name,
  );
}

describe("findSubjectAssignmentError", () => {
  it("should accept a subject with no sub-subjects", async () => {
    const leafSubject = await topLevel("Leaf");

    expect(await leaf.findSubjectAssignmentError(leafSubject.id)).toBeNull();
  });

  it("should refuse a subject that has sub-subjects", async () => {
    const parent = await topLevel("Parent");

    await child("Kid", parent.id);

    expect(await leaf.findSubjectAssignmentError(parent.id)).toBe("subject_has_children");
  });

  it("should report an unknown subject as not found", async () => {
    expect(await leaf.findSubjectAssignmentError("sub_missing")).toBe("subject_not_found");
  });

  it("should list only subjects without children as leaves", async () => {
    const parent = await topLevel("Parent2");
    const kid = await child("Kid2", parent.id);
    const leaves = await leaf.listLeafSubjectIds();

    expect(leaves).toContain(kid.id);
    expect(leaves).not.toContain(parent.id);
  });
});

describe("first sub-subject takes over the parent's items", () => {
  it("should move existing items into Common when the first sub-subject is created", async () => {
    const parent = await topLevel("Programming");
    const sourceId = await seedSource(parent.id);

    const web = await child("Web", parent.id);

    const commonRows = (await client.query(`SELECT id FROM subjects WHERE parent_id = $1 AND name = 'Common'`, [parent.id])).rows;

    expect(commonRows).toHaveLength(1);
    expect(await sourceSubject(sourceId)).toBe(commonRows[0].id);
    expect(web.parentId).toBe(parent.id);
  });

  it("should leave items alone when a second sub-subject is added", async () => {
    const parent = await topLevel("Cloud");

    await child("AWS", parent.id);

    const lateSource = await seedSource(parent.id);

    await child("GCP", parent.id);

    expect(await sourceSubject(lateSource)).toBe(parent.id);
    expect(await childNamesOf(parent.id)).toEqual(["AWS", "GCP"]);
  });

  it("should create no Common when the parent has no items", async () => {
    const parent = await topLevel("Empty");

    await child("Only", parent.id);

    expect(await childNamesOf(parent.id)).toEqual(["Only"]);
  });

  it("should use the new sub-subject itself when it is named Common", async () => {
    const parent = await topLevel("Named");
    const sourceId = await seedSource(parent.id);
    const common = await child("Common", parent.id);

    expect(await sourceSubject(sourceId)).toBe(common.id);
    expect(await childNamesOf(parent.id)).toEqual(["Common"]);
  });

  it("should move existing items into Common when an existing subject is re-parented as the first child", async () => {
    const parent = await topLevel("Reparent");
    const sourceId = await seedSource(parent.id);
    const other = await topLevel("Other");

    await repo.updateSubject(other.id, { parentId: parent.id });

    expect(await sourceSubject(sourceId)).not.toBe(parent.id);
    expect(await childNamesOf(parent.id)).toEqual(["Common", "Other"]);
  });

  it("should create Common only once when run again", async () => {
    const parent = await topLevel("Idem");

    await seedSource(parent.id);
    await child("A", parent.id);

    const first = await leaf.moveSourcesToCommon(parent.id, (await import("../db/client.js")).getDb());

    expect(first).toBe(0);
    expect(await childNamesOf(parent.id)).toEqual(["A", "Common"]);
  });
});

describe("moving items between subjects", () => {
  it("should refuse a move into a subject with sub-subjects and move nothing", async () => {
    const parent = await topLevel("MoveParent");

    await child("MoveKid", parent.id);

    const origin = await topLevel("Origin");
    const sourceId = await seedSource(origin.id);
    const bitId = await seedApprovedBit(sourceId);

    const result = await moveKnowledgeBitsBulk([bitId], parent.id);

    expect(result).toEqual({ error: "subject_has_children" });
    expect(await sourceSubject(sourceId)).toBe(origin.id);
  });

  it("should move items into a leaf subject", async () => {
    const parent = await topLevel("MoveParent2");
    const kid = await child("MoveKid2", parent.id);
    const origin = await topLevel("Origin2");
    const sourceId = await seedSource(origin.id);
    const bitId = await seedApprovedBit(sourceId);

    const result = await moveKnowledgeBitsBulk([bitId], kid.id);

    expect(result).toMatchObject({ moved: [bitId] });
    expect(await sourceSubject(sourceId)).toBe(kid.id);
  });
});

describe("merging subjects", () => {
  it("should carry the merged subject's items to the surviving subject", async () => {
    const target = await topLevel("MergeTarget");
    const source = await topLevel("MergeSource");
    const sourceId = await seedSource(source.id);

    const result = await repo.mergeSubjects(target.id, source.id);

    expect(result).toMatchObject({ targetSubjectId: target.id });
    expect(await sourceSubject(sourceId)).toBe(target.id);
  });
});
