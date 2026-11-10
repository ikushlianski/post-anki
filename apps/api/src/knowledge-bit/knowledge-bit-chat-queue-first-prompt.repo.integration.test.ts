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

const dbName = `chat_first_prompt_${randomUUID().replace(/-/g, "_")}`;
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

const { cancelChatQueueKnowledgeBit, moveKnowledgeBitToChatQueue, returnKnowledgeBitFromChatQueue } = await import(
  "./knowledge-bit-chat-queue.repo.js"
);
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

async function seedBit(state = "pending"): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'Body', $3)`,
    [id, sourceId, state],
  );

  return id;
}

interface BitRow {
  approval_state: string;
  chat_first_prompt: string | null;
  chat_at: Date | null;
  chat_snoozed_until: Date | null;
}

async function rowOf(id: string): Promise<BitRow> {
  const { rows } = await client.query(
    `SELECT approval_state, chat_first_prompt, chat_at, chat_snoozed_until FROM knowledge_bits WHERE id = $1`,
    [id],
  );

  return rows[0];
}

async function messageCount(id: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM knowledge_bit_chat_messages WHERE knowledge_bit_id = $1`, [id]);

  return rows[0].n;
}

async function seedThread(id: string): Promise<void> {
  await insertChatTurn(
    id,
    { clientMessageId: `c_${randomUUID()}`, userText: "q", assistantText: "a", modelId: null, inputTokens: 1, outputTokens: 1 },
    getDb(),
  );
}

describe("first chat prompt storage (real Postgres)", () => {
  it("should store the first prompt when a pending card moves to chat and report it", async () => {
    const id = await seedBit();
    const result = await moveKnowledgeBitToChatQueue(id, "Why this?");

    expect(result).toMatchObject({ ok: true, value: { promptStored: true } });
    expect((await rowOf(id)).chat_first_prompt).toBe("Why this?");
  });

  it("should not store a prompt when none was given", async () => {
    const id = await seedBit();
    const result = await moveKnowledgeBitToChatQueue(id);

    expect(result).toMatchObject({ ok: true, value: { promptStored: false } });
    expect((await rowOf(id)).chat_first_prompt).toBeNull();
  });

  it("should keep the stored prompt and not start a second reply when a card already in chat is sent again", async () => {
    const id = await seedBit();

    await moveKnowledgeBitToChatQueue(id, "First");

    const again = await moveKnowledgeBitToChatQueue(id, "Second");

    expect(again).toMatchObject({ ok: true, value: { promptStored: false } });
    expect((await rowOf(id)).chat_first_prompt).toBe("First");
  });

  it("should forget the prompt when the card goes back to triage", async () => {
    const id = await seedBit();

    await moveKnowledgeBitToChatQueue(id, "Why?");
    await returnKnowledgeBitFromChatQueue(id);

    expect((await rowOf(id)).chat_first_prompt).toBeNull();
  });
});
