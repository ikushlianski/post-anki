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

const { searchCurricula, searchSubjects, searchTopics, searchTopicsAndModulesRanked } =
  await import("./search.repo.js");

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
  summary?: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, summary, "order") VALUES ($1, $2, $3, $4, $5, 1)`,
    [overrides.id, overrides.moduleId, overrides.curriculumId, overrides.title, overrides.summary ?? null],
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

describe("searchTopicsAndModulesRanked", () => {
  it("ranks a title/summary match above a weaker summary-only match, across both topics and modules", async () => {
    await insertSubject({ id: "sub_ranked_1", name: "Async Programming" });
    await insertCurriculum({ id: "cur_ranked_1", subjectId: "sub_ranked_1", name: "Concurrency" });
    await insertModule({ id: "mod_ranked_1", curriculumId: "cur_ranked_1", title: "Error handling" });

    await insertTopic({
      id: "top_ranked_strong",
      moduleId: "mod_ranked_1",
      curriculumId: "cur_ranked_1",
      title: "Async error handling patterns",
      summary: "Covers async error handling in depth.",
    });
    await insertTopic({
      id: "top_ranked_weak",
      moduleId: "mod_ranked_1",
      curriculumId: "cur_ranked_1",
      title: "Unrelated topic",
      summary: "Briefly touches on async error handling in passing.",
    });

    const results = await searchTopicsAndModulesRanked("async error handling", 10);

    const strongIndex = results.findIndex((r) => r.id === "top_ranked_strong");
    const weakIndex = results.findIndex((r) => r.id === "top_ranked_weak");

    expect(strongIndex).toBeGreaterThanOrEqual(0);
    expect(weakIndex).toBeGreaterThanOrEqual(0);
    expect(strongIndex).toBeLessThan(weakIndex);
  });

  it("includes matching modules alongside topics, tagged with the right kind", async () => {
    await insertSubject({ id: "sub_ranked_2", name: "Databases" });
    await insertCurriculum({ id: "cur_ranked_2", subjectId: "sub_ranked_2", name: "Query Planning" });
    await insertModule({
      id: "mod_ranked_match",
      curriculumId: "cur_ranked_2",
      title: "Index selection strategies",
    });

    const results = await searchTopicsAndModulesRanked("index selection", 10);

    expect(results).toContainEqual(
      expect.objectContaining({ id: "mod_ranked_match", kind: "module" }),
    );
  });

  it("caps results at the given limit", async () => {
    await insertSubject({ id: "sub_ranked_3", name: "Capped Search Subject" });
    await insertCurriculum({ id: "cur_ranked_3", subjectId: "sub_ranked_3", name: "Capped Curriculum" });
    await insertModule({ id: "mod_ranked_3", curriculumId: "cur_ranked_3", title: "Capped Module" });

    for (let i = 0; i < 5; i += 1) {
      await insertTopic({
        id: `top_capped_${i}`,
        moduleId: "mod_ranked_3",
        curriculumId: "cur_ranked_3",
        title: `Capped search marker topic ${i}`,
      });
    }

    const results = await searchTopicsAndModulesRanked("capped search marker", 3);

    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("returns nothing for a query that matches neither a topic nor a module", async () => {
    const results = await searchTopicsAndModulesRanked("zzz-no-such-thing-xyz-123", 10);

    expect(results).toEqual([]);
  });

  it("ranks a strongly-matching module above a weakly-matching topic, across kinds", async () => {
    await insertSubject({ id: "sub_ranked_4", name: "Cross-kind ranking subject" });
    await insertCurriculum({ id: "cur_ranked_4", subjectId: "sub_ranked_4", name: "Cross-kind ranking" });
    await insertModule({
      id: "mod_ranked_cross_strong",
      curriculumId: "cur_ranked_4",
      title: "Memoization memoization memoization",
    });
    await insertTopic({
      id: "top_ranked_cross_weak",
      moduleId: "mod_ranked_cross_strong",
      curriculumId: "cur_ranked_4",
      title: "General topics including memoization somewhat",
    });

    const results = await searchTopicsAndModulesRanked("memoization", 10);

    const topicIndex = results.findIndex((r) => r.id === "top_ranked_cross_weak");
    const moduleIndex = results.findIndex((r) => r.id === "mod_ranked_cross_strong");

    expect(topicIndex).toBeGreaterThanOrEqual(0);
    expect(moduleIndex).toBeGreaterThanOrEqual(0);
    expect(moduleIndex).toBeLessThan(topicIndex);
  });
});
