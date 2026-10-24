import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { padEmbedding } from "../db/pad-embedding.js";

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

const dbName = `knowledge_bit_embedding_${randomUUID().replace(/-/g, "_")}`;
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

const { listKnowledgeBitsForEmbeddingScan, updateKnowledgeBitEmbedding } = await import(
  "./knowledge-bit-embedding.repo.js"
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

async function seedKnowledgeSource(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [id],
  );

  return id;
}

async function seedKnowledgeBit(
  knowledgeSourceId: string,
  ordinal: number,
  body: string,
  embedding: number[] | null = null,
  embeddingHash: string | null = null,
  embeddedAt: Date | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, embedding, embedding_hash, embedded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      knowledgeSourceId,
      ordinal,
      body,
      embedding ? JSON.stringify(embedding) : null,
      embeddingHash,
      embeddedAt,
    ],
  );

  return id;
}

describe("listKnowledgeBitsForEmbeddingScan (real Postgres)", () => {
  it("returns exactly the bits with embeddedAt IS NULL", async () => {
    const sourceId = await seedKnowledgeSource();
    const unembeddedId = await seedKnowledgeBit(sourceId, 0, "An unembedded bit");

    await seedKnowledgeBit(
      sourceId,
      1,
      "An already-embedded bit",
      [1, 2, 3],
      "some-hash",
      new Date(),
    );

    const rows = await listKnowledgeBitsForEmbeddingScan(100);

    expect(rows).toEqual([
      { id: unembeddedId, body: "An unembedded bit", embeddingHash: null },
    ]);
  });

  it("should exclude a rejected bit and still include a pending bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const pendingId = await seedKnowledgeBit(sourceId, 2, "A pending bit");
    const rejectedId = await seedKnowledgeBit(sourceId, 3, "A rejected bit");

    await client.query(`UPDATE knowledge_bits SET approval_state = 'rejected' WHERE id = $1`, [
      rejectedId,
    ]);

    const rows = await listKnowledgeBitsForEmbeddingScan(100);
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(rejectedId);
  });
});

describe("updateKnowledgeBitEmbedding (real Postgres)", () => {
  it("persists all three columns correctly when read back from the database", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to embed");

    await updateKnowledgeBitEmbedding(id, padEmbedding([0.1, 0.2, 0.3]), "hash_abc", "A bit to embed");

    const { rows } = await client.query(
      `SELECT embedding, embedding_vec::text AS embedding_vec, embedding_hash, embedded_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.embedding).toEqual(padEmbedding([0.1, 0.2, 0.3]));
    expect(JSON.parse(rows[0]!.embedding_vec)).toEqual(padEmbedding([0.1, 0.2, 0.3]));
    expect(rows[0]!.embedding_hash).toBe("hash_abc");
    expect(rows[0]!.embedded_at).toBeInstanceOf(Date);
  });

  it("should leave embeddedAt null when the body was edited after the scan read it", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "The original body");

    await client.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      id,
    ]);

    await updateKnowledgeBitEmbedding(id, padEmbedding([0.1, 0.2, 0.3]), "hash_abc", "The original body");

    const { rows } = await client.query(
      `SELECT embedding, embedding_hash, embedded_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.embedding).toBeNull();
    expect(rows[0]!.embedding_hash).toBeNull();
    expect(rows[0]!.embedded_at).toBeNull();
  });
});
