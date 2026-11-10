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

const dbName = `chat_cancel_${randomUUID().replace(/-/g, "_")}`;
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

describe("cancel chat (real Postgres)", () => {
  it("should return a chat card to triage and delete the whole conversation", async () => {
    const id = await seedBit();

    await moveKnowledgeBitToChatQueue(id, "Why?");
    await seedThread(id);
    await client.query(`UPDATE knowledge_bits SET chat_snoozed_until = now() + interval '1 day' WHERE id = $1`, [id]);

    expect(await cancelChatQueueKnowledgeBit(id)).toEqual({ ok: true, value: undefined });

    const row = await rowOf(id);

    expect(row).toMatchObject({ approval_state: "pending", chat_first_prompt: null, chat_at: null, chat_snoozed_until: null });
    expect(await messageCount(id)).toBe(0);
  });

  it("should delete the conversation of a pending card without changing its state", async () => {
    const id = await seedBit("pending");

    await seedThread(id);

    expect((await cancelChatQueueKnowledgeBit(id)).ok).toBe(true);
    expect((await rowOf(id)).approval_state).toBe("pending");
    expect(await messageCount(id)).toBe(0);
  });

  it("should keep an approved card approved while clearing its chat", async () => {
    const id = await seedBit("approved");

    await seedThread(id);
    await cancelChatQueueKnowledgeBit(id);

    expect((await rowOf(id)).approval_state).toBe("approved");
    expect(await messageCount(id)).toBe(0);
  });

  it("should dismiss an auto-opened Ask AI chat instead of leaving a blank card in triage", async () => {
    const id = await seedBit("chat");

    await client.query(`UPDATE knowledge_bits SET ordinal = -1 WHERE id = $1`, [id]);
    await seedThread(id);

    expect((await cancelChatQueueKnowledgeBit(id)).ok).toBe(true);
    expect((await rowOf(id)).approval_state).toBe("rejected");
    expect(await messageCount(id)).toBe(0);
  });

  it("should refuse an inbox card", async () => {
    expect(await cancelChatQueueKnowledgeBit(await seedBit("inbox"))).toEqual({ ok: false, reason: "blocked" });
  });

  it("should refuse a rejected card and an unknown card", async () => {
    const id = await seedBit("rejected");

    expect(await cancelChatQueueKnowledgeBit(id)).toEqual({ ok: false, reason: "blocked" });
    expect(await cancelChatQueueKnowledgeBit("kb_missing")).toEqual({ ok: false, reason: "not_found" });
  });
});
