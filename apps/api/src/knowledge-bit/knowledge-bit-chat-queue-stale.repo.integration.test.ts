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

const dbName = `chat_queue_stale_${randomUUID().replace(/-/g, "_")}`;
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

const { getStaleChatQueueSummary } = await import("./knowledge-bit-chat-queue-stale.repo.js");
const { countChatQueueKnowledgeBits, listChatQueueKnowledgeBits, snoozeChatQueueKnowledgeBit } = await import(
  "./knowledge-bit-chat-queue.repo.js"
);

const DAY = 86_400_000;
let client: pg.Client;
let sourceId: string;
let ordinal = 0;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  sourceId = `ksrc_${randomUUID()}`;
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [sourceId],
  );
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

async function seedBit(state: string, chatAt: Date | null, source: string = sourceId): Promise<string> {
  ordinal += 1;
  const id = `kb_${randomUUID()}`;
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, chat_at)
     VALUES ($1, $2, $3, 'Body', $4, $5)`,
    [id, source, ordinal, state, chatAt],
  );

  return id;
}

describe("getStaleChatQueueSummary (real Postgres)", () => {
  it("should report nothing when no Chat card has waited past the cutoff", async () => {
    await seedBit("chat", new Date(Date.now() - DAY));
    await seedBit("pending", new Date(Date.now() - 10 * DAY));

    expect(await getStaleChatQueueSummary(new Date(Date.now() - 3 * DAY))).toEqual({ count: 0, oldestChatAt: null });
  });

  it("should count only Chat cards older than the cutoff and report the oldest", async () => {
    const oldest = new Date(Date.now() - 9 * DAY);

    await seedBit("chat", oldest);
    await seedBit("chat", new Date(Date.now() - 5 * DAY));

    const summary = await getStaleChatQueueSummary(new Date(Date.now() - 3 * DAY));

    expect(summary.count).toBe(2);
    expect(summary.oldestChatAt).toBe(oldest.toISOString());
  });
});

describe("getStaleChatQueueSummary with a missing source (real Postgres)", () => {
  it("should not count an old Chat card whose source is missing", async () => {
    const before = await getStaleChatQueueSummary(new Date(Date.now() - 3 * DAY));

    await seedBit("chat", new Date(Date.now() - 30 * DAY), `ksrc_${randomUUID()}`);

    expect(await getStaleChatQueueSummary(new Date(Date.now() - 3 * DAY))).toEqual(before);
  });
});

describe("Chat card snooze (real Postgres)", () => {
  it("should hide a snoozed card from the reminder and badge count but keep it listed and flagged", async () => {
    const before = await countChatQueueKnowledgeBits();
    const staleBefore = await getStaleChatQueueSummary(new Date(Date.now() - 3 * DAY));
    const id = await seedBit("chat", new Date(Date.now() - 20 * DAY));

    expect(await countChatQueueKnowledgeBits()).toBe(before + 1);
    expect((await getStaleChatQueueSummary(new Date(Date.now() - 3 * DAY))).count).toBe(staleBefore.count + 1);

    const until = new Date(Date.now() + 3 * DAY);
    const snoozed = await snoozeChatQueueKnowledgeBit(id, until);

    expect(snoozed).toEqual({ ok: true, value: until.toISOString() });
    expect(await countChatQueueKnowledgeBits()).toBe(before);
    expect((await getStaleChatQueueSummary(new Date(Date.now() - 3 * DAY))).count).toBe(staleBefore.count);

    const listed = (await listChatQueueKnowledgeBits(200)).find((item) => item.id === id);

    expect(listed?.snoozedUntil).toBe(until.toISOString());
  });

  it("should count the card again once the snooze is cleared or has expired", async () => {
    const before = await countChatQueueKnowledgeBits();
    const id = await seedBit("chat", new Date(Date.now() - 20 * DAY));

    await snoozeChatQueueKnowledgeBit(id, new Date(Date.now() + DAY));
    expect(await countChatQueueKnowledgeBits()).toBe(before);

    await snoozeChatQueueKnowledgeBit(id, null);
    expect(await countChatQueueKnowledgeBits()).toBe(before + 1);

    await client.query(`UPDATE knowledge_bits SET chat_snoozed_until = now() - interval '1 minute' WHERE id = $1`, [id]);
    expect(await countChatQueueKnowledgeBits()).toBe(before + 1);
    expect((await listChatQueueKnowledgeBits(200)).find((item) => item.id === id)?.snoozedUntil).toBeNull();
  });

  it("should refuse to snooze cards that are not in Chat or do not exist", async () => {
    const pendingId = await seedBit("pending", null);

    expect(await snoozeChatQueueKnowledgeBit(pendingId, new Date(Date.now() + DAY))).toEqual({
      ok: false,
      reason: "blocked",
    });
    expect(await snoozeChatQueueKnowledgeBit("kb_missing", new Date(Date.now() + DAY))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
