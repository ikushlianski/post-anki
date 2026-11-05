import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `ask_ai_chat_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: url.toString() });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = url.toString();
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { getDb } = await import("../db/client.js");
const { knowledgeBits, knowledgeSources } = await import("../db/schema.js");
const { countRecentAskAiChatBits, insertAskAiChatBit, listHeldAskAiBits } = await import("./ask-ai-chat.repo.js");
const { listChatQueueKnowledgeBits } = await import("./knowledge-bit-chat-queue.repo.js");

afterAll(async () => {
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

async function seedSource(id: string): Promise<void> {
  await getDb().insert(knowledgeSources).values({ id, kind: "note", rawText: "text", status: "bits_detected" });
}

describe("insertAskAiChatBit", () => {
  it("should create one chat bit per source however often extraction is retried", async () => {
    await seedSource("ks_a");

    const first = await insertAskAiChatBit("ks_a", "Why?");
    const second = await insertAskAiChatBit("ks_a", "Why?");

    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false, active: true });
    expect(await countRecentAskAiChatBits(60 * 60 * 1000)).toBe(1);
  });

  it("should show the new bit in the chat queue with the learner's question", async () => {
    const queue = await listChatQueueKnowledgeBits(10);

    expect(queue.map((bit) => bit.body)).toContain("Why?");
  });
});

describe("existing chat bit state", () => {
  it("should report an existing bit as inactive once the learner moved it out of chat", async () => {
    await seedSource("ks_b");
    await insertAskAiChatBit("ks_b", "Why?");
    await getDb().update(knowledgeBits).set({ approvalState: "approved" }).where(eq(knowledgeBits.id, "kbask_ks_b"));

    expect((await insertAskAiChatBit("ks_b", "Why?")).active).toBe(false);
  });
});

describe("listHeldAskAiBits", () => {
  it("should list only chat bits that have no messages yet, within the limit", async () => {
    const held = await listHeldAskAiBits(10);
    const ids = held.map((bit) => bit.id);

    expect(ids).toContain("kbask_ks_a");
    expect(ids).not.toContain("kbask_ks_b");
    expect(await listHeldAskAiBits(1)).toHaveLength(1);
  });
});
