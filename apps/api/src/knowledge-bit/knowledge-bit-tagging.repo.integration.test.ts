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

const {
  listKnowledgeBitsForTaggingScan,
  markKnowledgeBitTagged,
  markKnowledgeBitTagFailed,
  assignTagsAndMarkTagged,
} = await import("./knowledge-bit-tagging.repo.js");
const { assignTag, assignAutoTag, resolveOrCreateTag } = await import("../tag/tag.repo.js");

let client: pg.Client;
let pauseClient: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  pauseClient = new pg.Client({ connectionString: DATABASE_URL });
  await pauseClient.connect();
}, 30_000);

afterAll(async () => {
  await pauseClient?.end();
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

  it("should exclude a rejected bit and still include a pending bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const pendingId = await seedKnowledgeBit(sourceId, 3, "A pending bit");
    const rejectedId = await seedKnowledgeBit(sourceId, 4, "A rejected bit");

    await client.query(`UPDATE knowledge_bits SET approval_state = 'rejected' WHERE id = $1`, [
      rejectedId,
    ]);

    const rows = await listKnowledgeBitsForTaggingScan(100);
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(rejectedId);
  });
});

describe("markKnowledgeBitTagged + assignTag (real Postgres)", () => {
  it("persists taggedAt on read-back after marking a bit tagged", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to tag");

    await markKnowledgeBitTagged(id, "A bit to tag");

    const { rows } = await client.query(
      `SELECT tagged_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.tagged_at).toBeInstanceOf(Date);
  });

  it("should leave taggedAt null when the body was edited after the scan read it", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "The original body");

    await client.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      id,
    ]);

    await markKnowledgeBitTagged(id, "The original body");

    const { rows } = await client.query(`SELECT tagged_at FROM knowledge_bits WHERE id = $1`, [
      id,
    ]);

    expect(rows[0]!.tagged_at).toBeNull();
  });

  it("should leave tagFailedAt null when the body was edited after the scan read it", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "The original body");

    await client.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      id,
    ]);

    await markKnowledgeBitTagFailed(id, "The original body");

    const { rows } = await client.query(
      `SELECT tag_failed_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.tag_failed_at).toBeNull();
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

describe("assignAutoTag (real Postgres)", () => {
  it("inserts a fresh row with source 'auto' when no prior assignment exists", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 2, "A bit to auto-tag");
    const tag = await resolveOrCreateTag("auto-insert-tag");

    await assignAutoTag(tag.id, "knowledgeBit", bitId);

    const { rows } = await client.query(
      `SELECT source FROM tag_assignments WHERE tag_id = $1 AND node_id = $2`,
      [tag.id, bitId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("auto");
  });

  it("never downgrades an existing manual row back to auto", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 3, "A bit with a manual tag");
    const tag = await resolveOrCreateTag("no-downgrade-tag");

    await assignTag(tag.id, "knowledgeBit", bitId);
    await assignAutoTag(tag.id, "knowledgeBit", bitId);

    const { rows } = await client.query(
      `SELECT source FROM tag_assignments WHERE tag_id = $1 AND node_id = $2`,
      [tag.id, bitId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe("manual");
  });
});

// Blocks until assignTagsAndMarkTagged's `SELECT ... FOR UPDATE` is genuinely
// parked behind pauseClient's held lock — polling the server's own wait
// state rather than sleeping a guessed interval, so the race window is
// proven open before the concurrent edit is committed into it.
async function waitForBlockedTaggingSelect(): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND query ILIKE '%from "knowledge_bits"%for update%'`,
    );

    if ((rows[0]!.n as number) > 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("assignTagsAndMarkTagged never blocked on its row lock — race window never opened");
}

describe("assignTagsAndMarkTagged (real Postgres)", () => {
  it("inserts every tag assignment and marks the bit tagged when the body still matches", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to tag transactionally");
    const tagA = await resolveOrCreateTag("txn-tag-a");
    const tagB = await resolveOrCreateTag("txn-tag-b");

    const result = await assignTagsAndMarkTagged(
      bitId,
      [tagA.id, tagB.id],
      "A bit to tag transactionally",
    );

    expect(result).toBe(true);

    const { rows: assignmentRows } = await client.query(
      `SELECT tag_id FROM tag_assignments WHERE node_id = $1 ORDER BY tag_id`,
      [bitId],
    );

    expect(assignmentRows.map((r) => r.tag_id).sort()).toEqual([tagA.id, tagB.id].sort());

    const { rows: bitRows } = await client.query(
      `SELECT tagged_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(bitRows[0]!.tagged_at).toBeInstanceOf(Date);
  });

  it("inserts no tag_assignments and leaves taggedAt null when the body already changed before the call", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "The original body");
    const tag = await resolveOrCreateTag("stale-body-tag");

    await client.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      bitId,
    ]);

    const result = await assignTagsAndMarkTagged(bitId, [tag.id], "The original body");

    expect(result).toBe(false);

    const { rows: assignmentRows } = await client.query(
      `SELECT tag_id FROM tag_assignments WHERE node_id = $1`,
      [bitId],
    );

    expect(assignmentRows).toHaveLength(0);

    const { rows: bitRows } = await client.query(
      `SELECT tagged_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(bitRows[0]!.tagged_at).toBeNull();
  });

  it("inserts no tag_assignments when a concurrent body edit commits while this call is waiting on the row lock", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "The body read by the scan");
    const tag = await resolveOrCreateTag("race-tag");

    await pauseClient.query("BEGIN");
    await pauseClient.query(`SELECT id FROM knowledge_bits WHERE id = $1 FOR UPDATE`, [bitId]);

    const assignPromise = assignTagsAndMarkTagged(bitId, [tag.id], "The body read by the scan");

    await waitForBlockedTaggingSelect();

    // Simulates updateKnowledgeBitBody's own sequence: the bit's body is
    // updated, then its existing tag_assignments are deleted, all before the
    // row lock is released.
    await pauseClient.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      bitId,
    ]);
    await pauseClient.query(`DELETE FROM tag_assignments WHERE node_id = $1`, [bitId]);
    await pauseClient.query("COMMIT");

    const result = await assignPromise;

    expect(result).toBe(false);

    const { rows: assignmentRows } = await client.query(
      `SELECT tag_id FROM tag_assignments WHERE node_id = $1`,
      [bitId],
    );

    expect(assignmentRows).toHaveLength(0);

    const { rows: bitRows } = await client.query(
      `SELECT tagged_at, body FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(bitRows[0]!.tagged_at).toBeNull();
    expect(bitRows[0]!.body).toBe("The edited body");
  }, 20_000);
});
