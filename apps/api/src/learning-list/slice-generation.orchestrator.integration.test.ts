import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const mockAgentGenerate = vi.fn();
const mockGuardedFetchText = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { learningListSlice: "learningListSlice" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/guarded-fetch.js", () => ({
  FETCH_TIMEOUT_MS: 15_000,
  guardedFetchText: (...args: unknown[]) => mockGuardedFetchText(...args),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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

const dbName = `slice_gen_${randomUUID().replace(/-/g, "_")}`;
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

const { generateSliceContent } = await import("./slice-generation.orchestrator.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterEach(() => {
  mockAgentGenerate.mockReset();
  mockGuardedFetchText.mockReset();
});

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

async function insertKnownPartsCourse(): Promise<{
  curriculumId: string;
  itemId: string;
  moduleIds: string[];
  sourceUrls: string[];
}> {
  const subjectId = `subj_${randomUUID()}`;
  const curriculumId = `cur_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, "Web"]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'curating')`,
    [curriculumId, subjectId, "Book series"],
  );

  const moduleIds: string[] = [];
  const sourceUrls: string[] = [];

  for (let index = 0; index < 2; index += 1) {
    const moduleId = `mod_${randomUUID()}`;
    const title = `Chapter ${index + 1} — Topic ${index + 1}`;
    const url = `https://github.com/owner/repo/blob/main/Chapter_${index + 1}.md`;

    await client.query(
      `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`,
      [moduleId, curriculumId, title, index + 1],
    );
    await client.query(
      `INSERT INTO sources (id, curriculum_id, kind, value, title) VALUES ($1, $2, 'link', $3, $4)`,
      [`src_${randomUUID()}`, curriculumId, url, title],
    );

    moduleIds.push(moduleId);
    sourceUrls.push(url);
  }

  const itemId = `llitem_${randomUUID()}`;

  await client.query(
    `INSERT INTO learning_list_items (id, kind, status, curriculum_id, question_ceiling, questions_generated)
     VALUES ($1, 'article', 'course_created', $2, 30, 0)`,
    [itemId, curriculumId],
  );

  return { curriculumId, itemId, moduleIds, sourceUrls };
}

async function topicsForModule(moduleId: string): Promise<{ id: string; title: string }[]> {
  const rows = await client.query(`SELECT id, title FROM topics WHERE module_id = $1`, [moduleId]);

  return rows.rows;
}

function fetchOk(text: string) {
  return { ok: true, finalUrl: "https://example.com", status: 200, text, truncated: false };
}

function fetchFailed() {
  return { ok: false, outcome: "network_error" as const };
}

describe("generateSliceContent — known-parts course fills the next empty module from its own text", () => {
  it("targets the first empty module and generates from that module's own document alone", async () => {
    const { curriculumId, itemId, moduleIds, sourceUrls } = await insertKnownPartsCourse();

    mockGuardedFetchText.mockImplementation(async (url: string) =>
      url === sourceUrls[0] ? fetchOk("Real chapter one content about prompt chaining.") : fetchOk("Chapter two content."),
    );
    mockAgentGenerate.mockResolvedValueOnce({
      object: { topics: [{ title: "Prompt chaining basics", summary: null, gaps: [{ label: "g1", depth: "working" }] }] },
    });

    const released = await generateSliceContent(itemId, { curriculumId, topicCount: 3, questionCount: 6 }, new Date().toISOString());

    expect(released).not.toBeNull();
    expect(mockGuardedFetchText).toHaveBeenCalledTimes(1);
    expect(mockGuardedFetchText).toHaveBeenCalledWith(sourceUrls[0], expect.anything());

    const prompt = mockAgentGenerate.mock.calls[0]![0] as string;

    expect(prompt).toContain("Real chapter one content about prompt chaining.");
    expect(prompt).not.toContain("Chapter two content.");

    expect(await topicsForModule(moduleIds[0]!)).toHaveLength(1);
    expect(await topicsForModule(moduleIds[1]!)).toHaveLength(0);
  });

  it("skips a part whose document cannot be fetched and fills the next fetchable one instead", async () => {
    const { curriculumId, itemId, moduleIds, sourceUrls } = await insertKnownPartsCourse();

    mockGuardedFetchText.mockImplementation(async (url: string) =>
      url === sourceUrls[0] ? fetchFailed() : fetchOk("Chapter two content, fully fetchable."),
    );
    mockAgentGenerate.mockResolvedValueOnce({
      object: { topics: [{ title: "Chapter two topic", summary: null, gaps: [{ label: "g1", depth: "working" }] }] },
    });

    const released = await generateSliceContent(itemId, { curriculumId, topicCount: 3, questionCount: 6 }, new Date().toISOString());

    expect(released).not.toBeNull();
    expect(mockGuardedFetchText).toHaveBeenCalledTimes(2);

    expect(await topicsForModule(moduleIds[0]!)).toHaveLength(0);
    expect(await topicsForModule(moduleIds[1]!)).toHaveLength(1);
  });

  it("releases nothing, without creating a generic module, when every remaining part is unfetchable", async () => {
    const { curriculumId, itemId, moduleIds } = await insertKnownPartsCourse();

    mockGuardedFetchText.mockResolvedValue(fetchFailed());

    const released = await generateSliceContent(itemId, { curriculumId, topicCount: 3, questionCount: 6 }, new Date().toISOString());

    expect(released).toBeNull();
    expect(mockAgentGenerate).not.toHaveBeenCalled();
    expect(await topicsForModule(moduleIds[0]!)).toHaveLength(0);
    expect(await topicsForModule(moduleIds[1]!)).toHaveLength(0);

    const modules = await client.query(`SELECT id FROM modules WHERE curriculum_id = $1`, [curriculumId]);

    expect(modules.rowCount).toBe(2);
  });

  it("does not re-fetch a part whose text is already cached on its source row", async () => {
    const { curriculumId, itemId, sourceUrls } = await insertKnownPartsCourse();

    await client.query(`UPDATE sources SET fetched_text = 'Cached chapter one text.' WHERE value = $1`, [
      sourceUrls[0],
    ]);

    mockAgentGenerate.mockResolvedValueOnce({
      object: { topics: [{ title: "Topic from cache", summary: null, gaps: [{ label: "g1", depth: "working" }] }] },
    });

    const released = await generateSliceContent(itemId, { curriculumId, topicCount: 3, questionCount: 6 }, new Date().toISOString());

    expect(released).not.toBeNull();
    expect(mockGuardedFetchText).not.toHaveBeenCalled();
  });
});
