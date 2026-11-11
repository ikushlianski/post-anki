import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("./knowledge-bit-duplicate-gate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./knowledge-bit-duplicate-gate.js")>()),
  dropDuplicateCards: async (_db: unknown, lessons: readonly unknown[]) => ({ lessons: [...lessons], skippedCards: 0 }),
}));

vi.mock("../admin-settings/admin-settings.repo.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin-settings/admin-settings.repo.js")>()),
  getTriageEnabled: async () => true,
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

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

const dbName = `knowledge_bit_triage_note_${randomUUID().replace(/-/g, "_")}`;
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

const { insertSourceItemsForChunk } = await import("./knowledge-bit-source-items.repo.js");
const { editKnowledgeBitClozeNote } = await import("./knowledge-bit-note-edit.repo.js");
const { editKnowledgeBitOrderedList } = await import("./knowledge-bit-list-edit.repo.js");
const { listPendingKnowledgeBitsForReview } = await import("./knowledge-bit-approval.repo.js");
const { editKnowledgeBit } = await import("./knowledge-bit-edit.service.js");
const { listInboxKnowledgeBits, moveKnowledgeBitToInbox } = await import("./knowledge-bit-inbox.repo.js");

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

const NOTE = "A deal needs {{c1::budget}} and {{c2::authority}}.";
const LIST = "Closing a sale\nQualify\nPitch\nNegotiate\nClose";

async function seed(card: { kind: "cloze" | "ordered_list"; question: string; answer: string }): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const claimedAt = new Date();

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, updated_at) VALUES ($1, 'prose', 'src', 'processing', $2)`,
    [sourceId, claimedAt],
  );
  await insertSourceItemsForChunk({
    sourceId,
    claimedAt,
    firstOrdinal: 0,
    items: [
      {
        statement: "A deal needs budget and authority.",
        quote: "A deal needs budget",
        example: null,
        cards: [{ ...card, statement: "A deal needs budget and authority.", quote: "A deal needs budget" }],
      },
    ],
  });

  const { rows } = await client.query(`SELECT id FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);

  return rows[0]!.id as string;
}

async function pendingVariants(bitId: string) {
  const sources = await listPendingKnowledgeBitsForReview(500);

  return sources.flatMap((source) => source.bits).find((bit) => bit.id === bitId)?.variants ?? [];
}

describe("triage editing of cloze and ordered-list notes (real Postgres)", () => {
  it("should hand the triage screen the whole note text on every card of a pending cloze bit", async () => {
    const bitId = await seed({ kind: "cloze", question: NOTE, answer: "budget / authority" });
    const variants = await pendingVariants(bitId);

    expect(variants).toHaveLength(2);
    expect(variants.every((variant) => variant.sentence === NOTE)).toBe(true);
  });

  it("should regenerate the cards of a pending cloze bit from an edited note", async () => {
    const bitId = await seed({ kind: "cloze", question: NOTE, answer: "budget / authority" });
    const [first] = await pendingVariants(bitId);
    const edited = "A deal needs {{c1::budget}}, {{c2::authority}} and {{c3::timing}}.";

    expect(await editKnowledgeBitClozeNote(first!.id, edited)).toMatchObject({ ok: true });

    const after = await pendingVariants(bitId);

    expect(after).toHaveLength(3);
    expect(after.every((variant) => variant.sentence === edited)).toBe(true);
  });

  it("should rebuild the cards of a pending ordered-list bit from an edited list", async () => {
    const bitId = await seed({
      kind: "ordered_list",
      question: LIST,
      answer: "1. Qualify\n2. Pitch\n3. Negotiate\n4. Close",
    });
    const before = await pendingVariants(bitId);
    const edited = "Closing a sale\nQualify\nPitch\nClose";

    expect(before.every((variant) => variant.sentence === LIST)).toBe(true);
    expect(await editKnowledgeBitOrderedList(before[0]!.id, edited)).toMatchObject({ ok: true });

    const after = await pendingVariants(bitId);

    expect(after.length).toBeLessThan(before.length);
    expect(after.every((variant) => variant.sentence === edited)).toBe(true);
  });

  it("should still accept the example and its undo on a cloze bit because the fact text is unchanged", async () => {
    const bitId = await seed({ kind: "cloze", question: NOTE, answer: "budget / authority" });
    const { rows } = await client.query(`SELECT body FROM knowledge_bits WHERE id = $1`, [bitId]);
    const body = rows[0]!.body as string;

    expect(await editKnowledgeBit(bitId, { body, background: "An AI example" })).toEqual({ ok: true });
    expect(await editKnowledgeBit(bitId, { body, background: null })).toEqual({ ok: true });
    expect(await pendingVariants(bitId)).toHaveLength(2);
  });

  it("should answer wrong_shape, not not_found, when the fact text of a cloze bit is rewritten directly", async () => {
    const bitId = await seed({ kind: "cloze", question: NOTE, answer: "budget / authority" });

    expect(await editKnowledgeBit(bitId, { body: "Rewritten" })).toEqual({ error: "wrong_shape" });
    expect(await editKnowledgeBit("kb_missing", { body: "Rewritten" })).toEqual({ error: "not_found" });
  });
  it("should hand the inbox list the cloze note so the row can be edited, and accept the edit in the inbox state", async () => {
    const bitId = await seed({ kind: "cloze", question: NOTE, answer: "budget / authority" });

    await moveKnowledgeBitToInbox(bitId);

    const item = (await listInboxKnowledgeBits(500)).find((candidate) => candidate.id === bitId);
    const edited = "A deal needs {{c1::budget}}, {{c2::authority}} and {{c3::timing}}.";

    expect(item?.note).toMatchObject({ mode: "cloze", text: NOTE });
    expect(await editKnowledgeBitClozeNote(item!.note!.variantId, edited)).toMatchObject({ ok: true });

    const after = (await listInboxKnowledgeBits(500)).find((candidate) => candidate.id === bitId);

    expect(after?.cardCount).toBe(3);
    expect(after?.note).toMatchObject({ mode: "cloze", text: edited });
  });

  it("should hand the inbox list the ordered list and accept a list edit in the inbox state", async () => {
    const bitId = await seed({
      kind: "ordered_list",
      question: LIST,
      answer: "1. Qualify\n2. Pitch\n3. Negotiate\n4. Close",
    });

    await moveKnowledgeBitToInbox(bitId);

    const item = (await listInboxKnowledgeBits(500)).find((candidate) => candidate.id === bitId);
    const edited = "Closing a sale\nQualify\nPitch\nClose";

    expect(item?.note).toMatchObject({ mode: "list", text: LIST });
    expect(await editKnowledgeBitOrderedList(item!.note!.variantId, edited)).toMatchObject({ ok: true });
    expect((await listInboxKnowledgeBits(500)).find((candidate) => candidate.id === bitId)?.note?.text).toBe(edited);
  });
});
