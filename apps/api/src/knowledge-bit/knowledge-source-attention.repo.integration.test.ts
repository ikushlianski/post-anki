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

const dbName = `knowledge_source_attention_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();

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

const { listSourcesNeedingAttention, countSourcesNeedingAttention } = await import(
  "./knowledge-source-attention.repo.js"
);

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

const NOW = new Date("2026-06-01T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

async function seedSource(options: {
  status: string;
  updatedAt?: Date;
  failureReason?: string | null;
  processedAt?: Date | null;
  bitStates?: string[];
  rawText?: string;
}): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason, updated_at, processed_at)
     VALUES ($1, 'prose', $2, $3, $4, $5, $6)`,
    [
      id,
      options.rawText ?? "A note about something",
      options.status,
      options.failureReason ?? null,
      options.updatedAt ?? minutesAgo(1),
      options.processedAt ?? null,
    ],
  );

  for (const [index, state] of (options.bitStates ?? []).entries()) {
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
       VALUES ($1, $2, $3, 'A bit', $4)`,
      [`kb_${randomUUID()}`, id, index, state],
    );
  }

  return id;
}

async function attentionById(): Promise<Map<string, { kind: string; reason: string | null }>> {
  const entries = await listSourcesNeedingAttention(200, NOW);

  return new Map(entries.map((entry) => [entry.knowledgeSourceId, entry]));
}

describe("listSourcesNeedingAttention", () => {
  it("should list a failed note with its stored reason and text", async () => {
    const id = await seedSource({ status: "failed", failureReason: "no_valid_items", rawText: "First note text" });
    const entry = (await listSourcesNeedingAttention(200, NOW)).find((e) => e.knowledgeSourceId === id);

    expect(entry).toMatchObject({ kind: "failed", reason: "no_valid_items", firstWords: "First note text", sourceText: "First note text" });
  });

  it("should list a note that finished with only superseded cards as an empty result", async () => {
    const id = await seedSource({ status: "bits_detected", bitStates: ["superseded"] });

    expect((await attentionById()).get(id)?.kind).toBe("empty_result");
  });

  it("should stay quiet for a finished note whose cards were all approved or rejected by the user", async () => {
    const approved = await seedSource({ status: "bits_detected", bitStates: ["approved", "rejected"] });
    const done = await seedSource({ status: "bits_detected", processedAt: NOW });
    const map = await attentionById();

    expect(map.has(approved)).toBe(false);
    expect(map.has(done)).toBe(false);
  });

  it("should not alarm for a note that has been processing for under 20 minutes", async () => {
    const id = await seedSource({ status: "processing", updatedAt: minutesAgo(5) });

    expect((await attentionById()).has(id)).toBe(false);
  });

  it("should flag a note processing for over 20 minutes as stuck", async () => {
    const id = await seedSource({ status: "processing", updatedAt: minutesAgo(25) });

    expect((await attentionById()).get(id)?.kind).toBe("stuck");
  });

  it("should show a rate limited wait as information", async () => {
    const id = await seedSource({ status: "processing", failureReason: "provider_rate_limited", updatedAt: minutesAgo(2) });

    expect((await attentionById()).get(id)?.kind).toBe("rate_limited");
  });

  it("should keep a note listed after a second failure with its new time and one entry only", async () => {
    const id = await seedSource({ status: "failed", failureReason: "no_valid_items", updatedAt: minutesAgo(30) });

    await client.query(`UPDATE knowledge_sources SET updated_at = $2 WHERE id = $1`, [id, minutesAgo(1)]);

    const entries = (await listSourcesNeedingAttention(200, NOW)).filter((e) => e.knowledgeSourceId === id);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.since).toBe(minutesAgo(1).toISOString());
  });

  it("should count every note needing attention", async () => {
    const before = await countSourcesNeedingAttention(NOW);

    await seedSource({ status: "failed", failureReason: "source_too_long" });

    expect(await countSourcesNeedingAttention(NOW)).toBe(before + 1);
  });
});
