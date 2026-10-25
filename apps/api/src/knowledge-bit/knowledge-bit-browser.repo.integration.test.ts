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

const dbName = `knowledge_bit_browser_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const DATABASE_URL = databaseUrl.toString();
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { listKnowledgeBitBrowser, countKnowledgeBitBrowserSubjects } = await import(
  "./knowledge-bit-browser.repo.js"
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

async function seedSource(subjectId: string | null, kind = "prose"): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, $2, 'text', 'pending', $3)`,
    [id, kind, subjectId],
  );

  return id;
}

async function seedBit(
  sourceId: string,
  ordinal: number,
  createdAt: string,
  approvalState = "approved",
  origin = "extracted",
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, created_at)
     VALUES ($1, $2, $3, 'body', $4, $5, $6)`,
    [id, sourceId, ordinal, approvalState, origin, createdAt],
  );

  return id;
}

async function seedVariant(
  bitId: string,
  kind: string,
  order: number,
  prompt: string,
  answer = "ans",
  superseded = false,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [`kbqv_${randomUUID()}`, bitId, kind, order, prompt, answer, superseded ? new Date() : null],
  );
}

describe("listKnowledgeBitBrowser (real Postgres)", () => {
  it("should show every active phrasing of a piece and hide replaced ones", async () => {
    const source = await seedSource(null);
    const bit = await seedBit(source, 0, "2026-01-01T00:00:00Z");

    await seedVariant(bit, "wh_question", 0, "Why?");
    await seedVariant(bit, "basic", 0, "Front", "basic answer");
    await seedVariant(bit, "fill_in_the_blank", 0, "Blank ___");
    await seedVariant(bit, "basic", 1, "Old front", "old", true);

    const page = await listKnowledgeBitBrowser({ limit: 50, offset: 0 });
    const item = page.items.find((i) => i.knowledgeBitId === bit);

    expect(item?.phrasings.map((p) => p.prompt)).toEqual(["Front", "Blank ___", "Why?"]);
    expect(item?.answer).toBe("basic answer");
    expect(item?.origin).toBe("pasted");
    expect(item?.sourceId).toBe(source);
    expect(item?.sourceLabel).toBe("text");
    expect(item?.addedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("should leave out pieces that are still pending or were rejected", async () => {
    const source = await seedSource(null);
    const pending = await seedBit(source, 0, "2026-01-02T00:00:00Z", "pending");
    const rejected = await seedBit(source, 1, "2026-01-02T00:00:00Z", "rejected");

    await seedVariant(pending, "basic", 0, "p");
    await seedVariant(rejected, "basic", 0, "r");

    const page = await listKnowledgeBitBrowser({ limit: 100, offset: 0 });
    const ids = page.items.map((i) => i.knowledgeBitId);

    expect(ids).not.toContain(pending);
    expect(ids).not.toContain(rejected);
  });

  it("should list a subject's pieces including its sub-subjects and nothing else", async () => {
    const parent = `subj_${randomUUID()}`;
    const child = `subj_${randomUUID()}`;
    const other = `subj_${randomUUID()}`;

    await client.query(
      `INSERT INTO subjects (id, name, parent_id) VALUES ($1, 'Parent', NULL), ($2, 'Child', $1), ($3, 'Other', NULL)`,
      [parent, child, other],
    );

    const inChild = await seedBit(await seedSource(child), 0, "2026-02-01T00:00:00Z");
    const inOther = await seedBit(await seedSource(other), 0, "2026-02-01T00:00:00Z");

    await seedVariant(inChild, "basic", 0, "c");
    await seedVariant(inOther, "basic", 0, "o");

    const page = await listKnowledgeBitBrowser({ subjectId: parent, limit: 50, offset: 0 });

    expect(page.items.map((i) => i.knowledgeBitId)).toEqual([inChild]);

    const counts = await countKnowledgeBitBrowserSubjects();

    expect(counts).toContainEqual({ subjectId: child, count: 1 });
    expect(counts).toContainEqual({ subjectId: other, count: 1 });
  });

  it("should list a piece filed directly on a parent subject alongside its sub-subjects' pieces", async () => {
    const parent = `subj_${randomUUID()}`;
    const child = `subj_${randomUUID()}`;

    await client.query(
      `INSERT INTO subjects (id, name, parent_id) VALUES ($1, 'Own Parent', NULL), ($2, 'Own Child', $1)`,
      [parent, child],
    );

    const onParent = await seedBit(await seedSource(parent), 0, "2026-02-02T00:00:00Z");
    const onChild = await seedBit(await seedSource(child), 0, "2026-02-03T00:00:00Z");

    await seedVariant(onParent, "basic", 0, "p");
    await seedVariant(onChild, "basic", 0, "c");

    const page = await listKnowledgeBitBrowser({ subjectId: parent, limit: 50, offset: 0 });

    expect(page.items.map((i) => i.knowledgeBitId).sort()).toEqual([onParent, onChild].sort());

    const counts = await countKnowledgeBitBrowserSubjects();

    expect(counts).toContainEqual({ subjectId: parent, count: 1 });
    expect(counts).toContainEqual({ subjectId: child, count: 1 });
  });

  it("should return the newest piece first and report when more remain", async () => {
    const subject = `subj_${randomUUID()}`;

    await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, 'Paging', NULL)`, [subject]);

    const source = await seedSource(subject);
    const older = await seedBit(source, 0, "2026-03-01T00:00:00Z", "approved", "manual");
    const newer = await seedBit(source, 1, "2026-03-02T00:00:00Z");

    await seedVariant(older, "basic", 0, "old");
    await seedVariant(newer, "basic", 0, "new");

    const first = await listKnowledgeBitBrowser({ subjectId: subject, limit: 1, offset: 0 });
    const second = await listKnowledgeBitBrowser({ subjectId: subject, limit: 1, offset: 1 });

    expect(first.items.map((i) => i.knowledgeBitId)).toEqual([newer]);
    expect(first.hasMore).toBe(true);
    expect(second.items.map((i) => i.knowledgeBitId)).toEqual([older]);
    expect(second.items[0]?.origin).toBe("manual");
    expect(second.hasMore).toBe(false);
  });

  it("should list pieces that belong to no subject under the no-subject choice", async () => {
    const bit = await seedBit(await seedSource(null), 0, "2026-04-01T00:00:00Z");

    await seedVariant(bit, "basic", 0, "loose");

    const page = await listKnowledgeBitBrowser({ subjectId: "none", limit: 100, offset: 0 });

    expect(page.items.map((i) => i.knowledgeBitId)).toContain(bit);
    expect(page.items.every((i) => i.phrasings.length > 0)).toBe(true);
  });
});
