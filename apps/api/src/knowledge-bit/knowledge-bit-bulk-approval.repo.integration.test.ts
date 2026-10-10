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

const dbName = `knowledge_bit_bulk_approval_${randomUUID().replace(/-/g, "_")}`;
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

const { approveKnowledgeBitsBulk, countPendingKnowledgeBits } = await import(
  "./knowledge-bit-bulk-approval.repo.js"
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

async function seedBit(
  approvalState: "pending" | "approved" | "rejected",
  withVariant: boolean,
  supersededVariant = false,
): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'text', 'pending')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
     VALUES ($1, $2, 0, 'A bit', $3)`,
    [id, sourceId, approvalState],
  );

  if (withVariant) {
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at)
       VALUES ($1, $2, 'wh_question', 0, 'P', 'A', $3)`,
      [`kbqv_${randomUUID()}`, id, supersededVariant ? new Date() : null],
    );
  }

  return id;
}

async function stateOf(id: string): Promise<string> {
  const { rows } = await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [
    id,
  ]);

  return rows[0]!.approval_state as string;
}

describe("approveKnowledgeBitsBulk (real Postgres)", () => {
  it("should approve pending bits that have a live variant", async () => {
    const id = await seedBit("pending", true);

    const result = await approveKnowledgeBitsBulk([id]);

    expect(result).toEqual({ approved: [id], skipped: [] });
    expect(await stateOf(id)).toBe("approved");
  });

  it("should skip a bit with no variant, or only a superseded one, and leave it pending", async () => {
    const bare = await seedBit("pending", false);
    const stale = await seedBit("pending", true, true);

    const result = await approveKnowledgeBitsBulk([bare, stale]);

    expect(result.approved).toEqual([]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { id: bare, reason: "no_variant" },
        { id: stale, reason: "no_variant" },
      ]),
    );
    expect(await stateOf(bare)).toBe("pending");
  });

  it("should skip already-decided bits without flipping them", async () => {
    const rejected = await seedBit("rejected", true);
    const approved = await seedBit("approved", true);

    const result = await approveKnowledgeBitsBulk([rejected, approved]);

    expect(result.approved).toEqual([]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { id: rejected, reason: "already_decided" },
        { id: approved, reason: "already_decided" },
      ]),
    );
    expect(await stateOf(rejected)).toBe("rejected");
  });

  it("should report unknown ids as not_found and approve the rest in the same call", async () => {
    const ok = await seedBit("pending", true);

    const result = await approveKnowledgeBitsBulk([ok, "kb_missing", ok]);

    expect(result).toEqual({
      approved: [ok],
      skipped: [{ id: "kb_missing", reason: "not_found" }],
    });
  });
});

describe("countPendingKnowledgeBits (real Postgres)", () => {
  it("should count only pending bits", async () => {
    const before = await countPendingKnowledgeBits();

    await seedBit("pending", false);
    await seedBit("approved", true);
    await seedBit("rejected", true);

    expect(await countPendingKnowledgeBits()).toBe(before + 1);
  });
});
