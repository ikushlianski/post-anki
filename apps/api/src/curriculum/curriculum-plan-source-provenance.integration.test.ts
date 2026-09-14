import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// learn-from-doc-site (issue #103, item 1) — a docs-path topic's
// `sourceUrl` (the SOURCE_URL marker echoed back by the architect agent,
// see source-text.ts + structureSnapshotTopicSchema) must round-trip into
// `topics.sourceId` when `saveCurriculumPlan` writes the topic, for both
// source kinds a docs-site crawl produces ("link" and "llms_txt"). Without
// this, lazy per-topic question generation (probe.service.ts) and "go
// deeper" re-fetch (topic.controller.ts) silently never fire for any
// docs-site-derived topic.

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

const dbName = `curr_plan_prov_${randomUUID().replace(/-/g, "_")}`;
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

const { saveCurriculumPlan } = await import("./curriculum.repo.js");

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
    [subjectId, `provenance subject ${subjectId}`],
  );
}

async function insertCurriculum(curriculumId: string, subjectId: string): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'shaping_structure')`,
    [curriculumId, subjectId, "Docs-site course"],
  );
}

async function insertSource(
  sourceId: string,
  curriculumId: string,
  kind: string,
  value: string,
): Promise<void> {
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title) VALUES ($1, $2, $3, $4, $5)`,
    [sourceId, curriculumId, kind, value, `title for ${value}`],
  );
}

async function topicRowsFor(
  curriculumId: string,
): Promise<{ title: string; sourceId: string | null }[]> {
  const { rows } = await client.query<{ title: string; source_id: string | null }>(
    `SELECT title, source_id FROM topics WHERE curriculum_id = $1 ORDER BY title`,
    [curriculumId],
  );

  return rows.map((r) => ({ title: r.title, sourceId: r.source_id }));
}

describe("saveCurriculumPlan — docs-path sourceUrl resolves to topics.sourceId", () => {
  it("writes sourceId for a topic grounded in a link-kind crawled page", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("curr");
    await insertCurriculum(curriculumId, subjectId);

    const linkSourceId = id("src");
    await insertSource(linkSourceId, curriculumId, "link", "https://docs.example.com/intro");

    await saveCurriculumPlan(curriculumId, {
      modules: [
        {
          title: "Getting started",
          level: "basic",
          tags: [],
          topics: [
            {
              title: "Introduction",
              summary: null,
              suggestedDepth: "working",
              sourceUrl: "https://docs.example.com/intro",
            },
          ],
        },
      ],
    });

    const topicRows = await topicRowsFor(curriculumId);

    expect(topicRows).toEqual([{ title: "Introduction", sourceId: linkSourceId }]);
  });

  it("writes sourceId for a topic grounded in an llms_txt-kind crawled page", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("curr");
    await insertCurriculum(curriculumId, subjectId);

    const llmsTxtSourceId = id("src");
    await insertSource(
      llmsTxtSourceId,
      curriculumId,
      "llms_txt",
      "https://docs.example.com/llms.txt/guide",
    );

    await saveCurriculumPlan(curriculumId, {
      modules: [
        {
          title: "Guide",
          level: "basic",
          tags: [],
          topics: [
            {
              title: "Guide overview",
              summary: null,
              suggestedDepth: "working",
              sourceUrl: "https://docs.example.com/llms.txt/guide",
            },
          ],
        },
      ],
    });

    const topicRows = await topicRowsFor(curriculumId);

    expect(topicRows).toEqual([{ title: "Guide overview", sourceId: llmsTxtSourceId }]);
  });

  it("leaves sourceId null when the topic's sourceUrl matches no known source", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId);

    const curriculumId = id("curr");
    await insertCurriculum(curriculumId, subjectId);

    await saveCurriculumPlan(curriculumId, {
      modules: [
        {
          title: "Untraceable",
          level: "basic",
          tags: [],
          topics: [
            { title: "No provenance", summary: null, suggestedDepth: "working", sourceUrl: null },
          ],
        },
      ],
    });

    const topicRows = await topicRowsFor(curriculumId);

    expect(topicRows).toEqual([{ title: "No provenance", sourceId: null }]);
  });
});
