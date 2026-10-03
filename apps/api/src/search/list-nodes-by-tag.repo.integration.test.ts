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

const dbName = `list_nodes_by_tag_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { listNodesByTagId, LIST_TAG_NODES_LIMIT } = await import("./list-nodes-by-tag.repo.js");

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
  approvalState?: "pending" | "approved" | "rejected";
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, approval_state) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      overrides.id,
      overrides.knowledgeSourceId,
      overrides.ordinal,
      overrides.body,
      overrides.topicId ?? null,
      overrides.approvalState ?? "approved",
    ],
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

describe("listNodesByTagId", () => {
  it("returns every topic, module, and knowledge bit assigned the exact tag id", async () => {
    await insertSubject({ id: "sub_list_1", name: "Engineering practice" });
    await insertCurriculum({ id: "cur_list_1", subjectId: "sub_list_1", name: "Reliability" });
    await insertModule({ id: "mod_list_1", curriculumId: "cur_list_1", title: "Resilience" });
    await insertTopic({
      id: "top_list_1",
      moduleId: "mod_list_1",
      curriculumId: "cur_list_1",
      title: "Timeouts and retries",
    });
    await insertKnowledgeBit({
      id: "bit_list_1",
      knowledgeSourceId: "src_list_1",
      ordinal: 1,
      body: "Retry budgets cap cascading failure",
      topicId: "top_list_1",
    });
    await insertTag({ id: "tag_perf_1", name: "performance" });
    await insertTagAssignment({ id: "ta_1", tagId: "tag_perf_1", nodeType: "topic", nodeId: "top_list_1" });
    await insertTagAssignment({ id: "ta_2", tagId: "tag_perf_1", nodeType: "module", nodeId: "mod_list_1" });
    await insertTagAssignment({ id: "ta_3", tagId: "tag_perf_1", nodeType: "knowledgeBit", nodeId: "bit_list_1" });

    const { nodes, capped } = await listNodesByTagId("tag_perf_1");

    const kinds = nodes.map((r) => r.kind).sort();
    expect(kinds).toEqual(["bit", "module", "topic"]);
    expect(capped).toBe(false);
    for (const node of nodes) {
      expect(node.tags.map((tag) => tag.name)).toContain("performance");
      expect(node.tags.map((tag) => tag.id)).toContain("tag_perf_1");
    }
  });

  it("does not match a different tag whose name merely shares a substring", async () => {
    await insertSubject({ id: "sub_list_2", name: "Engineering practice" });
    await insertCurriculum({ id: "cur_list_2", subjectId: "sub_list_2", name: "Reliability" });
    await insertModule({ id: "mod_list_2", curriculumId: "cur_list_2", title: "Resilience" });
    await insertTopic({
      id: "top_list_2a",
      moduleId: "mod_list_2",
      curriculumId: "cur_list_2",
      title: "Performance tuning",
    });
    await insertTopic({
      id: "top_list_2b",
      moduleId: "mod_list_2",
      curriculumId: "cur_list_2",
      title: "Performance budgeting",
    });
    await insertTag({ id: "tag_perf_2", name: "latency" });
    await insertTag({ id: "tag_perf_budget_2", name: "latency-budget" });
    await insertTagAssignment({ id: "ta_4", tagId: "tag_perf_2", nodeType: "topic", nodeId: "top_list_2a" });
    await insertTagAssignment({
      id: "ta_5",
      tagId: "tag_perf_budget_2",
      nodeType: "topic",
      nodeId: "top_list_2b",
    });

    const { nodes } = await listNodesByTagId("tag_perf_2");

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.id).toBe("top_list_2a");
  });

  it("returns a null curriculum context for an unplaced knowledge bit", async () => {
    await insertKnowledgeBit({
      id: "bit_list_unplaced_1",
      knowledgeSourceId: "src_list_2",
      ordinal: 1,
      body: "Nock provides a convenient syntax for defining external service behavior",
    });
    await insertTag({ id: "tag_unplaced_1", name: "mocking" });
    await insertTagAssignment({
      id: "ta_6",
      tagId: "tag_unplaced_1",
      nodeType: "knowledgeBit",
      nodeId: "bit_list_unplaced_1",
    });

    const { nodes } = await listNodesByTagId("tag_unplaced_1");

    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.curriculumId).toBeNull();
    expect(nodes[0]?.curriculumName).toBeNull();
  });

  it("should exclude a pending or rejected bit carrying the tag, but still return an approved sibling", async () => {
    await insertKnowledgeBit({
      id: "bit_list_pending_1",
      knowledgeSourceId: "src_list_pending_1",
      ordinal: 1,
      body: "Pending list bit",
      approvalState: "pending",
    });
    await insertKnowledgeBit({
      id: "bit_list_rejected_1",
      knowledgeSourceId: "src_list_rejected_1",
      ordinal: 1,
      body: "Rejected list bit",
      approvalState: "rejected",
    });
    await insertKnowledgeBit({
      id: "bit_list_approved_1",
      knowledgeSourceId: "src_list_approved_1",
      ordinal: 1,
      body: "Approved list bit",
    });
    await insertTag({ id: "tag_list_pending", name: "pendinglistmarker" });
    await insertTagAssignment({
      id: "ta_list_pending_1",
      tagId: "tag_list_pending",
      nodeType: "knowledgeBit",
      nodeId: "bit_list_pending_1",
    });
    await insertTagAssignment({
      id: "ta_list_pending_3",
      tagId: "tag_list_pending",
      nodeType: "knowledgeBit",
      nodeId: "bit_list_rejected_1",
    });
    await insertTagAssignment({
      id: "ta_list_pending_2",
      tagId: "tag_list_pending",
      nodeType: "knowledgeBit",
      nodeId: "bit_list_approved_1",
    });

    const { nodes } = await listNodesByTagId("tag_list_pending");

    const ids = nodes.map((n) => n.id);
    expect(ids).not.toContain("bit_list_rejected_1");
    expect(ids).not.toContain("bit_list_pending_1");
    expect(ids).toContain("bit_list_approved_1");
  });

  it("returns nothing for a tag id that doesn't exist", async () => {
    const { nodes, capped } = await listNodesByTagId("tag_does_not_exist");

    expect(nodes).toEqual([]);
    expect(capped).toBe(false);
  });

  it("excludes a declined topic carrying the tag, but still returns a non-declined sibling", async () => {
    await insertSubject({ id: "sub_list_declined", name: "Declined list subject" });
    await insertCurriculum({ id: "cur_list_declined", subjectId: "sub_list_declined", name: "Declined list curriculum" });
    await insertModule({ id: "mod_list_declined", curriculumId: "cur_list_declined", title: "Declined list module" });
    await insertTopic({
      id: "top_list_declined",
      moduleId: "mod_list_declined",
      curriculumId: "cur_list_declined",
      title: "Declined list topic",
      releaseState: "declined",
    });
    await insertTopic({
      id: "top_list_not_declined",
      moduleId: "mod_list_declined",
      curriculumId: "cur_list_declined",
      title: "Not declined list topic",
    });
    await insertTag({ id: "tag_list_declined", name: "declinedlistmarker" });
    await insertTagAssignment({
      id: "ta_list_declined_1",
      tagId: "tag_list_declined",
      nodeType: "topic",
      nodeId: "top_list_declined",
    });
    await insertTagAssignment({
      id: "ta_list_declined_2",
      tagId: "tag_list_declined",
      nodeType: "topic",
      nodeId: "top_list_not_declined",
    });

    const { nodes } = await listNodesByTagId("tag_list_declined");

    const ids = nodes.map((n) => n.id);
    expect(ids).not.toContain("top_list_declined");
    expect(ids).toContain("top_list_not_declined");
  });

  it("caps the result at LIST_TAG_NODES_LIMIT and reports capped: true when a tag has more assignments than the limit", async () => {
    await insertTag({ id: "tag_cap_over", name: "overcapacity" });
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, approval_state)
       SELECT 'bit_cap_over_' || g, 'src_cap_over_' || g, 1, 'Capped bit ' || g, NULL, 'approved'
       FROM generate_series(1, $1) AS g`,
      [LIST_TAG_NODES_LIMIT + 1],
    );
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id)
       SELECT 'ta_cap_over_' || g, $1, 'knowledgeBit', 'bit_cap_over_' || g
       FROM generate_series(1, $2) AS g`,
      ["tag_cap_over", LIST_TAG_NODES_LIMIT + 1],
    );

    const { nodes, capped } = await listNodesByTagId("tag_cap_over");

    expect(nodes).toHaveLength(LIST_TAG_NODES_LIMIT);
    expect(capped).toBe(true);
  });

  it("does not report capped when a tag has exactly LIST_TAG_NODES_LIMIT assignments", async () => {
    await insertTag({ id: "tag_cap_exact", name: "exactcapacity" });
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, approval_state)
       SELECT 'bit_cap_exact_' || g, 'src_cap_exact_' || g, 1, 'Exact bit ' || g, NULL, 'approved'
       FROM generate_series(1, $1) AS g`,
      [LIST_TAG_NODES_LIMIT],
    );
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id)
       SELECT 'ta_cap_exact_' || g, $1, 'knowledgeBit', 'bit_cap_exact_' || g
       FROM generate_series(1, $2) AS g`,
      ["tag_cap_exact", LIST_TAG_NODES_LIMIT],
    );

    const { nodes, capped } = await listNodesByTagId("tag_cap_exact");

    expect(nodes).toHaveLength(LIST_TAG_NODES_LIMIT);
    expect(capped).toBe(false);
  });

  it("keeps topics ahead of bits in the capped set, matching the kind ordering the browse UI displays", async () => {
    await insertSubject({ id: "sub_cap_kind", name: "Kind ordering" });
    await insertCurriculum({ id: "cur_cap_kind", subjectId: "sub_cap_kind", name: "Kind ordering" });
    await insertModule({ id: "mod_cap_kind", curriculumId: "cur_cap_kind", title: "Kind ordering" });
    await insertTag({ id: "tag_cap_kind", name: "kindordering" });

    for (let i = 0; i < 3; i += 1) {
      const topicId = `top_cap_kind_${i}`;

      await insertTopic({
        id: topicId,
        moduleId: "mod_cap_kind",
        curriculumId: "cur_cap_kind",
        title: `Kind ordering topic ${i}`,
      });
      await insertTagAssignment({
        id: `ta_cap_kind_topic_${i}`,
        tagId: "tag_cap_kind",
        nodeType: "topic",
        nodeId: topicId,
      });
    }

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, topic_id, approval_state)
       SELECT 'bit_cap_kind_' || g, 'src_cap_kind_' || g, 1, 'Kind ordering bit ' || g, NULL, 'approved'
       FROM generate_series(1, $1) AS g`,
      [LIST_TAG_NODES_LIMIT + 1],
    );
    await client.query(
      `INSERT INTO tag_assignments (id, tag_id, node_type, node_id)
       SELECT 'ta_cap_kind_bit_' || g, $1, 'knowledgeBit', 'bit_cap_kind_' || g
       FROM generate_series(1, $2) AS g`,
      ["tag_cap_kind", LIST_TAG_NODES_LIMIT + 1],
    );

    const { nodes, capped } = await listNodesByTagId("tag_cap_kind");

    expect(capped).toBe(true);
    expect(nodes.filter((node) => node.kind === "topic")).toHaveLength(3);
  });
});
