import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../assert-local-db-target.js";
import { padEmbedding } from "../pad-embedding.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `embedding_vec_backfill_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: dbUrl.toString() });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL(".", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

const backfillStatements = readFileSync(
  new URL("./0107_add-embedding-vector-columns.sql", import.meta.url),
  "utf8",
)
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter((statement) => statement.startsWith("UPDATE"));

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

describe("embedding_vec backfill from the jsonb embedding columns", () => {
  it("should copy every stored jsonb embedding into the vector column and leave empty or malformed ones null", async () => {
    const stored = padEmbedding([0.25, -0.5, 0.125]);

    await client.query(
      `INSERT INTO facts (id, body, source, source_ref, embedding) VALUES
         ('f_ok', 'ok', 'notion', 'notion:ok', $1),
         ('f_none', 'none', 'notion', 'notion:none', NULL),
         ('f_short', 'short', 'notion', 'notion:short', '[1,2,3]')`,
      [JSON.stringify(stored)],
    );
    await client.query(`INSERT INTO subjects (id, name, kind, embedding) VALUES ('s_ok', 'S', 'architecture-mentor', $1)`, [
      JSON.stringify(stored),
    ]);

    for (const statement of backfillStatements) {
      await client.query(statement);
    }

    const { rows: factRows } = await client.query(
      `SELECT id, embedding_vec::text AS v FROM facts ORDER BY id`,
    );
    const { rows: subjectRows } = await client.query(`SELECT embedding_vec::text AS v FROM subjects WHERE id = 's_ok'`);

    expect(JSON.parse(factRows.find((r) => r.id === "f_ok")!.v)).toEqual(stored);
    expect(factRows.find((r) => r.id === "f_none")!.v).toBeNull();
    expect(factRows.find((r) => r.id === "f_short")!.v).toBeNull();
    expect(JSON.parse(subjectRows[0]!.v)).toEqual(stored);
  });

  it("should leave the jsonb embedding column untouched", async () => {
    const { rows } = await client.query(`SELECT embedding FROM facts WHERE id = 'f_short'`);

    expect(rows[0]!.embedding).toEqual([1, 2, 3]);
  });
});
