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

const dbName = `unseen_${randomUUID().replace(/-/g, "_")}`;
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

const { countUnseenApprovedKnowledgeBits } = await import("./knowledge-bit-unseen-total.repo.js");

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

async function seedBit(opts: {
  state: string;
  variant?: "active" | "superseded" | "none";
  reviewCount?: number;
  review?: boolean;
}): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kbit_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'text', 'done')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'b', $3)`,
    [bitId, sourceId, opts.state],
  );

  const variant = opts.variant ?? "active";

  if (variant !== "none") {
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at) VALUES ($1, $2, 'wh_question', 0, 'p', 'a', ${variant === "superseded" ? "now()" : "null"})`,
      [`kvar_${randomUUID()}`, bitId],
    );
  }

  if (opts.reviewCount !== undefined) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, review_count) VALUES ($1, $2)`,
      [bitId, opts.reviewCount],
    );
  }

  if (opts.review) {
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new) VALUES ($1, $2, 'v', 'good', true)`,
      [`krev_${randomUUID()}`, bitId],
    );
  }

  return bitId;
}

describe("countUnseenApprovedKnowledgeBits", () => {
  it("should count only approved, live, never-studied cards toward the import backlog", async () => {
    const before = await countUnseenApprovedKnowledgeBits();

    await seedBit({ state: "approved" });
    await seedBit({ state: "approved", reviewCount: 0 });
    await seedBit({ state: "pending" });
    await seedBit({ state: "approved", variant: "none" });
    await seedBit({ state: "approved", variant: "superseded" });
    await seedBit({ state: "approved", reviewCount: 3 });
    await seedBit({ state: "approved", review: true });

    expect(await countUnseenApprovedKnowledgeBits()).toBe(before + 2);
  });
});
