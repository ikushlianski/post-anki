import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { cosineSimilarity } from "@post-anki/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { padEmbedding } from "../db/pad-embedding.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `source_pairs_${randomUUID().replace(/-/g, "_")}`;
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

const { findSimilarSourcePairs } = await import("./source-duplicate-pairs.repo.js");

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

describe("findSimilarSourcePairs", () => {
  it("should surface near-duplicate non-video sources as one canonically ordered pair with its cosine similarity", async () => {
    const fixed = [
      { id: "src_b", kind: "link", embedding: [1, 0.001, 0] },
      { id: "src_a", kind: "text", embedding: [0.9995, 0.002, 0] },
      { id: "src_c", kind: "link", embedding: [0, 1, 0] },
      { id: "src_video", kind: "video", embedding: [1, 0.001, 0] },
      { id: "src_unembedded", kind: "link", embedding: null },
    ];

    for (const row of fixed) {
      const value = row.embedding ? JSON.stringify(padEmbedding(row.embedding)) : null;

      await client.query(
        `INSERT INTO sources (id, curriculum_id, kind, value, embedding_vec)
         VALUES ($1, 'curr_1', $2, $1, $3)`,
        [row.id, row.kind, value],
      );
    }

    const actual = await findSimilarSourcePairs(0.86);

    expect(actual).toHaveLength(1);
    expect(actual[0]!.sourceAId).toBe("src_a");
    expect(actual[0]!.sourceBId).toBe("src_b");
    expect(actual[0]!.similarity).toBeCloseTo(
      cosineSimilarity(padEmbedding([0.9995, 0.002, 0]), padEmbedding([1, 0.001, 0])),
      5,
    );
  });
});
