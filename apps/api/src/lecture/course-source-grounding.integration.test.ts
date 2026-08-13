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

const dbName = `lecture_course_grounding_${randomUUID().replace(/-/g, "_")}`;
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

const { hasCourseOwnSources, resolveCourseGroundingSources } = await import(
  "./course-source-grounding.js"
);

let client: pg.Client;

const createdSubjectIds: string[] = [];
const createdCurriculumIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  if (client && createdCurriculumIds.length > 0) {
    await client.query(`DELETE FROM topics WHERE curriculum_id = ANY($1)`, [
      createdCurriculumIds,
    ]);
    await client.query(`DELETE FROM modules WHERE curriculum_id = ANY($1)`, [
      createdCurriculumIds,
    ]);
    await client.query(`DELETE FROM sources WHERE curriculum_id = ANY($1)`, [
      createdCurriculumIds,
    ]);
    await client.query(`DELETE FROM curricula WHERE id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM subjects WHERE id = ANY($1)`, [createdSubjectIds]);
  }

  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function seedSubjectAndCurriculum(name: string): Promise<{
  subjectId: string;
  curriculumId: string;
}> {
  const subjectId = `sub_lecgnd_${randomUUID()}`;
  const curriculumId = `cur_lecgnd_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `lecture grounding ${subjectId}`],
  );
  createdSubjectIds.push(subjectId);

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    name,
  ]);
  createdCurriculumIds.push(curriculumId);

  return { subjectId, curriculumId };
}

async function insertSource(input: {
  curriculumId: string;
  kind: string;
  value: string;
  title: string;
  fetchedText: string | null;
  approvalStatus?: string;
}): Promise<string> {
  const sourceId = `src_lecgnd_${randomUUID()}`;

  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title, fetched_text, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      sourceId,
      input.curriculumId,
      input.kind,
      input.value,
      input.title,
      input.fetchedText,
      input.approvalStatus ?? "approved",
    ],
  );

  return sourceId;
}

async function insertModuleAndTopic(input: {
  curriculumId: string;
  moduleTitle: string;
  topicTitle: string;
  sourceId: string | null;
}): Promise<string> {
  const moduleId = `mod_lecgnd_${randomUUID()}`;
  const topicId = `top_lecgnd_${randomUUID()}`;

  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, input.curriculumId, input.moduleTitle],
  );

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", source_id)
     VALUES ($1, $2, $3, $4, 1, $5)`,
    [topicId, moduleId, input.curriculumId, input.topicTitle, input.sourceId],
  );

  return topicId;
}

describe("course-source-grounding", () => {
  it("grounds a flat learning-list course's lecture in its own captured article, no approval needed", async () => {
    const { curriculumId } = await seedSubjectAndCurriculum("Captured article course");
    const sourceId = await insertSource({
      curriculumId,
      kind: "link",
      value: "https://example.com/captured-article",
      title: "Captured article",
      fetchedText: "x".repeat(300),
    });
    const topicId = await insertModuleAndTopic({
      curriculumId,
      moduleTitle: "Slice 1",
      topicTitle: "Intro",
      sourceId,
    });

    expect(await hasCourseOwnSources(topicId)).toBe(true);

    const resolved = await resolveCourseGroundingSources(topicId);

    expect(resolved).toEqual([
      { title: "Captured article", url: "https://example.com/captured-article", text: "x".repeat(300) },
    ]);
  }, 30_000);

  it("grounds a chapter's lecture in that chapter's own document for a part-shaped course, not the whole book", async () => {
    const { curriculumId } = await seedSubjectAndCurriculum("Part-shaped book course");
    const chapterOneSourceId = await insertSource({
      curriculumId,
      kind: "link",
      value: "https://example.com/book/chapter-1",
      title: "Chapter 1",
      fetchedText: "chapter one content ".repeat(20),
    });
    const chapterTwoSourceId = await insertSource({
      curriculumId,
      kind: "link",
      value: "https://example.com/book/chapter-2",
      title: "Chapter 2",
      fetchedText: "chapter two content ".repeat(20),
    });
    const chapterTwoTopicId = await insertModuleAndTopic({
      curriculumId,
      moduleTitle: "Chapter 2",
      topicTitle: "Chapter 2 topic",
      sourceId: chapterTwoSourceId,
    });

    const resolved = await resolveCourseGroundingSources(chapterTwoTopicId);

    expect(resolved).toHaveLength(1);
    expect(resolved?.[0]?.url).toBe("https://example.com/book/chapter-2");
    expect(resolved?.[0]?.text).not.toContain("chapter one content");
    expect(chapterOneSourceId).not.toBe(chapterTwoSourceId);
  }, 30_000);

  it("requires the manual gather-and-approve flow for a course created by research rather than a pasted link", async () => {
    const { curriculumId } = await seedSubjectAndCurriculum("Research-origin course");

    await insertSource({
      curriculumId,
      kind: "web_research",
      value: "researched topic",
      title: "Research grounding",
      fetchedText: "x".repeat(300),
    });

    const topicId = await insertModuleAndTopic({
      curriculumId,
      moduleTitle: "Module",
      topicTitle: "Topic",
      sourceId: null,
    });

    expect(await hasCourseOwnSources(topicId)).toBe(false);
    expect(await resolveCourseGroundingSources(topicId)).toBeNull();
  }, 30_000);

  it("requires the manual flow rather than widening to the whole book when a topic's own chapter source is not approved", async () => {
    const { curriculumId } = await seedSubjectAndCurriculum("Unapproved chapter source course");
    const approvedElsewhereSourceId = await insertSource({
      curriculumId,
      kind: "link",
      value: "https://example.com/book/chapter-1",
      title: "Chapter 1",
      fetchedText: "chapter one content ".repeat(20),
    });
    const pendingChapterSourceId = await insertSource({
      curriculumId,
      kind: "link",
      value: "https://example.com/book/chapter-2",
      title: "Chapter 2",
      fetchedText: "chapter two content ".repeat(20),
      approvalStatus: "pending",
    });
    const chapterTwoTopicId = await insertModuleAndTopic({
      curriculumId,
      moduleTitle: "Chapter 2",
      topicTitle: "Chapter 2 topic",
      sourceId: pendingChapterSourceId,
    });

    expect(await hasCourseOwnSources(chapterTwoTopicId)).toBe(false);
    expect(await resolveCourseGroundingSources(chapterTwoTopicId)).toBeNull();
    expect(approvedElsewhereSourceId).not.toBe(pendingChapterSourceId);
  }, 30_000);

  it("requires the manual flow when a sources-origin course has no approved sources of its own", async () => {
    const { curriculumId } = await seedSubjectAndCurriculum("Pending-only course");

    await insertSource({
      curriculumId,
      kind: "link",
      value: "https://example.com/pending",
      title: "Pending source",
      fetchedText: "x".repeat(300),
      approvalStatus: "pending",
    });

    const topicId = await insertModuleAndTopic({
      curriculumId,
      moduleTitle: "Module",
      topicTitle: "Topic",
      sourceId: null,
    });

    expect(await hasCourseOwnSources(topicId)).toBe(false);
    expect(await resolveCourseGroundingSources(topicId)).toBeNull();
  }, 30_000);
});
