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

  it("should accept a subject that has sub-subjects", async () => {
    const parent = await topLevel("Parent");

    await child("Kid", parent.id);

    expect(await leaf.findSubjectAssignmentError(parent.id)).toBeNull();
  });

  it("should report an unknown subject as not found", async () => {
    expect(await leaf.findSubjectAssignmentError("sub_missing")).toBe("subject_not_found");
  });
});

describe("first sub-subject leaves the parent's items in place", () => {
  it("should keep existing items on the parent and create no Common when the first sub-subject is created", async () => {
    const parent = await topLevel("Programming");
    const sourceId = await seedSource(parent.id);

    const web = await child("Web", parent.id);

    expect(await sourceSubject(sourceId)).toBe(parent.id);
    expect(await childNamesOf(parent.id)).toEqual(["Web"]);
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

  it("should keep items on the parent when the first sub-subject is named Common", async () => {
    const parent = await topLevel("Named");
    const sourceId = await seedSource(parent.id);

    await child("Common", parent.id);

    expect(await sourceSubject(sourceId)).toBe(parent.id);
    expect(await childNamesOf(parent.id)).toEqual(["Common"]);
  });

  it("should keep items on the parent and create no Common when an existing subject is re-parented as the first child", async () => {
    const parent = await topLevel("Reparent");
    const sourceId = await seedSource(parent.id);
    const other = await topLevel("Other");

    await repo.updateSubject(other.id, { parentId: parent.id });

    expect(await sourceSubject(sourceId)).toBe(parent.id);
    expect(await childNamesOf(parent.id)).toEqual(["Other"]);
  });

  it("should leave an existing Common sub-subject and its items untouched when another child is added", async () => {
    const parent = await topLevel("Legacy");
    const common = await child("Common", parent.id);
    const commonSource = await seedSource(common.id);

    await child("Fresh", parent.id);

    expect(await sourceSubject(commonSource)).toBe(common.id);
    expect(await childNamesOf(parent.id)).toEqual(["Common", "Fresh"]);
  });
});

describe("moving items between subjects", () => {
  it("should move items onto a subject that has sub-subjects", async () => {
    const parent = await topLevel("MoveParent");

    await child("MoveKid", parent.id);

    const origin = await topLevel("Origin");
    const sourceId = await seedSource(origin.id);
    const bitId = await seedApprovedBit(sourceId);

    const result = await moveKnowledgeBitsBulk([bitId], parent.id);

    expect(result).toMatchObject({ moved: [bitId] });
    expect(await sourceSubject(sourceId)).toBe(parent.id);
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

  it("should report an unknown target subject as not found and move nothing", async () => {
    const origin = await topLevel("Origin3");
    const sourceId = await seedSource(origin.id);
    const bitId = await seedApprovedBit(sourceId);

    const result = await moveKnowledgeBitsBulk([bitId], "sub_missing");

    expect(result).toEqual({ error: "subject_not_found" });
    expect(await sourceSubject(sourceId)).toBe(origin.id);
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
