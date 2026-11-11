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

const dbName = `knowledge_bit_cloze_${randomUUID().replace(/-/g, "_")}`;
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
const { updateKnowledgeBitBody } = await import("./knowledge-bit.repo.js");
const { editKnowledgeBitQuestionVariant } = await import("./knowledge-bit-approval.repo.js");

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

const NOTE = "A deal needs {{c1::budget}}, {{c2::authority}} and {{c3::need}}.";

async function seedClozeBit(): Promise<string> {
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
        statement: "A deal needs budget, authority and need.",
        quote: "A deal needs budget",
        example: null,
        cards: [
          {
            kind: "cloze",
            statement: "A deal needs budget, authority and need.",
            question: NOTE,
            answer: "budget / authority / need",
            quote: "A deal needs budget",
          },
        ],
      },
    ],
  });

  const { rows } = await client.query(`SELECT id FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);

  return rows[0]!.id as string;
}

async function activeCards(bitId: string) {
  const { rows } = await client.query(
    `SELECT id, "order", prompt, answer, sentence FROM knowledge_bit_question_variants
     WHERE knowledge_bit_id = $1 AND superseded_at IS NULL ORDER BY "order"`,
    [bitId],
  );

  return rows;
}

describe("cloze notes (real Postgres)", () => {
  it("should store one note as one bit with a separate card per gap and no extra generation passes", async () => {
    const bitId = await seedClozeBit();
    const cards = await activeCards(bitId);

    expect(cards.map((card) => card.prompt)).toEqual([
      "A deal needs ____, authority and need.",
      "A deal needs budget, ____ and need.",
      "A deal needs budget, authority and ____.",
    ]);
    expect(cards.map((card) => card.answer)).toEqual(["budget", "authority", "need"]);
    expect(cards.every((card) => card.sentence === NOTE)).toBe(true);

    const { rows } = await client.query(
      `SELECT body, wh_question_generated_at, fill_blank_generated_at, basic_card_generated_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.body).toBe("A deal needs budget, authority and need.");
    expect(rows[0]!.wh_question_generated_at).not.toBeNull();
    expect(rows[0]!.fill_blank_generated_at).not.toBeNull();
    expect(rows[0]!.basic_card_generated_at).not.toBeNull();
  });

  it("should replace the cards of a note when it is edited and retire removed gaps and add new ones", async () => {
    const bitId = await seedClozeBit();
    const before = await activeCards(bitId);
    const result = await editKnowledgeBitClozeNote(
      before[0]!.id as string,
      "A deal needs {{c1::budget}}, authority and {{c3::need}} and {{c4::timing}}.",
    );

    expect(result).toMatchObject({ ok: true, knowledgeBitId: bitId });

    const after = await activeCards(bitId);

    expect(after.map((card) => card.order)).toEqual([1, 3, 4]);
    expect(after.map((card) => card.answer)).toEqual(["budget", "need", "timing"]);
    expect(after.some((card) => before.some((old) => old.id === card.id))).toBe(false);

    const { rows } = await client.query(`SELECT body FROM knowledge_bits WHERE id = $1`, [bitId]);

    expect(rows[0]!.body).toBe("A deal needs budget, authority and need and timing.");
  });

  it("should leave the cards untouched when the edit changes nothing", async () => {
    const bitId = await seedClozeBit();
    const before = await activeCards(bitId);

    await editKnowledgeBitClozeNote(before[1]!.id as string, NOTE);

    expect((await activeCards(bitId)).map((card) => card.id)).toEqual(before.map((card) => card.id));
  });

  it("should refuse an invalid note and change nothing", async () => {
    const bitId = await seedClozeBit();
    const before = await activeCards(bitId);
    const result = await editKnowledgeBitClozeNote(before[0]!.id as string, "{{c1::a {{c2::b}}}}");

    expect(result).toEqual({ error: "invalid_note", reason: "nested" });
    expect((await activeCards(bitId)).map((card) => card.id)).toEqual(before.map((card) => card.id));
  });

  it("should refuse to edit the note of a rejected bit", async () => {
    const bitId = await seedClozeBit();
    const before = await activeCards(bitId);

    await client.query(`UPDATE knowledge_bits SET approval_state = 'rejected' WHERE id = $1`, [bitId]);

    expect(await editKnowledgeBitClozeNote(before[0]!.id as string, NOTE)).toEqual({ error: "blocked" });
  });

  it("should refuse a plain prompt and answer edit on a cloze card", async () => {
    const bitId = await seedClozeBit();
    const before = await activeCards(bitId);

    expect(await editKnowledgeBitQuestionVariant(before[0]!.id as string, "p", "a")).toEqual({
      error: "wrong_shape",
    });
  });

  it("should refuse a note edit on a card that is not a cloze card", async () => {
    const bitId = await seedClozeBit();
    const basicId = `kbqv_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'q', 'a')`,
      [basicId, bitId],
    );

    expect(await editKnowledgeBitClozeNote(basicId, NOTE)).toEqual({ error: "wrong_shape" });
  });

  it("should keep the note's cards when someone edits the plain body of a pending cloze bit", async () => {
    const bitId = await seedClozeBit();
    const before = await activeCards(bitId);

    expect(await updateKnowledgeBitBody(bitId, "Rewritten body")).toBe(false);
    expect((await activeCards(bitId)).map((card) => card.id)).toEqual(before.map((card) => card.id));
  });
});
