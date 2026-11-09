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

const dbName = `knowledge_bit_chat_delete_last_${randomUUID().replace(/-/g, "_")}`;
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

const generate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { knowledgeBitChatQueue: "knowledgeBitChatQueue" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
  startTracingSpan: () => undefined,
}));
vi.mock("../mastra/generate-with-retry.js", () => ({
  generateWithRetry: (_op: string, _c: unknown, _k: string, fn: () => unknown) => fn(),
}));
vi.mock("../shared/spend-guard.js", () => ({
  LlmBudgetExceededError: class extends Error {},
  LlmBudgetCheckUnavailableError: class extends Error {},
  assertLlmBudgetAvailable: async () => undefined,
}));

const { deleteLastChatQueueExchange, sendChatQueueMessage, getChatQueueThread, CHAT_QUEUE_REPLY_OP } =
  await import("./knowledge-bit-chat-queue.service.js");
const { insertChatTurn, listChatQueueMessages } = await import("./knowledge-bit-chat-queue-messages.repo.js");
const { countRecentLlmCallEventsByOp, recordLlmCallEvent } = await import("../llm-call-events/llm-call-events.repo.js");
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

async function seedChatBit(state = "chat"): Promise<string> {
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

async function addTurn(bitId: string, label: string): Promise<void> {
  await insertChatTurn(
    bitId,
    {
      clientMessageId: `c_${label}`,
      userText: `q-${label}`,
      assistantText: `a-${label}`,
      modelId: null,
      inputTokens: 1,
      outputTokens: 1,
    },
    getDb(),
  );
}

async function logReplyCall(): Promise<void> {
  await recordLlmCallEvent({
    curriculumId: null,
    op: CHAT_QUEUE_REPLY_OP,
    agentKey: "knowledgeBitChatQueue",
    durationMs: 5,
    success: true,
    errorMessage: null,
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
  });
}

describe("delete last chat exchange (real Postgres)", () => {
  it("should remove the last question with its reply and give that turn back", async () => {
    const id = await seedChatBit();

    await addTurn(id, "1");
    await addTurn(id, "2");

    const result = await deleteLastChatQueueExchange(id);

    expect(result).toEqual({ ok: true, value: { turnsLeft: 7, capReached: false } });
    expect((await listChatQueueMessages(id)).map((message) => message.text)).toEqual(["q-1", "a-1"]);
  });

  it("should remove only the trailing question when no reply was stored", async () => {
    const id = await seedChatBit();

    await addTurn(id, "1");
    await client.query(
      `INSERT INTO knowledge_bit_chat_messages (id, knowledge_bit_id, seq, role, text) VALUES ($1, $2, 3, 'user', 'dangling')`,
      [`kbcm_${randomUUID()}`, id],
    );

    const result = await deleteLastChatQueueExchange(id);

    expect(result).toEqual({ ok: true, value: { turnsLeft: 7, capReached: false } });
    expect((await listChatQueueMessages(id)).map((message) => message.text)).toEqual(["q-1", "a-1"]);
  });

  it("should reopen a thread that had hit the turn limit", async () => {
    const id = await seedChatBit();

    for (let i = 0; i < 8; i += 1) {
      await addTurn(id, String(i));
    }

    expect(await deleteLastChatQueueExchange(id)).toEqual({ ok: true, value: { turnsLeft: 1, capReached: false } });

    const thread = await getChatQueueThread(id);

    expect(thread.ok && thread.value.turnsLeft).toBe(1);
  });

  it("should answer no_messages when the thread is empty", async () => {
    const id = await seedChatBit();

    expect(await deleteLastChatQueueExchange(id)).toEqual({ ok: false, error: "no_messages" });
  });

  it("should answer not_found for an unknown card and not_in_chat for a card outside Chat", async () => {
    const outside = await seedChatBit("rejected");

    expect(await deleteLastChatQueueExchange(`kb_${randomUUID()}`)).toEqual({ ok: false, error: "not_found" });
    expect(await deleteLastChatQueueExchange(outside)).toEqual({ ok: false, error: "not_in_chat" });
  });

  it("should refuse with in_flight while a reply is being generated and keep the thread intact", async () => {
    const id = await seedChatBit();

    await addTurn(id, "1");

    let release: (value: { text: string }) => void = () => undefined;

    generate.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const sending = sendChatQueueMessage(id, { clientMessageId: "c_new", message: "next?" });

    await vi.waitFor(() => expect(generate).toHaveBeenCalled());

    expect(await deleteLastChatQueueExchange(id)).toEqual({ ok: false, error: "in_flight" });
    expect(await listChatQueueMessages(id)).toHaveLength(2);

    release({ text: "reply" });
    await sending;

    expect(await listChatQueueMessages(id)).toHaveLength(4);
  });

  it("should not refund the hourly reply count that comes from llm_call_events", async () => {
    const id = await seedChatBit();

    await addTurn(id, "1");
    await logReplyCall();

    const before = await countRecentLlmCallEventsByOp(CHAT_QUEUE_REPLY_OP, 60 * 60 * 1000);

    await deleteLastChatQueueExchange(id);

    const after = await countRecentLlmCallEventsByOp(CHAT_QUEUE_REPLY_OP, 60 * 60 * 1000);
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM llm_call_events WHERE op = $1`, [
      CHAT_QUEUE_REPLY_OP,
    ]);

    expect(before).toBeGreaterThan(0);
    expect(after).toBe(before);
    expect(rows[0].n).toBe(before);
  });
});
