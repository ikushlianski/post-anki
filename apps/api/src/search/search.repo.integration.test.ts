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
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `search_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { searchCurricula, searchSubjects, searchTopics } = await import("./search.repo.js");

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

async function insertSubject(overrides: { id: string; name: string }): Promise<void> {
  await client.query(`INSERT INTO subjects (id, name, require_sources) VALUES ($1, $2, false)`, [
    overrides.id,
    overrides.name,
  ]);
}

async function insertCurriculum(overrides: {
  id: string;
  subjectId: string;
  name: string;
  containerAreaNodeId?: string | null;
}): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, container_area_node_id) VALUES ($1, $2, $3, $4)`,
    [overrides.id, overrides.subjectId, overrides.name, overrides.containerAreaNodeId ?? null],
  );
}

async function insertTopic(overrides: {
  id: string;
  moduleId: string;
  curriculumId: string;
  title: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [overrides.id, overrides.moduleId, overrides.curriculumId, overrides.title],
  );
}

async function insertModule(overrides: { id: string; curriculumId: string; title: string }): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`, [
    overrides.id,
    overrides.curriculumId,
    overrides.title,
  ]);
}

describe("searchSubjects", () => {
  it("returns a subject whose name matches the query", async () => {
    await insertSubject({ id: "sub_match_1", name: "Distributed Systems Design" });

    const results = await searchSubjects("Distributed Systems");

    expect(results.map((r) => r.id)).toContain("sub_match_1");
  });

  it("returns nothing for a query that matches no subject", async () => {
    const results = await searchSubjects("no-such-subject-xyz-123");

    expect(results).toEqual([]);
  });

  it("matches case-insensitively", async () => {
    await insertSubject({ id: "sub_match_2", name: "Event-Driven Architecture" });

    const results = await searchSubjects("event-driven");

    expect(results.map((r) => r.id)).toContain("sub_match_2");
  });
});

describe("searchCurricula", () => {
  it("returns a curriculum whose name matches the query", async () => {
    await insertSubject({ id: "sub_cur_1", name: "Backend Engineering" });
    await insertCurriculum({ id: "cur_match_1", subjectId: "sub_cur_1", name: "Kafka Internals" });

    const results = await searchCurricula("Kafka");

    expect(results.map((r) => r.id)).toContain("cur_match_1");
  });

  it("returns nothing for a query that matches no curriculum", async () => {
    const results = await searchCurricula("no-such-curriculum-xyz-123");

    expect(results).toEqual([]);
  });

  it("matches case-insensitively", async () => {
    await insertSubject({ id: "sub_cur_2", name: "Networking" });
    await insertCurriculum({ id: "cur_match_2", subjectId: "sub_cur_2", name: "TCP Congestion Control" });

    const results = await searchCurricula("tcp congestion");

    expect(results.map((r) => r.id)).toContain("cur_match_2");
  });

  it("excludes a container curriculum even when its name matches the query", async () => {
    await insertSubject({ id: "sub_container_1", name: "Learning List Fold-In Subject" });
    await insertCurriculum({
      id: "cur_container_1",
      subjectId: "sub_container_1",
      name: "Container Match Marker",
      containerAreaNodeId: "area_node_1",
    });

    const results = await searchCurricula("Container Match Marker");

    expect(results.map((r) => r.id)).not.toContain("cur_container_1");
  });
});

describe("searchTopics", () => {
  it("returns a topic whose title matches the query, including its curriculumId", async () => {
    await insertSubject({ id: "sub_top_1", name: "Databases" });
    await insertCurriculum({ id: "cur_top_1", subjectId: "sub_top_1", name: "Query Planning" });
    await insertModule({ id: "mod_top_1", curriculumId: "cur_top_1", title: "Indexes" });
    await insertTopic({ id: "top_match_1", moduleId: "mod_top_1", curriculumId: "cur_top_1", title: "B-Tree Indexes" });

    const results = await searchTopics("B-Tree");

    expect(results).toContainEqual(
      expect.objectContaining({ id: "top_match_1", curriculumId: "cur_top_1" }),
    );
  });

  it("returns nothing for a query that matches no topic", async () => {
    const results = await searchTopics("no-such-topic-xyz-123");

    expect(results).toEqual([]);
  });

  it("matches case-insensitively", async () => {
    await insertSubject({ id: "sub_top_2", name: "Compilers" });
    await insertCurriculum({ id: "cur_top_2", subjectId: "sub_top_2", name: "Parsing" });
    await insertModule({ id: "mod_top_2", curriculumId: "cur_top_2", title: "Grammars" });
    await insertTopic({ id: "top_match_2", moduleId: "mod_top_2", curriculumId: "cur_top_2", title: "Recursive Descent Parsing" });

    const results = await searchTopics("recursive descent");

    expect(results.map((r) => r.id)).toContain("top_match_2");
  });
});
