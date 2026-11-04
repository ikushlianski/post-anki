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

const dbName = `chat_queue_search_${randomUUID().replace(/-/g, "_")}`;
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

const { searchChatQueueMessages, escapeLikePattern, buildSnippet } = await import(
  "./knowledge-bit-chat-queue-search.repo.js"
);

let client: pg.Client;
let ordinal = 0;
let sourceId: string;

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

async function seedBit(state: string): Promise<string> {
  ordinal += 1;

  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, chat_at)
     VALUES ($1, $2, $3, 'Body', $4, now())`,
    [id, sourceId, ordinal, state],
  );

  return id;
}

async function seedMessage(bitId: string, seq: number, role: string, text: string, ageSeconds = 0): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_chat_messages (id, knowledge_bit_id, seq, role, text, created_at)
     VALUES ($1, $2, $3, $4, $5, now() - make_interval(secs => $6))`,
    [`kbcm_${randomUUID()}`, bitId, seq, role, text, ageSeconds],
  );
}

describe("searchChatQueueMessages (real Postgres)", () => {
  it("should find a message case-insensitively with its card, role and a snippet around the match", async () => {
    const bit = await seedBit("chat");

    await seedMessage(bit, 1, "assistant", "Ownership means each value has a single OWNER at a time.");

    const { results: found, hasMore } = await searchChatQueueMessages("single owner");

    expect(found).toEqual([
      { cardId: bit, seq: 1, role: "assistant", snippet: "Ownership means each value has a single OWNER at a time." },
    ]);
    expect(hasMore).toBe(false);
  });

  it("should ignore messages of cards that are no longer in the Chat queue", async () => {
    const decided = await seedBit("approved");
    const pending = await seedBit("pending");

    await seedMessage(decided, 1, "user", "zebra-needle in decided card");
    await seedMessage(pending, 1, "user", "zebra-needle in pending card");

    expect(await searchChatQueueMessages("zebra-needle")).toEqual({ results: [], hasMore: false });
  });

  it("should treat percent, underscore and backslash in the query as plain characters", async () => {
    const bit = await seedBit("chat");

    await seedMessage(bit, 1, "user", "discount of 50% today");
    await seedMessage(bit, 2, "user", "discount of 500 today");
    await seedMessage(bit, 3, "user", "snake_case name");
    await seedMessage(bit, 4, "user", "snakeXcase name");
    await seedMessage(bit, 5, "user", "path a\\b here");

    expect((await searchChatQueueMessages("50%")).results.map((r) => r.seq)).toEqual([1]);
    expect((await searchChatQueueMessages("snake_case")).results.map((r) => r.seq)).toEqual([3]);
    expect((await searchChatQueueMessages("a\\b")).results.map((r) => r.seq)).toEqual([5]);
    expect((await searchChatQueueMessages("%%")).results).toEqual([]);
  });

  it("should return at most 20 results, newest message first", async () => {
    const bit = await seedBit("chat");

    for (let i = 1; i <= 25; i += 1) {
      await seedMessage(bit, 100 + i, "user", `limitprobe ${i}`, 1000 - i);
    }

    const { results, hasMore } = await searchChatQueueMessages("limitprobe");

    expect(results).toHaveLength(20);
    expect(hasMore).toBe(true);
    expect(results[0]?.snippet).toBe("limitprobe 25");
  });

  it("should not flag a cut when exactly 20 results match", async () => {
    const bit = await seedBit("chat");

    for (let i = 1; i <= 20; i += 1) {
      await seedMessage(bit, 200 + i, "user", `exactprobe ${i}`, 2000 - i);
    }

    const { results, hasMore } = await searchChatQueueMessages("exactprobe");

    expect(results).toHaveLength(20);
    expect(hasMore).toBe(false);
  });
});

describe("search helpers", () => {
  it("should escape LIKE wildcards", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("should trim a long message to a window around the match with ellipses", () => {
    const text = `${"x".repeat(100)} needle ${"y".repeat(200)}`;
    const snippet = buildSnippet(text, "needle");

    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet).toContain("needle");
    expect(snippet.length).toBeLessThan(150);
  });
});
