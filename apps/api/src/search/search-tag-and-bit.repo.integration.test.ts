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

const dbName = `search_tag_bit_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { searchByTagNameAcrossNodes, searchKnowledgeBitsRanked } = await import(
  "./search-tag-and-bit.repo.js"
);

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
}): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    overrides.id,
    overrides.subjectId,
    overrides.name,
  ]);
}

async function insertTopic(overrides: {
  id: string;
  moduleId: string;
  curriculumId: string;
  title: string;
  releaseState?: string | null;
}): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", release_state) VALUES ($1, $2, $3, $4, 1, $5)`,
    [overrides.id, overrides.moduleId, overrides.curriculumId, overrides.title, overrides.releaseState ?? null],
  );
}

async function insertModule(overrides: { id: string; curriculumId: string; title: string }): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`, [
    overrides.id,
    overrides.curriculumId,
    overrides.title,
  ]);
}

async function insertKnowledgeBit(overrides: {
  id: string;
  knowledgeSourceId: string;
  ordinal: number;
  body: string;
  topicId?: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id) VALUES ($1, $2, $3, $4, $5)`,
    [overrides.id, overrides.knowledgeSourceId, overrides.ordinal, overrides.body, overrides.topicId ?? null],
  );
}

async function insertTag(overrides: { id: string; name: string }): Promise<void> {
  await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, $3)`, [
    overrides.id,
    overrides.name,
    overrides.name.toLowerCase(),
  ]);
}

async function insertTagAssignment(overrides: {
  id: string;
  tagId: string;
  nodeType: "topic" | "module" | "knowledgeBit";
  nodeId: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, $3, $4)`,
    [overrides.id, overrides.tagId, overrides.nodeType, overrides.nodeId],
  );
}

describe("searchKnowledgeBitsRanked", () => {
  it("finds a knowledge bit by its body text, with its curriculum context when placed", async () => {
    await insertSubject({ id: "sub_bit_1", name: "Testing" });
    await insertCurriculum({ id: "cur_bit_1", subjectId: "sub_bit_1", name: "Jest fundamentals" });
    await insertModule({ id: "mod_bit_1", curriculumId: "cur_bit_1", title: "Isolation" });
    await insertTopic({
      id: "top_bit_1",
      moduleId: "mod_bit_1",
      curriculumId: "cur_bit_1",
      title: "Mocking HTTP",
    });
    await insertKnowledgeBit({
      id: "bit_1",
      knowledgeSourceId: "src_1",
      ordinal: 1,
      body: "Isolate the component from the world using an HTTP interceptor",
      topicId: "top_bit_1",
    });

    const results = await searchKnowledgeBitsRanked("HTTP interceptor", 10);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "bit_1",
      kind: "bit",
      curriculumId: "cur_bit_1",
      curriculumName: "Jest fundamentals",
    });
  });

  it("returns a null curriculum context for a bit that hasn't been placed yet", async () => {
    await insertKnowledgeBit({
      id: "bit_unplaced_1",
      knowledgeSourceId: "src_2",
      ordinal: 1,
      body: "Nock provides a convenient syntax for defining external service behavior",
    });

    const results = await searchKnowledgeBitsRanked("Nock external service", 10);

    expect(results).toHaveLength(1);
    const [bit] = results;
    expect(bit?.curriculumId).toBeNull();
    expect(bit?.curriculumName).toBeNull();
  });
});

describe("searchByTagNameAcrossNodes", () => {
  it("finds a topic, module, and knowledge bit all assigned a matching tag name", async () => {
    await insertSubject({ id: "sub_tag_1", name: "Engineering practice" });
    await insertCurriculum({ id: "cur_tag_1", subjectId: "sub_tag_1", name: "Reliability" });
    await insertModule({ id: "mod_tag_1", curriculumId: "cur_tag_1", title: "Resilience" });
    await insertTopic({
      id: "top_tag_1",
      moduleId: "mod_tag_1",
      curriculumId: "cur_tag_1",
      title: "Timeouts and retries",
    });
    await insertKnowledgeBit({ id: "bit_tag_1", knowledgeSourceId: "src_3", ordinal: 1, body: "Retry budgets cap cascading failure" });
    await insertTag({ id: "tag_perf_1", name: "performance" });
    await insertTagAssignment({ id: "ta_1", tagId: "tag_perf_1", nodeType: "topic", nodeId: "top_tag_1" });
    await insertTagAssignment({ id: "ta_2", tagId: "tag_perf_1", nodeType: "module", nodeId: "mod_tag_1" });
    await insertTagAssignment({ id: "ta_3", tagId: "tag_perf_1", nodeType: "knowledgeBit", nodeId: "bit_tag_1" });

    const results = await searchByTagNameAcrossNodes("performance", 10);

    const kinds = results.map((r) => r.kind).sort();
    expect(kinds).toEqual(["bit", "module", "topic"]);
    for (const result of results) {
      expect(result.tags.map((tag) => tag.name)).toContain("performance");
      expect(result.tags.map((tag) => tag.id)).toContain("tag_perf_1");
    }
  });

  it("returns nothing for a tag name that doesn't exist", async () => {
    const results = await searchByTagNameAcrossNodes("zzz-no-such-tag-xyz", 10);

    expect(results).toEqual([]);
  });

  it("excludes a declined topic carrying the tag, but still returns a non-declined sibling", async () => {
    await insertSubject({ id: "sub_tag_declined", name: "Declined tag subject" });
    await insertCurriculum({ id: "cur_tag_declined", subjectId: "sub_tag_declined", name: "Declined tag curriculum" });
    await insertModule({ id: "mod_tag_declined", curriculumId: "cur_tag_declined", title: "Declined tag module" });
    await insertTopic({
      id: "top_tag_declined",
      moduleId: "mod_tag_declined",
      curriculumId: "cur_tag_declined",
      title: "Declined tag topic",
      releaseState: "declined",
    });
    await insertTopic({
      id: "top_tag_not_declined",
      moduleId: "mod_tag_declined",
      curriculumId: "cur_tag_declined",
      title: "Not declined tag topic",
    });
    await insertTag({ id: "tag_declined_marker", name: "declinedtagmarker" });
    await insertTagAssignment({
      id: "ta_declined_1",
      tagId: "tag_declined_marker",
      nodeType: "topic",
      nodeId: "top_tag_declined",
    });
    await insertTagAssignment({
      id: "ta_declined_2",
      tagId: "tag_declined_marker",
      nodeType: "topic",
      nodeId: "top_tag_not_declined",
    });

    const results = await searchByTagNameAcrossNodes("declinedtagmarker", 10);

    const ids = results.map((r) => r.id);
    expect(ids).not.toContain("top_tag_declined");
    expect(ids).toContain("top_tag_not_declined");
  });

  it("caps matching tags at 50 instead of pulling every matching tag row", async () => {
    await client.query(
      `INSERT INTO tags (id, name, normalized_name)
       SELECT 'tag_name_cap_' || lpad(g::text, 4, '0'), 'tagnamecapmarker' || lpad(g::text, 4, '0'), 'tagnamecapmarker' || lpad(g::text, 4, '0')
       FROM generate_series(1, 51) AS g`,
    );
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id)
       SELECT 'bit_tag_name_cap_' || lpad(g::text, 4, '0'), 'src_tag_name_cap_' || lpad(g::text, 4, '0'), 1, 'Tag name cap marker bit ' || lpad(g::text, 4, '0'), NULL
       FROM generate_series(1, 51) AS g`,
    );
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id)
       SELECT 'ta_tag_name_cap_' || g, 'tag_name_cap_' || lpad(g::text, 4, '0'), 'knowledgeBit', 'bit_tag_name_cap_' || lpad(g::text, 4, '0')
       FROM generate_series(1, 51) AS g`,
    );

    const results = await searchByTagNameAcrossNodes("tagnamecapmarker", 1000);

    expect(results).toHaveLength(50);
  });

  it("caps tag assignments at 500 instead of pulling every assignment row", async () => {
    await insertTag({ id: "tag_assignment_cap", name: "assignmentcapmarker" });
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id)
       SELECT 'bit_assignment_cap_' || g, 'src_assignment_cap_' || g, 1, 'Assignment cap marker bit ' || g, NULL
       FROM generate_series(1, 501) AS g`,
    );
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id)
       SELECT 'ta_assignment_cap_' || g, 'tag_assignment_cap', 'knowledgeBit', 'bit_assignment_cap_' || g
       FROM generate_series(1, 501) AS g`,
    );

    const results = await searchByTagNameAcrossNodes("assignmentcapmarker", 1000);

    expect(results).toHaveLength(500);
  });

  it("keeps topics ahead of bits when the assignment cap is hit, matching the final merge order", async () => {
    await insertSubject({ id: "sub_kind_cap", name: "Kind cap subject" });
    await insertCurriculum({ id: "cur_kind_cap", subjectId: "sub_kind_cap", name: "Kind cap curriculum" });
    await insertModule({ id: "mod_kind_cap", curriculumId: "cur_kind_cap", title: "Kind cap module" });
    await insertTag({ id: "tag_kind_cap", name: "kindcapmarker" });

    for (let i = 0; i < 3; i += 1) {
      const topicId = `top_kind_cap_${i}`;

      await insertTopic({
        id: topicId,
        moduleId: "mod_kind_cap",
        curriculumId: "cur_kind_cap",
        title: `Kind cap topic ${i}`,
      });
      await insertTagAssignment({
        id: `ta_kind_cap_topic_${i}`,
        tagId: "tag_kind_cap",
        nodeType: "topic",
        nodeId: topicId,
      });
    }

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id)
       SELECT 'bit_kind_cap_' || g, 'src_kind_cap_' || g, 1, 'Kind cap bit ' || g, NULL
       FROM generate_series(1, 501) AS g`,
    );
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id)
       SELECT 'ta_kind_cap_bit_' || g, 'tag_kind_cap', 'knowledgeBit', 'bit_kind_cap_' || g
       FROM generate_series(1, 501) AS g`,
    );

    const results = await searchByTagNameAcrossNodes("kindcapmarker", 1000);

    expect(results.filter((r) => r.kind === "topic")).toHaveLength(3);
  });
});
