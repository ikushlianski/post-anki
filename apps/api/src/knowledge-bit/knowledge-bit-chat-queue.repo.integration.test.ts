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

const dbName = `knowledge_bit_chat_queue_${randomUUID().replace(/-/g, "_")}`;
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

const { approveKnowledgeBit, rejectKnowledgeBit } = await import("./knowledge-bit-approval.repo.js");
const { deleteKnowledgeBitsBulk } = await import("./knowledge-bit-delete.repo.js");
const { clearAllKnowledge } = await import("./knowledge-cleanup.repo.js");
const { checkExampleGate, getKnowledgeBitExampleState } = await import("./knowledge-bit-example.repo.js");
const { countAllChatQueueKnowledgeBits, countChatQueueKnowledgeBits, listChatQueueKnowledgeBits, moveKnowledgeBitToChatQueue, returnKnowledgeBitFromChatQueue } =
  await import("./knowledge-bit-chat-queue.repo.js");
const { deleteChatThreadsForCardsNotInChat, deleteChatThreadsOfDecidedCards, insertChatTurn, listChatQueueMessages } = await import(
  "./knowledge-bit-chat-queue-messages.repo.js"
);
const { claimSourceAndSupersedeAllBits } = await import("../knowledge-source/knowledge-source-reextract.repo.js");
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

async function seedKnowledgeSource(subjectId: string | null = null): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'Some prose.', 'pending', $2)`,
    [id, subjectId],
  );

  return id;
}

async function seedBit(
  sourceId: string,
  ordinal: number,
  state = "pending",
  background: string | null = null,
  createdAt = new Date(),
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, background, approval_state, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, sourceId, ordinal, `Body ${ordinal}`, background, state, createdAt],
  );

  return id;
}

async function seedCard(bitId: string, order: number, supersededAt: Date | null = null): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at)
     VALUES ($1, $2, 'basic', $3, 'Q', 'A', $4)`,
    [`kbqv_${randomUUID()}`, bitId, order, supersededAt],
  );
}

async function stateOf(id: string): Promise<string> {
  const { rows } = await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [id]);

  return rows[0].approval_state;
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

describe("chat queue transitions (real Postgres)", () => {
  it("should move a pending card into the chat list and back out", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0);

    expect((await moveKnowledgeBitToChatQueue(id)).ok).toBe(true);
    expect(await stateOf(id)).toBe("chat");
    expect((await listChatQueueKnowledgeBits(500)).map((item) => item.id)).toContain(id);
    expect(await countChatQueueKnowledgeBits()).toBeGreaterThan(0);

    expect((await returnKnowledgeBitFromChatQueue(id)).ok).toBe(true);
    expect(await stateOf(id)).toBe("pending");
  });

  it("should move an inbox card into chat, clear its inbox time and list it", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "inbox");

    await client.query("UPDATE knowledge_bits SET inbox_at = now() WHERE id = $1", [id]);

    expect((await moveKnowledgeBitToChatQueue(id)).ok).toBe(true);
    expect(await stateOf(id)).toBe("chat");

    const { rows } = await client.query("SELECT inbox_at, chat_at FROM knowledge_bits WHERE id = $1", [id]);

    expect(rows[0].inbox_at).toBeNull();
    expect(rows[0].chat_at).not.toBeNull();
    expect((await listChatQueueKnowledgeBits(500)).map((item) => item.id)).toContain(id);
  });

  it("should refuse to move a rejected card into chat", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "rejected");

    expect(await moveKnowledgeBitToChatQueue(id)).toEqual({ ok: false, reason: "blocked" });
  });

  it("should refuse to move a decided card into chat", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "approved");

    expect(await moveKnowledgeBitToChatQueue(id)).toEqual({ ok: false, reason: "blocked" });
  });

  it("should show turns left in the list based on stored user messages", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");

    await seedThread(id);

    const item = (await listChatQueueKnowledgeBits(500)).find((entry) => entry.id === id);

    expect(item?.turnsLeft).toBe(7);
  });

  it("should show the parent path for a nested subject in the chat queue list", async () => {
    const root = `subj_${randomUUID()}`;
    const child = `subj_${randomUUID()}`;

    await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, 'Business', 'general')`, [root]);
    await client.query(`INSERT INTO subjects (id, name, kind, parent_id) VALUES ($1, 'Common', 'general', $2)`, [child, root]);

    const id = await seedBit(await seedKnowledgeSource(child), 0, "chat");
    const item = (await listChatQueueKnowledgeBits(500)).find((entry) => entry.id === id);

    expect(item).toMatchObject({ subjectId: child, subjectName: "Business › Common" });
  });

  it("should neither list nor count a chat card whose source is missing", async () => {
    const before = { all: await countAllChatQueueKnowledgeBits(), badge: await countChatQueueKnowledgeBits() };
    const orphan = await seedBit(`ksrc_${randomUUID()}`, 0, "chat");
    const listed = await seedBit(await seedKnowledgeSource(), 0, "chat");
    const items = (await listChatQueueKnowledgeBits(500)).map((entry) => entry.id);

    expect(items).toContain(listed);
    expect(items).not.toContain(orphan);
    expect(await countAllChatQueueKnowledgeBits()).toBe(before.all + 1);
    expect(await countChatQueueKnowledgeBits()).toBe(before.badge + 1);
  });

  it("should count snoozed cards in the full total but not in the badge count", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");
    const before = { all: await countAllChatQueueKnowledgeBits(), badge: await countChatQueueKnowledgeBits() };

    await client.query("UPDATE knowledge_bits SET chat_snoozed_until = now() + interval '5 days' WHERE id = $1", [id]);

    expect(await countAllChatQueueKnowledgeBits()).toBe(before.all);
    expect(await countChatQueueKnowledgeBits()).toBe(before.badge - 1);
  });

  it("should expose the source title and url on a queued card", async () => {
    const sourceId = await seedKnowledgeSource();

    await client.query(
      `UPDATE knowledge_sources SET raw_text = $2, source_url = $3 WHERE id = $1`,
      [sourceId, "\n  Rust ownership\nLong body text", "https://example.com/rust"],
    );

    const id = await seedBit(sourceId, 0, "chat");
    const item = (await listChatQueueKnowledgeBits(500)).find((entry) => entry.id === id);

    expect(item?.sourceTitle).toBe("Rust ownership");
    expect(item?.sourceUrl).toBe("https://example.com/rust");
  });

  it("should leave the source fields empty when the source has no text or url", async () => {
    const sourceId = await seedKnowledgeSource();

    await client.query(`UPDATE knowledge_sources SET raw_text = NULL WHERE id = $1`, [sourceId]);

    const id = await seedBit(sourceId, 0, "chat");
    const item = (await listChatQueueKnowledgeBits(500)).find((entry) => entry.id === id);

    expect(item?.sourceTitle).toBeNull();
    expect(item?.sourceUrl).toBeNull();
  });

  it("should approve a chat card and delete its thread", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");

    await seedCard(id, 0);
    await seedThread(id);

    expect(await approveKnowledgeBit(id)).toBe(true);
    expect(await stateOf(id)).toBe("approved");
    expect(await messageCount(id)).toBe(0);
  });

  it("should reject a chat card and delete its thread", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");

    await seedThread(id);

    expect((await rejectKnowledgeBit(id)).ok).toBe(true);
    expect(await stateOf(id)).toBe("rejected");
    expect(await messageCount(id)).toBe(0);
  });

  it("should allow an AI example on a chat card", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");

    expect(checkExampleGate(await getKnowledgeBitExampleState(id), false)).toBeNull();
  });

  it("should delete the thread when an approved card is deleted", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "approved");

    await seedThread(id);
    await deleteKnowledgeBitsBulk([id]);

    expect(await messageCount(id)).toBe(0);
  });

  it("should keep the thread order stable across turns", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");

    await seedThread(id);
    await seedThread(id);

    expect((await listChatQueueMessages(id)).map((m) => m.seq)).toEqual([1, 2, 3, 4]);
  });

  it("should delete every thread when all knowledge is cleared", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");

    await seedThread(id);
    await clearAllKnowledge();

    expect(await messageCount(id)).toBe(0);
  });

  it("should keep the thread while the card stays in chat and when it is sent back to pending", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "pending");

    await moveKnowledgeBitToChatQueue(id);
    await seedThread(id);
    await moveKnowledgeBitToChatQueue(id);

    expect(await messageCount(id)).toBe(2);

    await returnKnowledgeBitFromChatQueue(id);

    expect(await messageCount(id)).toBe(2);
  });

  it("should refuse to delete a chat card and keep its thread", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");

    await seedThread(id);

    expect((await deleteKnowledgeBitsBulk([id])).skipped).toEqual([{ id, reason: "not_approved" }]);
    expect(await messageCount(id)).toBe(2);
  });

  it("should delete the thread when re-extraction supersedes a chat card", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedBit(sourceId, 0, "chat");

    await client.query(`UPDATE knowledge_sources SET status = 'bits_detected' WHERE id = $1`, [sourceId]);
    await seedThread(id);

    expect(await claimSourceAndSupersedeAllBits(sourceId)).toMatchObject({ ok: true });
    expect(await stateOf(id)).toBe("superseded");
    expect(await messageCount(id)).toBe(0);
  });

  it("should sweep threads of cards no longer in chat or missing, and spare chat cards", async () => {
    const sourceId = await seedKnowledgeSource();
    const inChat = await seedBit(sourceId, 0, "chat");
    const approved = await seedBit(sourceId, 1, "approved");
    const pending = await seedBit(sourceId, 2, "pending");
    const missing = `kb_${randomUUID()}`;

    for (const id of [inChat, approved, pending, missing]) {
      await seedThread(id);
    }

    expect(await deleteChatThreadsForCardsNotInChat()).toBeGreaterThanOrEqual(6);
    expect(await messageCount(inChat)).toBe(2);
    expect(await messageCount(approved)).toBe(0);
    expect(await messageCount(pending)).toBe(0);
    expect(await messageCount(missing)).toBe(0);
  });

  it("should delete threads only for rejected cards decided more than 30 days ago and keep approved review chats", async () => {
    const sourceId = await seedKnowledgeSource();
    const now = new Date();
    const daysAgo = (days: number): Date => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const oldApproved = await seedBit(sourceId, 0, "approved");
    const oldRejected = await seedBit(sourceId, 1, "rejected");
    const recentApproved = await seedBit(sourceId, 2, "approved");
    const inChat = await seedBit(sourceId, 3, "chat");
    const snoozed = await seedBit(sourceId, 4, "chat");
    const reopenedOld = await seedBit(sourceId, 5, "chat");

    await client.query("UPDATE knowledge_bits SET decided_at = $2 WHERE id = ANY($1)", [[oldApproved, oldRejected, reopenedOld], daysAgo(31)]);
    await client.query("UPDATE knowledge_bits SET decided_at = $2 WHERE id = $1", [recentApproved, daysAgo(29)]);
    await client.query("UPDATE knowledge_bits SET chat_snoozed_until = $2 WHERE id = $1", [snoozed, daysAgo(-5)]);

    for (const id of [oldApproved, oldRejected, recentApproved, inChat, snoozed, reopenedOld]) {
      await seedThread(id);
    }

    expect(await deleteChatThreadsOfDecidedCards(now)).toBeGreaterThanOrEqual(1);
    expect(await messageCount(oldApproved)).toBe(2);
    expect(await messageCount(oldRejected)).toBe(0);
    expect(await messageCount(recentApproved)).toBe(2);
    expect(await messageCount(inChat)).toBe(2);
    expect(await messageCount(snoozed)).toBe(2);
    expect(await messageCount(reopenedOld)).toBe(2);
  });

  it("should stamp the decision time when a card is approved or rejected", async () => {
    const sourceId = await seedKnowledgeSource();
    const approved = await seedBit(sourceId, 0, "chat");
    const rejected = await seedBit(sourceId, 1, "chat");

    await seedCard(approved, 0);
    await approveKnowledgeBit(approved);
    await rejectKnowledgeBit(rejected);

    const rows = await client.query("SELECT decided_at FROM knowledge_bits WHERE id = ANY($1)", [[approved, rejected]]);

    expect(rows.rows.every((row) => row.decided_at instanceof Date)).toBe(true);
  });

  it("should list an approved card with a saved chat as a review chat without changing its state", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "approved");
    const quiet = await seedBit(await seedKnowledgeSource(), 0, "approved");

    await seedThread(id);

    const items = await listChatQueueKnowledgeBits(10_000);
    const item = items.find((entry) => entry.id === id);

    expect(item?.reviewChat).toBe(true);
    expect(item?.turnsLeft).toBe(7);
    expect(Number.isNaN(Date.parse(item?.chatAt ?? ""))).toBe(false);
    expect(items.map((entry) => entry.id)).not.toContain(quiet);
    expect(await stateOf(id)).toBe("approved");
  });

  it("should not flag cards still in chat as review chats", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "chat");
    const item = (await listChatQueueKnowledgeBits(10_000)).find((entry) => entry.id === id);

    expect(item?.reviewChat).toBe(false);
  });

  it("should count review chats exactly as many as the list shows", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "approved");

    await seedThread(id);

    const items = await listChatQueueKnowledgeBits(10_000);

    expect(await countAllChatQueueKnowledgeBits()).toBe(items.length);
    expect(await countChatQueueKnowledgeBits()).toBe(items.filter((entry) => entry.snoozedUntil === null).length);
  });

  it("should clear an approved card's chat on return, leave its state and drop it from the queue", async () => {
    const id = await seedBit(await seedKnowledgeSource(), 0, "approved");

    await seedThread(id);

    expect(await returnKnowledgeBitFromChatQueue(id)).toEqual({ ok: true, value: undefined });
    expect(await returnKnowledgeBitFromChatQueue(id)).toEqual({ ok: true, value: undefined });
    expect(await stateOf(id)).toBe("approved");
    expect(await messageCount(id)).toBe(0);
    expect((await listChatQueueKnowledgeBits(10_000)).map((entry) => entry.id)).not.toContain(id);
  });
});
