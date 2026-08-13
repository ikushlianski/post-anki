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

const dbName = `note_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { insertNote, listNotesForNode, listNotesForReviewPool, markNoteSurfaced } = await import(
  "./note.repo.js"
);
const { searchNotes } = await import("./note-search.repo.js");
const { selectNoteForReview } = await import("@post-anki/core");

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

async function insertSubject(subjectId: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `note repo subject ${subjectId}`],
  );
}

async function insertDomainNode(
  nodeId: string,
  subjectId: string,
  parentId: string | null,
  name: string,
): Promise<void> {
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source) VALUES ($1, $2, $3, $4, 0, 'static_taxonomy')`,
    [nodeId, subjectId, parentId, name],
  );
}

async function insertCurriculum(curriculumId: string, subjectId: string): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    `curriculum ${curriculumId}`,
  ]);
}

async function insertModule(moduleId: string, curriculumId: string): Promise<void> {
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 0)`,
    [moduleId, curriculumId],
  );
}

async function insertTopic(topicId: string, moduleId: string, curriculumId: string): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, 'Topic', 0)`,
    [topicId, moduleId, curriculumId],
  );
}

async function insertGap(gapId: string, topicId: string): Promise<void> {
  await client.query(`INSERT INTO gaps (id, topic_id, label) VALUES ($1, $2, 'Gap label')`, [
    gapId,
    topicId,
  ]);
}

async function insertSource(sourceId: string, curriculumId: string): Promise<void> {
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value) VALUES ($1, $2, 'text', 'source text')`,
    [sourceId, curriculumId],
  );
}

async function insertConfirmedMapping(curriculumId: string, domainNodeId: string): Promise<void> {
  await client.query(
    `INSERT INTO curriculum_domain_node_mappings (id, curriculum_id, domain_node_id, status, source) VALUES ($1, $2, $3, 'confirmed', 'manual')`,
    [id("cdnm"), curriculumId, domainNodeId],
  );
}

describe("capture — SCENARIO 1/2/3", () => {
  it("captures a note against a topic and it is retrievable by nodeType/nodeId", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertTopic(topicId, moduleId, curriculumId);

    await insertNote({ nodeType: "topic", nodeId: topicId, body: "a topic note", isHighlight: false });

    const notesForTopic = await listNotesForNode("topic", topicId);

    expect(notesForTopic).toHaveLength(1);
    expect(notesForTopic[0]?.body).toBe("a topic note");
    expect(notesForTopic[0]?.isHighlight).toBe(false);
  });

  it("allows multiple notes against the same gap with no uniqueness constraint", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");
    const gapId = id("gap");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertTopic(topicId, moduleId, curriculumId);
    await insertGap(gapId, topicId);

    await insertNote({ nodeType: "gap", nodeId: gapId, body: "first note on gap", isHighlight: false });
    await insertNote({ nodeType: "gap", nodeId: gapId, body: "second note on gap", isHighlight: false });

    const notesForGap = await listNotesForNode("gap", gapId);

    expect(notesForGap).toHaveLength(2);
  });

  it("captures a highlight against a source with the same required fields as a plain note", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSource(sourceId, curriculumId);

    const captured = await insertNote({
      nodeType: "source",
      nodeId: sourceId,
      body: "a quoted passage",
      isHighlight: true,
    });

    expect(captured.isHighlight).toBe(true);

    const notesForSource = await listNotesForNode("source", sourceId);

    expect(notesForSource).toHaveLength(1);
    expect(notesForSource[0]?.isHighlight).toBe(true);
  });
});

describe("searchNotes — SCENARIO 5, full-text ranking + GIN index", () => {
  it("ranks a note using the search term twice above one using it once", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertTopic(topicId, moduleId, curriculumId);

    await insertNote({
      nodeType: "topic",
      nodeId: topicId,
      body: "idempotency matters a lot, idempotency is key",
      isHighlight: false,
    });
    await insertNote({
      nodeType: "topic",
      nodeId: topicId,
      body: "idempotency matters",
      isHighlight: false,
    });

    const results = await searchNotes({ query: "idempotency" });

    expect(results).toHaveLength(2);
    expect(results[0]?.body).toBe("idempotency matters a lot, idempotency is key");
  });

  it("only returns notes whose body matches the search term", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertTopic(topicId, moduleId, curriculumId);

    await insertNote({ nodeType: "topic", nodeId: topicId, body: "about caching", isHighlight: false });

    const results = await searchNotes({ query: "unrelated-term-xyz" });

    expect(results).toHaveLength(0);
  });

  it("uses the notes_search_vector_idx GIN index for a tsvector match, not a sequential scan", async () => {
    await client.query("SET enable_seqscan = off");

    const explainResult = await client.query(
      `EXPLAIN SELECT * FROM notes WHERE search_vector @@ plainto_tsquery('english', $1)`,
      ["idempotency"],
    );
    const planText = explainResult.rows.map((row) => row["QUERY PLAN"]).join("\n");

    expect(planText).toContain("notes_search_vector_idx");

    await client.query("SET enable_seqscan = on");
  });
});

describe("searchNotes — SCENARIO 7, concern filter", () => {
  it("filters results to the requested concern only", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertTopic(topicId, moduleId, curriculumId);

    await insertNote({
      nodeType: "topic",
      nodeId: topicId,
      body: "sharding notes on security",
      isHighlight: false,
      concern: "security",
    });
    await insertNote({
      nodeType: "topic",
      nodeId: topicId,
      body: "sharding notes on cost",
      isHighlight: false,
      concern: "cost",
    });

    const results = await searchNotes({ query: "sharding", concern: "security" });

    expect(results).toHaveLength(1);
    expect(results[0]?.concern).toBe("security");
  });
});

describe("searchNotes — SCENARIO 6/12, taxonomy subtree filter", () => {
  it("includes a note under a descendant Area and excludes one under an unrelated Area", async () => {
    const subjectId = id("sub");
    const areaId = id("dnode");
    const childId = id("dnode");
    const otherAreaId = id("dnode");

    await insertSubject(subjectId);
    await insertDomainNode(areaId, subjectId, null, "React");
    await insertDomainNode(childId, subjectId, areaId, "Hooks");
    await insertDomainNode(otherAreaId, subjectId, null, "Unrelated");

    const inCurriculumId = id("cur");
    const outCurriculumId = id("cur");
    const inModuleId = id("mod");
    const outModuleId = id("mod");
    const inTopicId = id("top");
    const outTopicId = id("top");

    await insertCurriculum(inCurriculumId, subjectId);
    await insertCurriculum(outCurriculumId, subjectId);
    await insertModule(inModuleId, inCurriculumId);
    await insertModule(outModuleId, outCurriculumId);
    await insertTopic(inTopicId, inModuleId, inCurriculumId);
    await insertTopic(outTopicId, outModuleId, outCurriculumId);

    await insertConfirmedMapping(inCurriculumId, childId);
    await insertConfirmedMapping(outCurriculumId, otherAreaId);

    await insertNote({
      nodeType: "topic",
      nodeId: inTopicId,
      body: "taxonomy scoped note in area",
      isHighlight: false,
    });
    await insertNote({
      nodeType: "topic",
      nodeId: outTopicId,
      body: "taxonomy scoped note out of area",
      isHighlight: false,
    });

    const results = await searchNotes({ query: "taxonomy scoped", domainNodeId: areaId });

    expect(results).toHaveLength(1);
    expect(results[0]?.nodeId).toBe(inTopicId);
  });

  it("returns an empty list for a domainNodeId that does not exist", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertTopic(topicId, moduleId, curriculumId);

    await insertNote({
      nodeType: "topic",
      nodeId: topicId,
      body: "orphan taxonomy note",
      isHighlight: false,
    });

    const results = await searchNotes({ query: "orphan taxonomy", domainNodeId: "missing-node" });

    expect(results).toHaveLength(0);
  });
});

describe("review pool — SCENARIO 9/11, pull-only, never-surfaced first, anti-repeat", () => {
  it("selects the never-surfaced note first, then updates lastSurfacedAt so the next pull picks the other one", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const topicId = id("top");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertTopic(topicId, moduleId, curriculumId);

    const first = await insertNote({ nodeType: "topic", nodeId: topicId, body: "first note", isHighlight: false });
    const second = await insertNote({ nodeType: "topic", nodeId: topicId, body: "second note", isHighlight: false });

    let pool = await listNotesForReviewPool();
    let candidates = pool
      .filter((note) => note.id === first.id || note.id === second.id)
      .map((note) => ({ id: note.id, lastSurfacedAt: note.lastSurfacedAt, createdAt: note.createdAt }));

    const firstPickId = selectNoteForReview(candidates, new Date().toISOString());

    expect(firstPickId).toBe(first.id);

    await markNoteSurfaced(first.id, new Date());

    pool = await listNotesForReviewPool();
    candidates = pool
      .filter((note) => note.id === first.id || note.id === second.id)
      .map((note) => ({ id: note.id, lastSurfacedAt: note.lastSurfacedAt, createdAt: note.createdAt }));

    const secondPickId = selectNoteForReview(candidates, new Date().toISOString());

    expect(secondPickId).toBe(second.id);

    const updatedFirst = pool.find((note) => note.id === first.id);

    expect(updatedFirst?.lastSurfacedAt).not.toBeNull();
  });
});
