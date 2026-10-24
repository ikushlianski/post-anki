import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TAG_TAXONOMY_CAP } from "@post-anki/core";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// prose-knowledge-fisher--tag-taxonomy-cap — the real-DB proof that
// resolveTagUnderCapGuard's whole-table advisory lock (withNamedLock,
// "tag_taxonomy_cap") actually serializes a check-then-insert race at the
// cap boundary, mirroring gap-mastery-concurrency.integration.test.ts's
// harness shape exactly: real Postgres, a dedicated throwaway database,
// assertLocalDbTarget guard.

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

const dbName = `tag_cap_conc_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { listTags } = await import("./tag.repo.js");
const { resolveTagUnderCapGuard } = await import("./tag-cap-guard.repo.js");
const { newId } = await import("../shared/id.js");
const { getDb } = await import("../db/client.js");
const { tags } = await import("../db/schema.js");

async function seedTagsToOneBelowCap(): Promise<void> {
  const db = getDb();
  const rows = Array.from({ length: TAG_TAXONOMY_CAP - 1 }, (_, i) => ({
    id: newId("tag"),
    name: `seed-tag-${i}`,
    normalizedName: `seed-tag-${i}`,
  }));

  await db.insert(tags).values(rows);
}

describe("resolveTagUnderCapGuard concurrency", () => {
  beforeAll(async () => {
    await seedTagsToOneBelowCap();
  });

  afterAll(async () => {
    await closeDb();
    const cleanupPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

    await cleanupPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await cleanupPool.end();
  });

  it("never lets two concurrent calls at cap-1 both create a new tag past the cap", async () => {
    const forcedMatcher = async (
      _candidateName: string,
      _context: string | undefined,
      existingTagNames: string[],
    ) => ({ matchedTagName: existingTagNames.at(-1) ?? null });

    const [resultA, resultB] = await Promise.all([
      resolveTagUnderCapGuard("brand new concept a", null, forcedMatcher),
      resolveTagUnderCapGuard("brand new concept b", null, forcedMatcher),
    ]);

    expect(resultA).toBeDefined();
    expect(resultB).toBeDefined();

    const finalTags = await listTags();

    expect(finalTags.length).toBeLessThanOrEqual(TAG_TAXONOMY_CAP);
  });

  it("never creates a new tag from a matched name that isn't a real member once at the cap", async () => {
    const before = await listTags();

    expect(before.length).toBe(TAG_TAXONOMY_CAP);

    const forcedMatcher = async (
      _candidateName: string,
      _context: string | undefined,
      existingTagNames: string[],
    ) => ({ matchedTagName: existingTagNames.at(-1) ?? null });

    const result = await resolveTagUnderCapGuard(
      "yet another new concept",
      "a hallucinated name that does not exist",
      forcedMatcher,
    );

    const after = await listTags();

    expect(after.length).toBe(TAG_TAXONOMY_CAP);
    expect(after.some((tag) => tag.id === result.id)).toBe(true);
    expect(result.name).not.toBe("a hallucinated name that does not exist");
  });

  it("picks the forced matcher's real answer, not the alphabetically-first tag, once at the cap", async () => {
    const before = await listTags();

    expect(before.length).toBe(TAG_TAXONOMY_CAP);

    const alphabeticallyFirst = before[0]!;
    const target = before.find((tag) => tag.name !== alphabeticallyFirst.name)!;

    expect(target).toBeDefined();

    const forcedMatcher = async () => ({ matchedTagName: target.name });

    const result = await resolveTagUnderCapGuard(
      "another brand new concept",
      null,
      forcedMatcher,
    );

    expect(result.id).toBe(target.id);
    expect(result.name).not.toBe(alphabeticallyFirst.name);
  });

  it("falls through to the same last-resort tag when the forced matcher throws, once at the cap", async () => {
    const before = await listTags();

    expect(before.length).toBe(TAG_TAXONOMY_CAP);

    const throwingMatcher = async () => {
      throw new Error("simulated LLM failure");
    };

    const result = await resolveTagUnderCapGuard(
      "yet another concept forcing a throw",
      null,
      throwingMatcher,
    );

    const after = await listTags();

    expect(after.length).toBe(TAG_TAXONOMY_CAP);
    expect(result.id).toBe(before[0]!.id);
  });
});
