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

const { insertCardFromChatMessage } = await import("./knowledge-bit-chat-card.repo.js");
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
    { clientMessageId: `c_${randomUUID()}`, userText: "q", assistantText: "a", modelId: null, inputTokens: 1, outputTokens: 1 },
    getDb(),
  );

  return { sourceId, bitId };
}

describe("insertCardFromChatMessage (real Postgres)", () => {
  it("should add a pending card on the same source from a tutor reply and leave the chat card in chat", async () => {
    const { sourceId, bitId } = await seedChatBit("chat");

    const result = await insertCardFromChatMessage(bitId, 2, { front: "Front", back: "Back" });

    expect(result.ok).toBe(true);

    const { rows } = await client.query(
      `SELECT b.knowledge_source_id, b.approval_state, b.origin, b.is_ai_generated, v.prompt, v.answer
       FROM knowledge_bits b JOIN knowledge_bit_question_variants v ON v.knowledge_bit_id = b.id WHERE b.id = $1`,
      [result.ok ? result.id : ""],
    );

    expect(rows[0]).toMatchObject({
      knowledge_source_id: sourceId,
      approval_state: "pending",
      origin: "manual",
      is_ai_generated: true,
      prompt: "Front",
      answer: "Back",
    });

    const original = await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [bitId]);

    expect(original.rows[0].approval_state).toBe("chat");
  });

  it("should refuse the user's own message, a missing message and a card that left chat", async () => {
    const inChat = await seedChatBit("chat");
    const decided = await seedChatBit("rejected");

    expect(await insertCardFromChatMessage(inChat.bitId, 1, { front: "F", back: "B" })).toEqual({
      ok: false,
      error: "not_assistant_message",
    });
    expect(await insertCardFromChatMessage(inChat.bitId, 9, { front: "F", back: "B" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await insertCardFromChatMessage(decided.bitId, 2, { front: "F", back: "B" })).toEqual({
      ok: false,
      error: "not_in_chat",
    });
    expect(await insertCardFromChatMessage("kb_missing", 2, { front: "F", back: "B" })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
