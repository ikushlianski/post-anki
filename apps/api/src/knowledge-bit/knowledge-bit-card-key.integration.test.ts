import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { cardKeyFor, knowledgeBitQuestionVariantKindSchema } from "@post-anki/shared";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { cardKeySql } from "./knowledge-bit-card-key.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `kb_card_key_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const pool = new pg.Pool({ connectionString: url.toString() });
const db = drizzle(pool);
await migrate(db, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});

afterAll(async () => {
  await pool.end();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

describe("card key SQL fragment (real Postgres)", () => {
  it("should produce the same card key as the shared helper for every kind and slot", async () => {
    for (const kind of knowledgeBitQuestionVariantKindSchema.options) {
      for (let order = 0; order <= 20; order += 1) {
        const result = await db.execute<{ key: string }>(
          sql`select ${cardKeySql(sql`${kind}::text`, sql`${order}::int`)} as key`,
        );

        expect(result.rows[0]?.key).toBe(cardKeyFor({ kind, order }));
      }
    }
  });
});
