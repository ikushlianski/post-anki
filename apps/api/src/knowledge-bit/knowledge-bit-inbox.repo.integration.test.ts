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

const dbName = `knowledge_bit_inbox_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

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

const { listPendingKnowledgeBitsForReview } = await import("./knowledge-bit-approval.repo.js");
const { countPendingKnowledgeBits } = await import("./knowledge-bit-bulk-approval.repo.js");
const { restoreDecidedKnowledgeBit } = await import("./knowledge-bit-feedback-restore.repo.js");
const { getDb } = await import("../db/client.js");
const { updateKnowledgeBitBody } = await import("./knowledge-bit.repo.js");
const {
  countInboxKnowledgeBits,
  discardKnowledgeBitFromInbox,
  listInboxKnowledgeBits,
  moveKnowledgeBitToInbox,
  returnKnowledgeBitFromInbox,
} = await import("./knowledge-bit-inbox.repo.js");
const { getKnowledgeBitExampleState, writeKnowledgeBitExample } = await import("./knowledge-bit-example.repo.js");

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

async function seedKnowledgeSource(subjectId: string | null = null): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'Some prose.', 'pending', $2)`,
    [id, subjectId],
  );

  return id;
}

async function seedBit(
  sourceId: string,
  ordinal: number,
  state = "pending",
  background: string | null = null,
  createdAt = new Date(),
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, background, approval_state, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, sourceId, ordinal, `Body ${ordinal}`, background, state, createdAt],
  );

  return id;
}

async function seedCard(bitId: string, order: number, supersededAt: Date | null = null): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at)
     VALUES ($1, $2, 'basic', $3, 'Q', 'A', $4)`,
    [`kbqv_${randomUUID()}`, bitId, order, supersededAt],
  );
}

async function stateOf(id: string): Promise<{ approval_state: string; inbox_at: Date | null }> {
  const { rows } = await client.query(`SELECT approval_state, inbox_at FROM knowledge_bits WHERE id = $1`, [id]);

  return rows[0];
}

describe("inbox transitions (real Postgres)", () => {
  it("should take a pending item out of the pending list and into the inbox list", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedBit(sourceId, 0);
    const pendingBefore = await countPendingKnowledgeBits();

    const moved = await moveKnowledgeBitToInbox(id);

    expect(moved.ok).toBe(true);
    expect(await countPendingKnowledgeBits()).toBe(pendingBefore - 1);

    const pendingIds = (await listPendingKnowledgeBitsForReview(500)).flatMap((source) =>
      source.bits.map((bit) => bit.id),
    );
    const inboxIds = (await listInboxKnowledgeBits(500)).map((item) => item.id);

    expect(pendingIds).not.toContain(id);
    expect(inboxIds).toContain(id);
    expect((await stateOf(id)).inbox_at).not.toBeNull();
  });

  it("should answer ok when the same item is moved twice and keep one inbox entry", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    const first = await moveKnowledgeBitToInbox(id);
    const second = await moveKnowledgeBitToInbox(id);
    const inboxIds = (await listInboxKnowledgeBits(500)).map((item) => item.id);

    expect(first.ok && second.ok).toBe(true);
    expect(inboxIds.filter((x) => x === id)).toHaveLength(1);
  });

  it("should let two simultaneous moves both succeed and land the item in the inbox once", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    const results = await Promise.all([moveKnowledgeBitToInbox(id), moveKnowledgeBitToInbox(id)]);
    const inboxIds = (await listInboxKnowledgeBits(500)).map((item) => item.id);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(inboxIds.filter((x) => x === id)).toHaveLength(1);
  });

  it.each(["approved", "rejected", "superseded"])("should refuse to move a %s item", async (state) => {
    const id = await seedBit(await seedKnowledgeSource(), 0, state);

    expect(await moveKnowledgeBitToInbox(id)).toEqual({ ok: false, reason: "blocked" });
    expect((await stateOf(id)).approval_state).toBe(state);
  });

  it("should report not_found for an unknown id on move, return and discard", async () => {
    expect(await moveKnowledgeBitToInbox("kb_missing")).toEqual({ ok: false, reason: "not_found" });
    expect(await returnKnowledgeBitFromInbox("kb_missing")).toEqual({ ok: false, reason: "not_found" });
    expect(await discardKnowledgeBitFromInbox("kb_missing")).toEqual({ ok: false, reason: "not_found" });
  });

  it("should return an inbox item to pending in its original creation order and clear the inbox time", async () => {
    const sourceId = await seedKnowledgeSource();
    const early = await seedBit(sourceId, 0, "pending", null, new Date("2020-01-01T00:00:00Z"));
    const late = await seedBit(sourceId, 1, "pending", null, new Date("2020-01-02T00:00:00Z"));

    await moveKnowledgeBitToInbox(early);
    await returnKnowledgeBitFromInbox(early);

    const ids = (await listPendingKnowledgeBitsForReview(500)).flatMap((source) =>
      source.bits.map((bit) => bit.id),
    );

    expect(ids.indexOf(early)).toBeLessThan(ids.indexOf(late));
    expect(await stateOf(early)).toMatchObject({ approval_state: "pending", inbox_at: null });
  });

  it("should accept a return for an item that is already pending and change nothing", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    expect((await returnKnowledgeBitFromInbox(id)).ok).toBe(true);
    expect((await stateOf(id)).approval_state).toBe("pending");
  });

  it("should refuse to return an approved item", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "approved");

    expect(await returnKnowledgeBitFromInbox(id)).toEqual({ ok: false, reason: "blocked" });
  });

  it("should discard an inbox item to rejected with no feedback verdict and allow a later restore", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    await moveKnowledgeBitToInbox(id);

    expect((await discardKnowledgeBitFromInbox(id)).ok).toBe(true);
    expect((await stateOf(id)).approval_state).toBe("rejected");

    const feedback = await client.query(`SELECT 1 FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1`, [id]);

    expect(feedback.rowCount).toBe(0);
    expect(await restoreDecidedKnowledgeBit(getDb(), id)).toBe(true);
    expect((await stateOf(id)).approval_state).toBe("pending");
  });

  it("should be idempotent when discarding an already rejected item and refuse a pending one", async () => {
    const rejected = await seedBit(await seedKnowledgeSource(), 0, "rejected");
    const pending = await seedBit(await seedKnowledgeSource(), 0);

    expect((await discardKnowledgeBitFromInbox(rejected)).ok).toBe(true);
    expect(await discardKnowledgeBitFromInbox(pending)).toEqual({ ok: false, reason: "blocked" });
  });

  it("should keep inbox items out of the pending count", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "inbox");
    const inboxBefore = await countInboxKnowledgeBits();

    expect(inboxBefore).toBeGreaterThan(0);
    expect((await listInboxKnowledgeBits(500)).map((item) => item.id)).toContain(id);
  });
});

describe("listInboxKnowledgeBits (real Postgres)", () => {
  it("should list newest first with subject name and active card count, and a null subject when none", async () => {
    const subjectId = `subj_${randomUUID()}`;

    await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, 'Networking', 'general')`, [subjectId]);

    const withSubject = await seedBit(await seedKnowledgeSource(subjectId), 0);
    const withoutSubject = await seedBit(await seedKnowledgeSource(), 0);

    await seedCard(withSubject, 0);
    await seedCard(withSubject, 1);
    await seedCard(withSubject, 2, new Date());
    await moveKnowledgeBitToInbox(withSubject);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await moveKnowledgeBitToInbox(withoutSubject);

    const items = await listInboxKnowledgeBits(500);
    const newest = items.findIndex((item) => item.id === withoutSubject);
    const older = items.findIndex((item) => item.id === withSubject);

    expect(newest).toBeLessThan(older);
    expect(items[older]).toMatchObject({ subjectName: "Networking", cardCount: 2 });
    expect(items[newest]).toMatchObject({ subjectName: null, cardCount: 0 });
  });
});

describe("AI example storage (real Postgres)", () => {
  it.each(["pending", "inbox", "approved"])("should write an example on a %s item", async (state) => {
    const id = await seedBit(await seedKnowledgeSource(), 0, state);

    const written = await writeKnowledgeBitExample(id, "An example.", false);

    expect(written).toMatchObject({ ok: true, previousExample: null, generationsLeft: 4 });
    expect(await getKnowledgeBitExampleState(id)).toMatchObject({
      background: "An example.",
      exampleAiCount: 1,
    });
  });

  it("should refuse to write an example on a rejected item", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "rejected");

    expect(await writeKnowledgeBitExample(id, "An example.", false)).toEqual({ ok: false, reason: "blocked" });
  });

  it("should replace an earlier AI example and return the old text", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    await writeKnowledgeBitExample(id, "First.", false);

    expect(await writeKnowledgeBitExample(id, "Second.", false)).toMatchObject({
      ok: true,
      previousExample: "First.",
      generationsLeft: 3,
    });
  });

  it("should protect human text unless overwrite is set", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "pending", "My own example");

    expect(await writeKnowledgeBitExample(id, "AI.", false)).toEqual({ ok: false, reason: "example_exists" });
    expect(await writeKnowledgeBitExample(id, "AI.", true)).toMatchObject({
      ok: true,
      previousExample: "My own example",
    });
  });

  it("should stop after five generations", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    for (let i = 0; i < 5; i += 1) {
      expect((await writeKnowledgeBitExample(id, `Example ${i}`, false)).ok).toBe(true);
    }

    expect(await writeKnowledgeBitExample(id, "Sixth", false)).toEqual({ ok: false, reason: "limit_reached" });
  });

  it("should clear the AI marker when the example is edited by hand but not when only the body changes", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    await writeKnowledgeBitExample(id, "AI text.", false);
    await updateKnowledgeBitBody(id, "Body 0 edited", undefined);

    expect((await getKnowledgeBitExampleState(id))?.exampleAiGeneratedAt).not.toBeNull();

    await updateKnowledgeBitBody(id, "Body 0 edited", "Human text");

    expect(await getKnowledgeBitExampleState(id)).toMatchObject({
      exampleAiGeneratedAt: null,
      background: "Human text",
      exampleAiCount: 1,
    });
  });

  it("should restore the previous example or clear it through the edit call", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "pending", "Before");

    await writeKnowledgeBitExample(id, "AI text.", true);
    await updateKnowledgeBitBody(id, "Body 0", "Before");

    expect((await getKnowledgeBitExampleState(id))?.background).toBe("Before");

    await updateKnowledgeBitBody(id, "Body 0", null);

    expect((await getKnowledgeBitExampleState(id))?.background).toBeNull();
  });

  it("should neither list nor count an inbox item whose source is missing", async () => {
    const before = await countInboxKnowledgeBits();
    const orphan = await seedBit(`ksrc_${randomUUID()}`, 0, "inbox");
    const listed = await seedBit(await seedKnowledgeSource(), 0, "inbox");
    const items = (await listInboxKnowledgeBits(500)).map((entry) => entry.id);

    expect(items).toContain(listed);
    expect(items).not.toContain(orphan);
    expect(await countInboxKnowledgeBits()).toBe(before + 1);
  });

  it("should show the parent path for a nested subject so same-named sub-subjects differ", async () => {
    const root = `subj_${randomUUID()}`;
    const child = `subj_${randomUUID()}`;

    await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, 'Business', 'general')`, [root]);
    await client.query(`INSERT INTO subjects (id, name, kind, parent_id) VALUES ($1, 'Common', 'general', $2)`, [child, root]);

    const id = await seedBit(await seedKnowledgeSource(child), 0);

    await moveKnowledgeBitToInbox(id);

    const item = (await listInboxKnowledgeBits(500)).find((entry) => entry.id === id);

    expect(item?.subjectName).toBe("Business › Common");
  });
});
