import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `card_dedup_${randomUUID().replace(/-/g, "_")}`;
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

const { listBitsAwaitingDedup, recordDuplicateCheck } = await import("./card-dedup.repo.js");
const { listPendingKnowledgeBitsForReview } = await import("../knowledge-bit/knowledge-bit-approval.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ('src_a', 'prose', 'text', 'bits_detected')`,
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES
      ('bit_old', 'src_a', 0, 'Anchoring raises prices', 'approved'),
      ('bit_new', 'src_a', 1, 'Anchoring makes prices go up', 'pending'),
      ('bit_other', 'src_a', 2, 'Unrelated card', 'pending')`,
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES
      ('v_old', 'bit_old', 'basic', 0, 'What does anchoring do?', 'Raises perceived prices')`,
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

describe("card dedup repo", () => {
  it("should only list pending cards that have not been checked yet", async () => {
    const bits = await listBitsAwaitingDedup(10);

    expect(bits.map((bit) => bit.id)).toEqual(["bit_new", "bit_other"]);
  });

  it("should expose the closest existing card on the pending review list and stop re-checking", async () => {
    await recordDuplicateCheck("bit_new", {
      bitId: "bit_old",
      similarity: 0.93,
      reason: "Same principle, nothing added.",
      similarBitIds: ["bit_old"],
    });
    await recordDuplicateCheck("bit_other", null);

    const pending = await listPendingKnowledgeBitsForReview(50);
    const bits = pending.flatMap((source) => source.bits);

    expect(bits.find((bit) => bit.id === "bit_new")?.duplicateOf).toEqual({
      bitId: "bit_old",
      front: "What does anchoring do?",
      back: "Raises perceived prices",
      similarity: expect.closeTo(0.93, 5),
      reason: "Same principle, nothing added.",
      similarBitIds: ["bit_old"],
    });
    expect(bits.find((bit) => bit.id === "bit_other")?.duplicateOf).toBeNull();
    expect(await listBitsAwaitingDedup(10)).toEqual([]);
  });

  it("should never flag a card the owner already decided", async () => {
    await client.query(`UPDATE knowledge_bits SET approval_state = 'rejected' WHERE id = 'bit_other'`);
    await recordDuplicateCheck("bit_other", { bitId: "bit_old", similarity: 0.99, reason: null, similarBitIds: ["bit_old"] });

    const { rows } = await client.query(`SELECT duplicate_of_bit_id FROM knowledge_bits WHERE id = 'bit_other'`);

    expect(rows[0].duplicate_of_bit_id).toBeNull();
  });
});
