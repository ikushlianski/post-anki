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

const dbName = `chat_queue_export_${randomUUID().replace(/-/g, "_")}`;
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

const { loadChatExportData } = await import("./knowledge-bit-chat-queue-export.repo.js");
const { buildChatExportMarkdown } = await import("./knowledge-bit-chat-queue-export.markdown.js");

let client: pg.Client;
let ordinal = 0;

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

async function seedSubject(name: string): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [id, name]);

  return id;
}

async function seedBit(subjectId: string, state: string, body: string, chatAt: Date): Promise<string> {
  ordinal += 1;

  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'Some prose.', 'pending', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, chat_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, sourceId, ordinal, body, state, chatAt],
  );

  return id;
}

async function seedMessage(bitId: string, seq: number, role: string, text: string): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_chat_messages (id, knowledge_bit_id, seq, role, text) VALUES ($1, $2, $3, $4, $5)`,
    [`kbcm_${randomUUID()}`, bitId, seq, role, text],
  );
}

describe("loadChatExportData (real Postgres)", () => {
  it("should export only the subject's Chat cards with their conversation in order", async () => {
    const rust = await seedSubject("Rust");
    const go = await seedSubject("Go");
    const talked = await seedBit(rust, "chat", "Ownership", new Date());

    await seedBit(rust, "chat", "Borrowing", new Date(Date.now() - 1000));
    await seedBit(rust, "pending", "Not in chat", new Date());
    await seedBit(go, "chat", "Goroutines", new Date());
    await seedMessage(talked, 2, "assistant", "Because.");
    await seedMessage(talked, 1, "user", "Why?");

    const data = await loadChatExportData(rust, 200);

    expect(data?.subjectName).toBe("Rust");
    expect(data?.cards.map((card) => card.body)).toEqual(["Ownership", "Borrowing"]);
    expect(data?.cards[0]?.messages).toEqual([
      { role: "user", text: "Why?" },
      { role: "assistant", text: "Because." },
    ]);
    expect(data?.cards[1]?.messages).toEqual([]);

    const md = buildChatExportMarkdown(data?.subjectName ?? "", data?.cards ?? []);

    expect(md).toContain("No conversation yet");
    expect(md).not.toContain("Goroutines");
  });

  it("should cap the export at the requested number of cards", async () => {
    const subject = await seedSubject("Capped");

    for (let i = 0; i < 3; i += 1) {
      await seedBit(subject, "chat", `Card ${i}`, new Date(Date.now() - i * 1000));
    }

    expect((await loadChatExportData(subject, 2))?.cards).toHaveLength(2);
  });

  it("should report an unknown subject as missing", async () => {
    expect(await loadChatExportData("subj_missing", 200)).toBeNull();
  });
});
