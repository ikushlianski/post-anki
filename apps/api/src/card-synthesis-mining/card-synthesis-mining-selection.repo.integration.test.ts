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

const dbName = `card_synthesis_mining_sel_${randomUUID().replace(/-/g, "_")}`;
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

const { miningSelectionStore } = await import("./card-synthesis-mining-selection.repo.js");
const { markBitsExamined } = await import("./card-synthesis-mining-ledger.repo.js");

let client: pg.Client;

function vectorLiteral(first: number): string {
  const values = new Array<number>(1536).fill(0);

  values[0] = first;
  values[1] = 1;

  return `[${values.join(",")}]`;
}

async function insertBit(id: string, sourceId: string, ordinal: number, createdAt: string, embedded: boolean) {
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, created_at, embedding_vec)
     VALUES ($1, $2, $6, $3, 'approved', $4, $5::halfvec)`,
    [id, sourceId, `body ${id}`, createdAt, embedded ? vectorLiteral(0.5) : null, ordinal],
  );
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query("INSERT INTO subjects (id, name) VALUES ('root', 'Root'), ('child', 'Child')");
  await client.query("UPDATE subjects SET parent_id = 'root' WHERE id = 'child'");
  await client.query(
    "INSERT INTO knowledge_sources (id, kind, subject_id) VALUES ('srcRoot', 'manual', 'root'), ('srcChild', 'manual', 'child')",
  );
  await insertBit("b1", "srcRoot", 0, "2026-01-01T00:00:00Z", true);
  await insertBit("b2", "srcChild", 0, "2026-01-02T00:00:00Z", true);
  await insertBit("b3", "srcChild", 1, "2026-01-03T00:00:00Z", true);
  await insertBit("b4", "srcChild", 2, "2026-01-04T00:00:00Z", false);
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

describe("miningSelectionStore.listUnexaminedEmbeddedBits", () => {
  it("should return embedded approved cards of the subtree oldest first and skip unembedded ones", async () => {
    const bits = await miningSelectionStore.listUnexaminedEmbeddedBits(["root", "child"], 10);

    expect(bits.map((bit) => bit.id)).toEqual(["b1", "b2", "b3"]);
    expect(bits[0]?.embedding).toHaveLength(1536);
  });

  it("should respect the limit and leave out cards already examined", async () => {
    await markBitsExamined(["b1"], "run1", null, "singleton");

    const bits = await miningSelectionStore.listUnexaminedEmbeddedBits(["root", "child"], 1);

    expect(bits.map((bit) => bit.id)).toEqual(["b2"]);
  });

  it("should restrict to the given subjects", async () => {
    const bits = await miningSelectionStore.listUnexaminedEmbeddedBits(["root"], 10);

    expect(bits).toEqual([]);
  });
});

describe("miningSelectionStore.listSubjects", () => {
  it("should expose the parent links used to build a subtree", async () => {
    const nodes = await miningSelectionStore.listSubjects();

    expect(nodes).toContainEqual({ id: "child", parentId: "root" });
  });
});
