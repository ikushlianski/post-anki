import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const dbName = `knowledge_bit_review_chat_${randomUUID().replace(/-/g, "_")}`;
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
  AGENT_KEYS: { knowledgeBitChat: "knowledgeBitChat", knowledgeBitChatQueue: "knowledgeBitChatQueue" },
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

const { askKnowledgeBitChat } = await import("./knowledge-bit-chat.service.js");
const { sendChatQueueMessage, getChatQueueThread, deleteLastChatQueueExchange } = await import(
  "./knowledge-bit-chat-queue.service.js"
);
const { listChatQueueKnowledgeBits, countAllChatQueueKnowledgeBits } = await import(
  "./knowledge-bit-chat-queue.repo.js"
);
const { listChatQueueMessages } = await import("./knowledge-bit-chat-queue-messages.repo.js");

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

beforeEach(() => {
  generate.mockReset();
  generate.mockResolvedValue({ text: "tutor reply" });
});

async function seedBit(state: string): Promise<string> {
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

async function stateOf(id: string): Promise<string> {
  const { rows } = await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [id]);

  return rows[0].approval_state;
}

describe("review chat on approved cards (real Postgres)", () => {
  it("should save an approved card's chat and list it with reviewChat without changing its state", async () => {
    const id = await seedBit("approved");

    expect(await askKnowledgeBitChat(id, { message: "why?", clientMessageId: "c1" })).toEqual({ reply: "tutor reply" });

    expect((await listChatQueueMessages(id)).map((m) => [m.role, m.text])).toEqual([
      ["user", "why?"],
      ["assistant", "tutor reply"],
    ]);
    expect((await listChatQueueKnowledgeBits(10_000)).find((item) => item.id === id)?.reviewChat).toBe(true);
    expect(await stateOf(id)).toBe("approved");
  });

  it("should not duplicate the turn when the same clientMessageId is sent again", async () => {
    const id = await seedBit("approved");

    await askKnowledgeBitChat(id, { message: "why?", clientMessageId: "c1" });

    expect(await askKnowledgeBitChat(id, { message: "why?", clientMessageId: "c1" })).toEqual({ reply: "tutor reply" });
    expect(await listChatQueueMessages(id)).toHaveLength(2);
  });

  it("should save nothing without a clientMessageId, for inbox cards, or when the model fails", async () => {
    const approved = await seedBit("approved");
    const inbox = await seedBit("inbox");

    await askKnowledgeBitChat(approved, { message: "why?" });
    await askKnowledgeBitChat(inbox, { message: "why?", clientMessageId: "c1" });
    generate.mockRejectedValueOnce(new Error("boom"));
    await askKnowledgeBitChat(approved, { message: "again", clientMessageId: "c2" });

    expect(await listChatQueueMessages(approved)).toHaveLength(0);
    expect(await listChatQueueMessages(inbox)).toHaveLength(0);
  });

  it("should let the learner continue and trim the review chat through the queue thread", async () => {
    const id = await seedBit("approved");

    await askKnowledgeBitChat(id, { message: "why?", clientMessageId: "c1" });

    const sent = await sendChatQueueMessage(id, { clientMessageId: "c2", message: "more" });

    expect(sent).toEqual({ ok: true, value: { reply: "tutor reply", replySeq: 4, turnsLeft: 6, capReached: false } });

    const thread = await getChatQueueThread(id);

    expect(thread.ok && thread.value.messages).toHaveLength(4);
    expect(await deleteLastChatQueueExchange(id)).toEqual({ ok: true, value: { turnsLeft: 7, capReached: false } });
    expect(await stateOf(id)).toBe("approved");
    expect(await countAllChatQueueKnowledgeBits()).toBe((await listChatQueueKnowledgeBits(10_000)).length);
  });

  it("should keep refusing queue threads for cards that are neither in chat nor approved", async () => {
    const id = await seedBit("pending");

    expect(await getChatQueueThread(id)).toEqual({ ok: false, error: "not_in_chat" });
    expect(await sendChatQueueMessage(id, { clientMessageId: "c1", message: "hi" })).toEqual({
      ok: false,
      error: "not_in_chat",
    });
  });
});
