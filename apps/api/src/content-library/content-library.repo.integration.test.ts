import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIO 1, 2, 6, 7 (.planning/content-library/scenarios.md) —
// content-library.repo.ts's listing + refetchSource's conditional write,
// against a real Postgres instance so "the previously-fetched body survives
// a failed re-fetch" is proven against a real row, not a mocked repo shape.
// Same fresh-migrated-throwaway-Postgres technique as
// note/note.repo.integration.test.ts.

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

const dbName = `content_library_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { closeDb } = await import("../db/client.js");
const { listLibrarySources } = await import("./content-library.repo.js");
const { refetchSource } = await import("./content-library.service.js");

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
    [subjectId, `content library subject ${subjectId}`],
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
  lastFetchedAt?: string | null;
  lastFetchOutcome?: string | null;
}

async function insertSourceRow(
  sourceId: string,
  curriculumId: string,
  init: SourceRowInit,
): Promise<void> {
  await client.query(
    `INSERT INTO sources
      (id, curriculum_id, kind, value, title, fetched_text, last_fetched_at, last_fetch_outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      sourceId,
      curriculumId,
      init.kind,
      init.value,
      init.title ?? null,
      init.fetchedText ?? null,
      init.lastFetchedAt ?? null,
      init.lastFetchOutcome ?? null,
    ],
  );
}

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("listLibrarySources — SCENARIO 1/2", () => {
  it("lists a source with its curriculum and subject provenance, in one joined query", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceId, curriculumId, {
      kind: "link",
      value: "https://example.com/article",
      title: "An Article",
    });

    const rows = await listLibrarySources();
    const row = rows.find((r) => r.id === sourceId);

    expect(row).toBeDefined();
    expect(row?.curriculumId).toBe(curriculumId);
    expect(row?.subjectId).toBe(subjectId);
    expect(row?.fetchState).toBe("never_fetched");
  });

  it("attributes two curricula's identical article to their own distinct rows, never merged", async () => {
    const subjectId = id("sub");
    const curriculumOneId = id("cur");
    const curriculumTwoId = id("cur");
    const sourceOneId = id("src");
    const sourceTwoId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumOneId, subjectId);
    await insertCurriculum(curriculumTwoId, subjectId);
    await insertSourceRow(sourceOneId, curriculumOneId, {
      kind: "link",
      value: "https://example.com/shared-article",
    });
    await insertSourceRow(sourceTwoId, curriculumTwoId, {
      kind: "link",
      value: "https://example.com/shared-article",
    });

    const rows = await listLibrarySources();
    const rowOne = rows.find((r) => r.id === sourceOneId);
    const rowTwo = rows.find((r) => r.id === sourceTwoId);

    expect(rowOne?.curriculumId).toBe(curriculumOneId);
    expect(rowTwo?.curriculumId).toBe(curriculumTwoId);
    expect(rowOne?.id).not.toBe(rowTwo?.id);
  });

  it("derives fetched vs. stale_failed from lastFetchOutcome, not a fetchedText null check", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const fetchedId = id("src");
    const failedId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(fetchedId, curriculumId, {
      kind: "link",
      value: "https://example.com/ok",
      fetchedText: "good body",
      lastFetchedAt: new Date().toISOString(),
      lastFetchOutcome: "ok",
    });
    await insertSourceRow(failedId, curriculumId, {
      kind: "link",
      value: "https://example.com/failed",
      fetchedText: null,
      lastFetchedAt: new Date().toISOString(),
      lastFetchOutcome: "http_error",
    });

    const rows = await listLibrarySources();

    expect(rows.find((r) => r.id === fetchedId)?.fetchState).toBe("fetched");
    expect(rows.find((r) => r.id === failedId)?.fetchState).toBe("stale_failed");
  });
});

describe("refetchSource — SCENARIO 6/7", () => {
  it("goes through guardedFetchText and overwrites fetchedText on a successful re-fetch", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceId, curriculumId, {
      kind: "link",
      value: "https://example.com/refetch-ok",
      fetchedText: "stale body",
    });

    global.fetch = vi.fn(async () => {
      return new Response("<p>fresh body</p>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;

    const result = await refetchSource(sourceId);

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.outcome).toBe("ok");
      expect(result.fetchedTextUpdated).toBe(true);
    }

    const row = (await client.query(`SELECT fetched_text, last_fetch_outcome, last_fetched_at FROM sources WHERE id = $1`, [sourceId])).rows[0];

    expect(row.fetched_text).toContain("fresh body");
    expect(row.last_fetch_outcome).toBe("ok");
    expect(row.last_fetched_at).not.toBeNull();
  });

  it("records the failure but leaves a previously-good fetchedText exactly as it was", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceId, curriculumId, {
      kind: "link",
      value: "https://example.com/now-404s",
      fetchedText: "good body from months ago",
      lastFetchedAt: "2025-01-01T00:00:00.000Z",
      lastFetchOutcome: "ok",
    });

    global.fetch = vi.fn(async () => {
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const result = await refetchSource(sourceId);

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.outcome).toBe("http_error");
      expect(result.fetchedTextUpdated).toBe(false);
    }

    const row = (await client.query(`SELECT fetched_text, last_fetch_outcome, last_fetched_at FROM sources WHERE id = $1`, [sourceId])).rows[0];

    expect(row.fetched_text).toBe("good body from months ago");
    expect(row.last_fetch_outcome).toBe("http_error");
    expect(new Date(row.last_fetched_at).getTime()).toBeGreaterThan(
      new Date("2025-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("returns not_refetchable for a text source and writes nothing", async () => {
    const subjectId = id("sub");
    const curriculumId = id("cur");
    const sourceId = id("src");

    await insertSubject(subjectId);
    await insertCurriculum(curriculumId, subjectId);
    await insertSourceRow(sourceId, curriculumId, {
      kind: "text",
      value: "pasted text is the source itself",
      fetchedText: "pasted text is the source itself",
    });

    const result = await refetchSource(sourceId);

    expect(result).toEqual({ error: "not_refetchable" });

    const row = (await client.query(`SELECT last_fetched_at FROM sources WHERE id = $1`, [sourceId])).rows[0];

    expect(row.last_fetched_at).toBeNull();
  });

  it("returns not_found for a source id that does not exist", async () => {
    const result = await refetchSource(id("src"));

    expect(result).toEqual({ error: "not_found" });
  });
});
