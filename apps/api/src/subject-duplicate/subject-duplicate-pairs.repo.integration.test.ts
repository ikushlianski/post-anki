import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { findDuplicatePairs } from "@post-anki/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { padEmbedding } from "../db/pad-embedding.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subject_pairs_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: dbUrl.toString() });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = dbUrl.toString();
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { findSimilarSubjectPairs } = await import("./subject-duplicate-pairs.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

describe("findSimilarSubjectPairs", () => {
  it("should surface the same pairs, canonical order and similarities as the old in-memory comparison", async () => {
    const fixed = [
      { id: "sub_b", kind: "architecture-mentor", embedding: [1, 0.001, 0] },
      { id: "sub_a", kind: "architecture-mentor", embedding: [0.9995, 0.002, 0] },
      { id: "sub_c", kind: "architecture-mentor", embedding: [0, 1, 0] },
      { id: "sub_d", kind: "architecture-mentor", embedding: [0, 0.98, 0.1] },
      { id: "sub_lang", kind: "language-practice", embedding: [1, 0.001, 0] },
      { id: "sub_unembedded", kind: "architecture-mentor", embedding: null },
    ];

    for (const row of fixed) {
      const value = row.embedding ? JSON.stringify(padEmbedding(row.embedding)) : null;

      await client.query(
        `INSERT INTO subjects (id, name, kind, embedding, embedding_vec) VALUES ($1, $1, $2, $3, $4)`,
        [row.id, row.kind, value, value],
      );
    }

    const expected = findDuplicatePairs(
      fixed
        .filter((row) => row.kind === "architecture-mentor" && row.embedding)
        .map((row) => ({ id: row.id, embedding: padEmbedding(row.embedding!) })),
    );
    const actual = await findSimilarSubjectPairs(0.86);
    const byKey = (p: { subjectAId: string; subjectBId: string }) => `${p.subjectAId}|${p.subjectBId}`;

    expect(actual.map(byKey).sort()).toEqual(expected.map(byKey).sort());
    expect(actual.map(byKey)).toContain("sub_a|sub_b");
    expect(actual.map(byKey)).toContain("sub_c|sub_d");
    expect(actual.length).toBe(2);

    for (const pair of actual) {
      const match = expected.find((e) => byKey(e) === byKey(pair))!;

      expect(pair.similarity).toBeCloseTo(match.similarity, 5);
    }
  });
});
