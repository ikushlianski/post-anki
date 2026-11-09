import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../knowledge-source/knowledge-source-kick.js", () => ({
  kickSourcesAfterAdd: vi.fn(async () => {}),
}));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `mcp_submit_to_subject_${randomUUID().replace(/-/g, "_")}`;
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

const { submitKnowledgeToSubject } = await import("./submit-knowledge-to-subject.tool.js");
const { createSubjectSeedStore } = await import("../subject/seed/subject-seed.store.js");
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

const writer = { scopes: ["knowledge:write"] };

function notes(...keys: string[]) {
  return keys.map((key) => ({ key, text: `Text of ${key}` }));
}

async function countSubjects(name: string): Promise<number> {
  const { rows } = await client.query<{ n: string }>(
    `SELECT count(*) AS n FROM subjects WHERE lower(name) = lower($1)`,
    [name],
  );

  return Number(rows[0]!.n);
}

async function countSources(): Promise<number> {
  const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM knowledge_sources`);

  return Number(rows[0]!.n);
}

describe("submit_knowledge_to_subject against a real database", () => {
  it("should create Work and AIPeak once and file notes under AIPeak", async () => {
    const result = await submitKnowledgeToSubject(
      { subjectPath: "Work/AIPeak", notes: notes("work:aaaaaaa1", "work:aaaaaaa2") },
      writer,
    );

    expect(result).toMatchObject({
      subjectPath: "Work/AIPeak",
      createdSubjects: ["Work", "Work/AIPeak"],
      created: 2,
      alreadyPresent: 0,
    });

    const { rows } = await client.query(
      `SELECT import_key, kind, status, subject_id FROM knowledge_sources ORDER BY import_key`,
    );

    expect(rows).toEqual(
      ["work:aaaaaaa1", "work:aaaaaaa2"].map((import_key) => ({
        import_key,
        kind: "prose",
        status: "pending",
        subject_id: "subjectId" in result ? result.subjectId : null,
      })),
    );
    expect(await countSubjects("Work")).toBe(1);
    expect(await countSubjects("AIPeak")).toBe(1);
  });

  it("should leave one Work and one Ops subject when two calls create the same path concurrently", async () => {
    await Promise.all([
      submitKnowledgeToSubject({ subjectPath: "Work/Ops", notes: notes("work:bbbbbbb1") }, writer),
      submitKnowledgeToSubject({ subjectPath: "work/ops", notes: notes("work:bbbbbbb2") }, writer),
    ]);

    expect(await countSubjects("Work")).toBe(1);
    expect(await countSubjects("Ops")).toBe(1);
  });

  it("should skip already-filed keys when the batch is re-sent", async () => {
    const before = await countSources();
    const result = await submitKnowledgeToSubject(
      { subjectPath: "Work/AIPeak", notes: notes("work:aaaaaaa1", "work:aaaaaaa2") },
      writer,
    );

    expect(result).toMatchObject({ created: 0, alreadyPresent: 2, createdSubjects: [] });
    expect(await countSources()).toBe(before);
  });

  it("should reuse an existing Business/Marketing subject for path business/marketing", async () => {
    const store = createSubjectSeedStore(getDb());
    const rootId = await store.createRoot("Business", "Business courses");
    const marketingId = await store.createChild(rootId, "Marketing");

    const result = await submitKnowledgeToSubject(
      { subjectPath: "business/marketing", notes: notes("biz:ccccccc1") },
      writer,
    );

    expect(result).toMatchObject({ subjectId: marketingId, createdSubjects: [] });
    expect(await countSubjects("Business")).toBe(1);
    expect(await countSubjects("Marketing")).toBe(1);
  });
});
