import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// lms-buildout 0.2, 0.4, 0.5 — proves the three new topics columns against a
// real, freshly migrated throwaway Postgres database: depthElectedAt is
// surfaced on the read model and writable via updateTopic (0.4), and the
// releaseState/headroomOfferedAt repo-level accessors round-trip through the
// db (0.2, 0.5). Same fresh-DB-per-file pattern as
// curriculum-clear-structure-provenance.integration.test.ts.

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

const dbName = `topic_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { createTopic, updateTopic } = await import("./topic.repo.js");
const {
  getTopicRow,
  rowReleaseState,
  setTopicReleaseState,
  rowHeadroomOfferedAt,
  setTopicHeadroomOfferedAt,
} = await import("./topic-progress.repo.js");

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
    [subjectId, `topic repo subject ${subjectId}`],
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
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, `module ${moduleId}`],
  );
}

describe("createTopic / updateTopic — depthElectedAt (lms-buildout 0.4)", () => {
  let subjectId: string;
  let curriculumId: string;
  let moduleId: string;

  beforeAll(async () => {
    subjectId = id("sub");
    curriculumId = id("curr");
    moduleId = id("mod");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
  });

  it("starts a newly created topic with depthElectedAt null", async () => {
    const topic = await createTopic({ moduleId, title: "New topic" });

    expect(topic?.depthElectedAt).toBeNull();
  });

  it("is writable via updateTopic and round-trips as an ISO string", async () => {
    const created = await createTopic({ moduleId, title: "Elect me" });
    const electedAt = new Date("2026-01-01T00:00:00.000Z").toISOString();

    const updated = await updateTopic({
      topicId: created!.id,
      depthElectedAt: electedAt,
    });

    expect(updated?.depthElectedAt).toBe(electedAt);

    const row = await getTopicRow(created!.id);

    expect(row?.depthElectedAt?.toISOString()).toBe(electedAt);
  });

  it("clears depthElectedAt back to null when explicitly set to null", async () => {
    const created = await createTopic({ moduleId, title: "Un-elect me" });

    await updateTopic({
      topicId: created!.id,
      depthElectedAt: new Date().toISOString(),
    });

    const cleared = await updateTopic({ topicId: created!.id, depthElectedAt: null });

    expect(cleared?.depthElectedAt).toBeNull();
  });

  it("leaves depthElectedAt untouched when the field is omitted from the patch", async () => {
    const created = await createTopic({ moduleId, title: "Leave me alone" });
    const electedAt = new Date("2026-02-02T00:00:00.000Z").toISOString();

    await updateTopic({ topicId: created!.id, depthElectedAt: electedAt });

    const untouched = await updateTopic({ topicId: created!.id, title: "Renamed" });

    expect(untouched?.depthElectedAt).toBe(electedAt);
  });
});

describe("topic-progress.repo — releaseState accessor (lms-buildout 0.2)", () => {
  let subjectId: string;
  let curriculumId: string;
  let moduleId: string;
  let topicId: string;

  beforeAll(async () => {
    subjectId = id("sub");
    curriculumId = id("curr");
    moduleId = id("mod");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);

    const created = await createTopic({ moduleId, title: "Release state topic" });

    topicId = created!.id;
  });

  it("reads null for a topic that predates this column", async () => {
    const row = await getTopicRow(topicId);

    expect(rowReleaseState(row!)).toBeNull();
  });

  it("round-trips 'declined' through setTopicReleaseState", async () => {
    await setTopicReleaseState(topicId, "declined");

    const row = await getTopicRow(topicId);

    expect(rowReleaseState(row!)).toBe("declined");
  });

  it("clears back to null (releasable again) when set to null", async () => {
    await setTopicReleaseState(topicId, "declined");
    await setTopicReleaseState(topicId, null);

    const row = await getTopicRow(topicId);

    expect(rowReleaseState(row!)).toBeNull();
  });
});

describe("topic-progress.repo — headroomOfferedAt accessor (lms-buildout 0.5)", () => {
  let subjectId: string;
  let curriculumId: string;
  let moduleId: string;
  let topicId: string;

  beforeAll(async () => {
    subjectId = id("sub");
    curriculumId = id("curr");
    moduleId = id("mod");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);

    const created = await createTopic({ moduleId, title: "Headroom offer topic" });

    topicId = created!.id;
  });

  it("reads null for a topic never offered headroom", async () => {
    const row = await getTopicRow(topicId);

    expect(rowHeadroomOfferedAt(row!)).toBeNull();
  });

  it("round-trips an ISO timestamp through setTopicHeadroomOfferedAt", async () => {
    const offeredAt = new Date("2026-03-03T00:00:00.000Z").toISOString();

    await setTopicHeadroomOfferedAt(topicId, offeredAt);

    const row = await getTopicRow(topicId);

    expect(rowHeadroomOfferedAt(row!)).toBe(offeredAt);
  });
});
