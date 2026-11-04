import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

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

const dbName = `knowledge_bit_list_${randomUUID().replace(/-/g, "_")}`;
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
const { editKnowledgeBitOrderedList } = await import("./knowledge-bit-list-edit.repo.js");
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

const LIST = "Closing a sale\nQualify\nPitch\nNegotiate\nClose";

async function seedListBit(): Promise<string> {
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
        statement: "Closing a sale: Qualify; Pitch; Negotiate; Close",
        quote: "Qualify then pitch",
        example: null,
        cards: [
          {
            kind: "ordered_list",
            statement: "Closing a sale: Qualify; Pitch; Negotiate; Close",
            question: LIST,
            answer: "1. Qualify\n2. Pitch\n3. Negotiate\n4. Close",
            quote: "Qualify then pitch",
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
    `SELECT id, kind, "order", prompt, answer, sentence FROM knowledge_bit_question_variants
     WHERE knowledge_bit_id = $1 AND superseded_at IS NULL ORDER BY kind, "order"`,
    [bitId],
  );

  return rows;
}

const slots = (cards: { kind: string; order: number }[]) => cards.map((card) => `${card.kind}:${card.order}`);

describe("ordered list notes (real Postgres)", () => {
  it("should store one list as one bit with step, next-step and overview cards and no extra generation passes", async () => {
    const bitId = await seedListBit();
    const cards = await activeCards(bitId);

    expect(slots(cards)).toEqual([
      "list_next:1",
      "list_next:2",
      "list_next:3",
      "list_overview:0",
      "list_step:1",
      "list_step:2",
      "list_step:3",
      "list_step:4",
    ]);
    expect(cards.every((card) => card.sentence === LIST)).toBe(true);

    const { rows } = await client.query(
      `SELECT body, wh_question_generated_at, fill_blank_generated_at, basic_card_generated_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.body).toBe("Closing a sale: Qualify; Pitch; Negotiate; Close");
    expect(rows[0]!.wh_question_generated_at).not.toBeNull();
    expect(rows[0]!.fill_blank_generated_at).not.toBeNull();
    expect(rows[0]!.basic_card_generated_at).not.toBeNull();
  });

  it("should keep unchanged cards, retire the highest positions when steps are removed and add cards when steps are added", async () => {
    const bitId = await seedListBit();
    const before = await activeCards(bitId);
    const overviewId = before.find((card) => card.kind === "list_overview")!.id as string;
    const shorter = await editKnowledgeBitOrderedList(overviewId, "Closing a sale\nQualify\nPitch\nNegotiate");

    expect(shorter).toMatchObject({ ok: true, knowledgeBitId: bitId });

    const afterShorter = await activeCards(bitId);

    expect(slots(afterShorter)).toEqual([
      "list_next:1",
      "list_next:2",
      "list_overview:0",
      "list_step:1",
      "list_step:2",
      "list_step:3",
    ]);

    const keptStep1 = before.find((card) => card.kind === "list_step" && card.order === 1)!.id;

    expect(afterShorter.find((card) => card.kind === "list_step" && card.order === 1)!.id).toBe(keptStep1);

    const currentOverviewId = afterShorter.find((card) => card.kind === "list_overview")!.id as string;

    await editKnowledgeBitOrderedList(currentOverviewId, "Closing a sale\nQualify\nPitch\nNegotiate\nClose\nFollow up");

    expect((await activeCards(bitId)).filter((card) => card.kind === "list_step")).toHaveLength(5);
  });

  it("should leave the cards untouched when the edit changes nothing", async () => {
    const bitId = await seedListBit();
    const before = await activeCards(bitId);

    await editKnowledgeBitOrderedList(before[0]!.id as string, LIST);

    expect((await activeCards(bitId)).map((card) => card.id)).toEqual(before.map((card) => card.id));
  });

  it("should refuse an invalid list and change nothing", async () => {
    const bitId = await seedListBit();
    const before = await activeCards(bitId);

    expect(await editKnowledgeBitOrderedList(before[0]!.id as string, "Title\none\ntwo")).toEqual({
      error: "invalid_list",
      reason: "too_few_steps",
    });
    expect((await activeCards(bitId)).map((card) => card.id)).toEqual(before.map((card) => card.id));
  });

  it("should refuse to edit the list of a rejected bit", async () => {
    const bitId = await seedListBit();
    const before = await activeCards(bitId);

    await client.query(`UPDATE knowledge_bits SET approval_state = 'rejected' WHERE id = $1`, [bitId]);

    expect(await editKnowledgeBitOrderedList(before[0]!.id as string, LIST)).toEqual({ error: "blocked" });
  });

  it("should refuse a plain prompt and answer edit on a list card", async () => {
    const bitId = await seedListBit();
    const before = await activeCards(bitId);

    expect(await editKnowledgeBitQuestionVariant(before[0]!.id as string, "p", "a")).toEqual({
      error: "wrong_shape",
    });
  });

  it("should refuse a list edit on a card that is not a list card", async () => {
    const bitId = await seedListBit();
    const basicId = `kbqv_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'q', 'a')`,
      [basicId, bitId],
    );

    expect(await editKnowledgeBitOrderedList(basicId, LIST)).toEqual({ error: "wrong_shape" });
  });

  it("should keep the list's cards when someone edits the plain body of a pending list bit", async () => {
    const bitId = await seedListBit();
    const before = await activeCards(bitId);

    expect(await updateKnowledgeBitBody(bitId, "Rewritten body")).toBe(false);
    expect((await activeCards(bitId)).map((card) => card.id)).toEqual(before.map((card) => card.id));
  });
});
