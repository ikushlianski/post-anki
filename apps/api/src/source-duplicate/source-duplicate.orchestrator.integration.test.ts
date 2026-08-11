import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIO 3, 4, 5, 10 (.planning/content-library/scenarios.md) —
// triggerSourceDuplicateScan's two tiers, and resolveSourceDuplicateSuggestion's
// status-only write, against a real Postgres instance so the partial unique
// index and the cross-table "never touches sources" guarantee can be proven
// against real rows, not a mocked repo shape. Same technique as
// subject-duplicate.orchestrator.test.ts.

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

const dbName = `source_duplicate_orch_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { closeDb } = await import("../db/client.js");
const { triggerSourceDuplicateScan } = await import("./source-duplicate.orchestrator.js");
const {
  insertSourceDuplicateSuggestionIfNew,
  resolveSourceDuplicateSuggestion,
  listSourceDuplicateSuggestions,
} = await import("./source-duplicate.repo.js");

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
    [subjectId, `source dup subject ${subjectId}`],
  );
}

async function insertCurriculum(curriculumId: string, subjectId: string): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    `curriculum ${curriculumId}`,
  ]);
}

interface SourceRowInit {
  kind: string;
  value: string;
  title?: string | null;
  fetchedText?: string | null;
}

async function insertSourceRow(
  sourceId: string,
  curriculumId: string,
  init: SourceRowInit,
): Promise<void> {
  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value, title, fetched_text)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sourceId, curriculumId, init.kind, init.value, init.title ?? null, init.fetchedText ?? null],
  );
}

async function insertTopicWithSource(topicId: string, moduleId: string, curriculumId: string, sourceId: string): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", source_id) VALUES ($1, $2, $3, 'Topic', 0, $4)`,
    [topicId, moduleId, curriculumId, sourceId],
  );
}

async function insertModule(moduleId: string, curriculumId: string): Promise<void> {
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 0)`,
    [moduleId, curriculumId],
  );
}

function fakeEmbeddingForText(text: string): number[] {
  if (text.startsWith("Mirrored Article\n")) {
    return [1, 0.001, 0];
  }

  if (text.startsWith("Mirrored Article, Reposted\n")) {
    return [0.9995, 0.002, 0];
  }

  return [0.3, 0.3, 0.3];
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const init = args[1];
    const body = JSON.parse(String(init?.body)) as { input: string[]; model: string };
    const data = body.input.map((text, index) => ({
      index,
      embedding: fakeEmbeddingForText(text),
    }));

    return new Response(JSON.stringify({ data, model: body.model }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("triggerSourceDuplicateScan — SCENARIO 3 (exact URL, free, always on)", () => {
  it("suggests a url_match pair with similarity null and makes no embedding call for that pair's text", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceOneId = id("src");
    const sourceTwoId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceOneId, curriculumId, {
      kind: "link",
      value: "https://example.com/article/",
    });
    await insertSourceRow(sourceTwoId, curriculumId, {
      kind: "link",
      value: "https://example.com/article?utm_source=x",
    });

    const result = await triggerSourceDuplicateScan();

    const urlMatch = result.suggestions.find((s) => s.matchKind === "url_match");

    expect(urlMatch).toBeDefined();
    expect(urlMatch?.similarity).toBeNull();
    expect([urlMatch?.sourceAId, urlMatch?.sourceBId].sort()).toEqual(
      [sourceOneId, sourceTwoId].sort(),
    );
    expect(result.exactUrlPairsFound).toBe(1);
  });

  it("never matches two sources with genuinely different URLs", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceOneId = id("src");
    const sourceTwoId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceOneId, curriculumId, {
      kind: "link",
      value: "https://distinct-urls.example.com/one",
    });
    await insertSourceRow(sourceTwoId, curriculumId, {
      kind: "link",
      value: "https://distinct-urls.example.com/two",
    });

    const result = await triggerSourceDuplicateScan();

    const referencesBoth = result.suggestions.some(
      (s) =>
        s.matchKind === "url_match" &&
        (s.sourceAId === sourceOneId || s.sourceBId === sourceOneId) &&
        (s.sourceAId === sourceTwoId || s.sourceBId === sourceTwoId),
    );
    expect(referencesBoth).toBe(false);
  });
});

describe("triggerSourceDuplicateScan — SCENARIO 4 (embedding similarity, capped)", () => {
  it("suggests an embedding_similarity pair for near-identical content at different URLs, with a real similarity float", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceOneId = id("src");
    const sourceTwoId = id("src");
    const unrelatedId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceOneId, curriculumId, {
      kind: "link",
      value: "https://siteA.example.com/mirrored",
      title: "Mirrored Article",
      fetchedText: "the same underlying content",
    });
    await insertSourceRow(sourceTwoId, curriculumId, {
      kind: "link",
      value: "https://siteB.example.com/reposted",
      title: "Mirrored Article, Reposted",
      fetchedText: "the same underlying content, reposted elsewhere",
    });
    await insertSourceRow(unrelatedId, curriculumId, {
      kind: "text",
      value: "totally unrelated",
      title: "Unrelated",
      fetchedText: "totally unrelated content",
    });

    const result = await triggerSourceDuplicateScan();

    const embeddingMatch = result.suggestions.find((s) => s.matchKind === "embedding_similarity");

    expect(embeddingMatch).toBeDefined();
    expect(embeddingMatch?.similarity).toBeGreaterThan(0.86);
    expect([embeddingMatch?.sourceAId, embeddingMatch?.sourceBId].sort()).toEqual(
      [sourceOneId, sourceTwoId].sort(),
    );

    const referencesUnrelated = result.suggestions.some(
      (s) => s.sourceAId === unrelatedId || s.sourceBId === unrelatedId,
    );
    expect(referencesUnrelated).toBe(false);
  });

  it("makes zero embedding API calls on a rescan when nothing changed", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceId, curriculumId, {
      kind: "text",
      value: "stable content",
      title: "Stable Source",
      fetchedText: "nothing about this changes between scans",
    });

    const first = await triggerSourceDuplicateScan();
    expect(first.embeddedCount).toBeGreaterThan(0);

    vi.mocked(global.fetch).mockClear();

    const second = await triggerSourceDuplicateScan();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(second.embeddedCount).toBe(0);
  });
});

describe("insertSourceDuplicateSuggestionIfNew — partial unique index race guard", () => {
  it("treats a second insert for an already-pending pair as a no-op", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceAId = id("src");
    const sourceBId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceAId, curriculumId, { kind: "link", value: "https://example.com/a" });
    await insertSourceRow(sourceBId, curriculumId, { kind: "link", value: "https://example.com/b" });

    const first = await insertSourceDuplicateSuggestionIfNew({
      sourceXId: sourceAId,
      sourceYId: sourceBId,
      similarity: null,
      matchKind: "url_match",
      reason: "first insert",
    });

    expect(first).not.toBeNull();

    const second = await insertSourceDuplicateSuggestionIfNew({
      sourceXId: sourceAId,
      sourceYId: sourceBId,
      similarity: null,
      matchKind: "url_match",
      reason: "second attempt, same pair",
    });

    expect(second).toBeNull();

    const pending = await listSourceDuplicateSuggestions("pending");
    const matches = pending.filter(
      (s) =>
        (s.sourceAId === sourceAId && s.sourceBId === sourceBId) ||
        (s.sourceAId === sourceBId && s.sourceBId === sourceAId),
    );

    expect(matches).toHaveLength(1);
  });
});

describe("resolveSourceDuplicateSuggestion — SCENARIO 5 (reporting-only, no merge/delete)", () => {
  it("acknowledges a suggestion without touching either source row or any topic pointing at them", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const moduleId = id("mod");
    const sourceAId = id("src");
    const sourceBId = id("src");
    const topicId = id("top");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertModule(moduleId, curriculumId);
    await insertSourceRow(sourceAId, curriculumId, { kind: "link", value: "https://example.com/keep-a" });
    await insertSourceRow(sourceBId, curriculumId, { kind: "link", value: "https://example.com/keep-b" });
    await insertTopicWithSource(topicId, moduleId, curriculumId, sourceAId);

    const suggestion = await insertSourceDuplicateSuggestionIfNew({
      sourceXId: sourceAId,
      sourceYId: sourceBId,
      similarity: null,
      matchKind: "url_match",
      reason: "reporting-only test",
    });

    const result = await resolveSourceDuplicateSuggestion(suggestion!.id, { status: "acknowledged" });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.status).toBe("acknowledged");
      expect(result.resolvedAt).not.toBeNull();
    }

    const sourceRows = (
      await client.query(`SELECT id FROM sources WHERE id = ANY($1)`, [[sourceAId, sourceBId]])
    ).rows;
    expect(sourceRows).toHaveLength(2);

    const topicRow = (
      await client.query(`SELECT source_id FROM topics WHERE id = $1`, [topicId])
    ).rows[0];
    expect(topicRow.source_id).toBe(sourceAId);
  });

  it("returns already_resolved rather than flipping an already-resolved row's status again", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceAId = id("src");
    const sourceBId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceAId, curriculumId, { kind: "link", value: "https://example.com/idem-a" });
    await insertSourceRow(sourceBId, curriculumId, { kind: "link", value: "https://example.com/idem-b" });

    const suggestion = await insertSourceDuplicateSuggestionIfNew({
      sourceXId: sourceAId,
      sourceYId: sourceBId,
      similarity: null,
      matchKind: "url_match",
      reason: "idempotency test",
    });

    const first = await resolveSourceDuplicateSuggestion(suggestion!.id, { status: "dismissed" });
    expect("error" in first).toBe(false);

    const second = await resolveSourceDuplicateSuggestion(suggestion!.id, { status: "dismissed" });
    expect(second).toEqual({ error: "already_resolved" });
  });
});
