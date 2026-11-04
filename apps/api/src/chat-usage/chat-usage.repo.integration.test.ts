import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb, getDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `chat_usage_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;

const { getChatUsageTotals } = await import("./chat-usage.repo.js");
const { deleteChatQueueMessages, insertChatTurn } = await import(
  "../knowledge-bit/knowledge-bit-chat-queue-messages.repo.js"
);

const OP = "knowledge_bit_chat_queue_reply";
let client: pg.Client;

async function insertEvent(op: string, createdAt: Date, prompt: number, completion: number) {
  await client.query(
    `INSERT INTO llm_call_events (id, op, agent_key, duration_ms, success, prompt_tokens, completion_tokens, created_at)
     VALUES ($1, $2, 'agent', 10, true, $3, $4, $5)`,
    [`evt_${randomUUID()}`, op, prompt, completion, createdAt],
  );
}

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

describe("getChatUsageTotals", () => {
  it("should count only today's UTC chat calls with their tokens and ignore other ops and earlier days", async () => {
    const now = new Date("2026-10-29T12:00:00Z");

    await insertEvent(OP, new Date("2026-10-29T00:00:01Z"), 100, 20);
    await insertEvent(OP, new Date("2026-10-29T11:00:00Z"), 50, 10);
    await insertEvent(OP, new Date("2026-10-28T23:59:59Z"), 999, 999);
    await insertEvent("other_op", new Date("2026-10-29T11:00:00Z"), 777, 777);

    expect(await getChatUsageTotals(OP, now)).toEqual({ calls: 2, inputTokens: 150, outputTokens: 30 });
  });

  it("should keep counting calls after the chat thread is deleted by approve or reject", async () => {
    const bitId = `kb_${randomUUID()}`;
    const now = new Date();

    await insertEvent(OP, now, 40, 8);
    await insertChatTurn(
      bitId,
      {
        clientMessageId: randomUUID(),
        userText: "q",
        assistantText: "a",
        modelId: null,
        inputTokens: 40,
        outputTokens: 8,
      },
      getDb(),
    );

    const before = await getChatUsageTotals(OP, now);

    await deleteChatQueueMessages(getDb(), [bitId]);

    const left = await client.query(`SELECT count(*)::int AS n FROM knowledge_bit_chat_messages WHERE knowledge_bit_id = $1`, [bitId]);

    expect(left.rows[0].n).toBe(0);
    expect(await getChatUsageTotals(OP, now)).toEqual(before);
    expect(before.calls).toBeGreaterThanOrEqual(1);
  });
});
