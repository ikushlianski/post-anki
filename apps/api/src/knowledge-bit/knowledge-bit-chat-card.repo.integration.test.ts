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

const dbName = `knowledge_bit_chat_card_${randomUUID().replace(/-/g, "_")}`;
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

const { applyChatCardRevision } = await import("./knowledge-bit-chat-card.repo.js");
const { insertChatTurn } = await import("./knowledge-bit-chat-queue-messages.repo.js");
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

async function seedChatBit(state: string): Promise<{ sourceId: string; bitId: string }> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'Body', $3)`,
    [bitId, sourceId, state],
  );
  await insertChatTurn(
    bitId,
    {
      clientMessageId: `c_${randomUUID()}`,
      userText: "q",
      assistantText: "a",
      modelId: null,
      inputTokens: 1,
      outputTokens: 1,
    },
    getDb(),
  );

  return { sourceId, bitId };
}

describe("applyChatCardRevision (real Postgres)", () => {
  async function seedApprovedBit(): Promise<string> {
    const { bitId } = await seedChatBit("approved");

    await client.query(
      `UPDATE knowledge_bits SET background = 'Old example', embedded_at = now(), tagged_at = now(),
       wh_question_generated_at = now(), wh_question_generation_attempts = 3 WHERE id = $1`,
      [bitId],
    );
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
       VALUES ($1, $2, 'basic', 0, 'Old Q', 'Old A'), ($3, $2, 'wh_question', 0, 'Stale wh', 'Stale wh a')`,
      [`kbqv_${randomUUID()}`, bitId, `kbqv_${randomUUID()}`],
    );

    return bitId;
  }

  it("should drop stale variants, embedding and tag stamps and keep the example when the revision has none", async () => {
    const bitId = await seedApprovedBit();
    const db = getDb();
    const result = await db.transaction((tx) => applyChatCardRevision(tx, bitId, { front: "New Q", back: "New A" }));

    expect(result).toEqual({ ok: true });

    const bit = await client.query(
      `SELECT body, background, embedded_at, tagged_at, wh_question_generated_at, wh_question_generation_attempts
       FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );
    const variants = await client.query(
      `SELECT kind, prompt FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 AND superseded_at IS NULL`,
      [bitId],
    );

    expect(bit.rows[0]).toMatchObject({
      body: "New Q\nNew A",
      background: "Old example",
      embedded_at: null,
      tagged_at: null,
      wh_question_generation_attempts: 0,
    });
    expect(bit.rows[0].wh_question_generated_at).not.toBeNull();
    expect(variants.rows).toEqual([{ kind: "basic", prompt: "New Q" }]);
  });

  it("should overwrite the example only when the revision supplies one", async () => {
    const bitId = await seedApprovedBit();

    await getDb().transaction((tx) =>
      applyChatCardRevision(tx, bitId, {
        front: "Q",
        back: "A",
        example: "New example",
      }),
    );

    const { rows } = await client.query(`SELECT background FROM knowledge_bits WHERE id = $1`, [bitId]);

    expect(rows[0].background).toBe("New example");
  });

  it("should not touch a card that has cloze variants", async () => {
    const bitId = await seedApprovedBit();

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
       VALUES ($1, $2, 'cloze', 0, 'c', 'c')`,
      [`kbqv_${randomUUID()}`, bitId],
    );

    const result = await getDb().transaction((tx) => applyChatCardRevision(tx, bitId, { front: "Q", back: "A" }));

    expect(result).toEqual({ ok: false, error: "wrong_shape" });
  });
});
