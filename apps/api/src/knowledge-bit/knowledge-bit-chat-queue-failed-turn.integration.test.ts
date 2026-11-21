import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const dbName = `knowledge_bit_chat_failed_turn_${randomUUID().replace(/-/g, "_")}`;
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

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { knowledgeBitChatQueue: "knowledgeBitChatQueue" },
  getMastra: () => ({ getAgent: () => ({ generate: vi.fn() }) }),
  startTracingSpan: () => undefined,
}));

const { getChatQueueThread } = await import("./knowledge-bit-chat-queue.service.js");
const { insertChatTurn, countChatQueueTurnsByBit } = await import("./knowledge-bit-chat-queue-messages.repo.js");
const { BUDGET_PAUSED_REPLY, MODEL_FAILED_REPLY } = await import("./chat-queue-failure-replies.js");
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

async function seedChatBit(): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'Body', 'chat')`,
    [id, sourceId],
  );

  return id;
}

async function addTurn(bitId: string, label: string, assistantText = `a-${label}`): Promise<void> {
  await insertChatTurn(
    bitId,
    {
      clientMessageId: `c_${label}`,
      userText: `q-${label}`,
      assistantText,
      modelId: null,
      inputTokens: null,
      outputTokens: null,
    },
    getDb(),
  );
}

async function turnsLeftOf(bitId: string): Promise<number> {
  const thread = await getChatQueueThread(bitId);

  if (!thread.ok) {
    throw new Error("thread not found");
  }

  return thread.value.turnsLeft;
}

describe("a failed AI reply does not use a turn (real Postgres)", () => {
  it("should leave the turns left unchanged after a model-failure reply", async () => {
    const id = await seedChatBit();

    await addTurn(id, "1");
    await addTurn(id, "2", MODEL_FAILED_REPLY);

    expect(await turnsLeftOf(id)).toBe(7);
    expect((await countChatQueueTurnsByBit([id], getDb())).get(id)).toBe(1);
  });

  it("should leave the turns left unchanged after a budget-paused reply", async () => {
    const id = await seedChatBit();

    await addTurn(id, "1", BUDGET_PAUSED_REPLY);

    expect(await turnsLeftOf(id)).toBe(8);
    expect((await countChatQueueTurnsByBit([id], getDb())).get(id)).toBeUndefined();
  });

  it("should still count answered and unanswered messages as used turns", async () => {
    const id = await seedChatBit();

    await addTurn(id, "1");
    await addTurn(id, "2", MODEL_FAILED_REPLY);
    await client.query(
      `INSERT INTO knowledge_bit_chat_messages (id, knowledge_bit_id, seq, role, text) VALUES ($1, $2, 5, 'user', 'dangling')`,
      [`kbcm_${randomUUID()}`, id],
    );

    expect(await turnsLeftOf(id)).toBe(6);
    expect((await countChatQueueTurnsByBit([id], getDb())).get(id)).toBe(2);
  });

  it("should keep a full conversation at zero turns left after a further failure", async () => {
    const id = await seedChatBit();

    for (let i = 0; i < 8; i += 1) {
      await addTurn(id, `ok${i}`);
    }

    await addTurn(id, "fail", MODEL_FAILED_REPLY);

    expect(await turnsLeftOf(id)).toBe(0);
    expect((await countChatQueueTurnsByBit([id], getDb())).get(id)).toBe(8);
  });
});
