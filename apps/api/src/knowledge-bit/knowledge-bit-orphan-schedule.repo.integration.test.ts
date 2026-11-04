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

const dbName = `knowledge_bit_orphan_schedule_${randomUUID().replace(/-/g, "_")}`;
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
const { deleteOrphanScheduleRowsInTx } = await import("./knowledge-bit-orphan-schedule.repo.js");
const { getDb } = await import("../db/client.js");

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

const NOTE = "A deal needs {{c1::budget}}, {{c2::authority}} and {{c3::timing}}.";

async function seedCloze(): Promise<{ bitId: string; variantId: string }> {
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
        statement: "A deal needs budget, authority and timing.",
        quote: "A deal needs budget",
        example: null,
        cards: [
          {
            kind: "cloze",
            question: NOTE,
            answer: "budget / authority / timing",
            statement: "A deal needs budget, authority and timing.",
            quote: "A deal needs budget",
          },
        ],
      },
    ],
  });

  const bit = await client.query(`SELECT id FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);
  const bitId = bit.rows[0]!.id as string;
  const variant = await client.query(
    `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 AND "order" = 1`,
    [bitId],
  );

  return { bitId, variantId: variant.rows[0]!.id as string };
}

async function schedule(bitId: string, cardKey: string, intervalDays: number, suspended = false): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, card_key, interval_days, review_count, suspended_at)
     VALUES ($1, $2, $3, 2, $4)`,
    [bitId, cardKey, intervalDays, suspended ? new Date() : null],
  );
}

async function scheduleRows(bitId: string) {
  const { rows } = await client.query(
    `SELECT card_key, interval_days, suspended_at FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1 ORDER BY card_key`,
    [bitId],
  );

  return rows as { card_key: string; interval_days: number; suspended_at: Date | null }[];
}

describe("leftover card schedules after a note's cards are replaced (real Postgres)", () => {
  it("should drop the schedule of gap 3 and keep the progress of gaps 1 and 2 when a 3-gap cloze is edited to 2 gaps", async () => {
    const { bitId, variantId } = await seedCloze();

    await schedule(bitId, "cloze:1", 6);
    await schedule(bitId, "cloze:2", 12, true);
    await schedule(bitId, "cloze:3", 20);

    const edited = "A deal needs {{c1::budget}} and {{c2::authority}}.";

    expect(await editKnowledgeBitClozeNote(variantId, edited)).toMatchObject({ ok: true });

    const rows = await scheduleRows(bitId);

    expect(rows.map((row) => row.card_key)).toEqual(["cloze:1", "cloze:2"]);
    expect(rows.map((row) => row.interval_days)).toEqual([6, 12]);
    expect(rows[0]!.suspended_at).toBeNull();
    expect(rows[1]!.suspended_at).not.toBeNull();
  });

  it("should remove every keyed schedule that no active card produces and leave the note-level row alone", async () => {
    const { bitId } = await seedCloze();

    await schedule(bitId, "", 4);
    await schedule(bitId, "cloze:1", 6);
    await schedule(bitId, "cloze:7", 9, true);
    await schedule(bitId, "list_step:2", 3);

    const removed = await getDb().transaction((tx) => deleteOrphanScheduleRowsInTx(tx, bitId));

    expect(removed).toBe(2);
    expect((await scheduleRows(bitId)).map((row) => row.card_key)).toEqual(["", "cloze:1"]);
  });

  it("should not touch the schedules of another note", async () => {
    const first = await seedCloze();
    const second = await seedCloze();

    await schedule(second.bitId, "cloze:9", 5);
    await getDb().transaction((tx) => deleteOrphanScheduleRowsInTx(tx, first.bitId));

    expect((await scheduleRows(second.bitId)).map((row) => row.card_key)).toEqual(["cloze:9"]);
  });
});
