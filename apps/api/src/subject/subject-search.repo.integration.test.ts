import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// Real Postgres, never mocked. DATABASE_URL has no fallback: the search must run
// against a database the developer names explicitly, and the target is asserted
// local-only before anything connects.
const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

// A freshly-migrated throwaway database, so fixture rows never linger in the
// database DATABASE_URL names.
const dbName = `subj_search_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { searchSubjectsByText, SUBJECT_SEARCH_LIMIT } = await import("./subject.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

beforeEach(async () => {
  await client.query("TRUNCATE subjects CASCADE");
});

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

async function insertSubject(name: string, description: string | null = null): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, description, require_sources, kind) VALUES ($1, $2, $3, false, 'architecture-mentor')`,
    [`sub_${randomUUID()}`, name, description],
  );
}

describe("searchSubjectsByText", () => {
  it("should match name and description regardless of letter case", async () => {
    await insertSubject("Linear Algebra", "Vectors and matrices");
    await insertSubject("Quantum Physics", "Wave functions");

    const byName = await searchSubjectsByText("LINEAR");
    const byDescription = await searchSubjectsByText("vectors");

    expect(byName.map((s) => s.name)).toEqual(["Linear Algebra"]);
    expect(byDescription.map((s) => s.name)).toEqual(["Linear Algebra"]);
  });

  it("should treat percent and underscore in the query as literal characters", async () => {
    await insertSubject("Discount 100% Off");
    await insertSubject("Discount 100 Off");
    await insertSubject("snake_case basics");
    await insertSubject("snakeXcase basics");

    const percent = await searchSubjectsByText("100%");
    const underscore = await searchSubjectsByText("snake_case");
    const lonePercent = await searchSubjectsByText("%");

    expect(percent.map((s) => s.name)).toEqual(["Discount 100% Off"]);
    expect(underscore.map((s) => s.name)).toEqual(["snake_case basics"]);
    expect(lonePercent.map((s) => s.name)).toEqual(["Discount 100% Off"]);
  });

  it("should order exact name matches first, then name prefixes, then other matches", async () => {
    await insertSubject("Applied Math");
    await insertSubject("Mathematics");
    await insertSubject("Math");
    await insertSubject("Mathematica Lab");
    await insertSubject("Calculus", "A math-heavy course");

    const results = await searchSubjectsByText("math");

    expect(results.map((s) => s.name)).toEqual([
      "Math",
      "Mathematica Lab",
      "Mathematics",
      "Applied Math",
      "Calculus",
    ]);
  });

  it("should return at most the search limit of subjects", async () => {
    for (let i = 0; i < SUBJECT_SEARCH_LIMIT + 10; i += 1) {
      await insertSubject(`Algebra ${String(i).padStart(3, "0")}`);
    }

    const results = await searchSubjectsByText("algebra");

    expect(SUBJECT_SEARCH_LIMIT).toBe(50);
    expect(results).toHaveLength(SUBJECT_SEARCH_LIMIT);
  });

  it("should return no subjects when nothing matches the query", async () => {
    await insertSubject("Linear Algebra");

    expect(await searchSubjectsByText("zoology")).toEqual([]);
  });
});
