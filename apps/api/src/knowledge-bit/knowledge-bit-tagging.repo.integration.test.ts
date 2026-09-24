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

const dbName = `knowledge_bit_tagging_${randomUUID().replace(/-/g, "_")}`;
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

const { listKnowledgeBitsForTaggingScan, markKnowledgeBitTagged } = await import(
  "./knowledge-bit-tagging.repo.js"
);
const { assignTag, resolveOrCreateTag } = await import("../tag/tag.repo.js");

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
  taggedAt: Date | null = null,
  tagFailedAt: Date | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, tagged_at, tag_failed_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, knowledgeSourceId, ordinal, body, taggedAt, tagFailedAt],
  );

  return id;
}

describe("listKnowledgeBitsForTaggingScan (real Postgres)", () => {
  it("returns exactly the bits with taggedAt IS NULL AND tagFailedAt IS NULL", async () => {
    const sourceId = await seedKnowledgeSource();
    const untouchedId = await seedKnowledgeBit(sourceId, 0, "An untagged bit");

    await seedKnowledgeBit(sourceId, 1, "An already-tagged bit", new Date(), null);
    await seedKnowledgeBit(sourceId, 2, "A permanently-failed bit", null, new Date());

    const rows = await listKnowledgeBitsForTaggingScan(100);

    expect(rows).toEqual([{ id: untouchedId, body: "An untagged bit" }]);
  });
});

describe("markKnowledgeBitTagged + assignTag (real Postgres)", () => {
  it("persists taggedAt on read-back after marking a bit tagged", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to tag");

    await markKnowledgeBitTagged(id);

    const { rows } = await client.query(
      `SELECT tagged_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.tagged_at).toBeInstanceOf(Date);
  });

  it("writes a real tag_assignments row when assignTag is called directly, reusing an existing tag by name and no-oping a duplicate assignment", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 1, "A bit to assign a tag to");

    const created = await resolveOrCreateTag("integration-test-tag");
    const reused = await resolveOrCreateTag("integration-test-tag");

    expect(reused.id).toBe(created.id);

    await assignTag(created.id, "knowledgeBit", bitId);
    await assignTag(created.id, "knowledgeBit", bitId);

    const { rows } = await client.query(
      `SELECT tag_id, node_type, node_id FROM tag_assignments WHERE tag_id = $1 AND node_id = $2`,
      [created.id, bitId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.node_type).toBe("knowledgeBit");
    expect(rows[0]!.node_id).toBe(bitId);
  });
});
