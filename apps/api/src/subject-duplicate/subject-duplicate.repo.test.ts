import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIOS 4, 5, 5b, 8b (.planning/ai-duplicate-detection/scenarios.md) —
// subject-duplicate.repo.ts's insertDuplicateSuggestionIfNew /
// resolveSubjectDuplicateSuggestion, plus the subject.repo.ts stale-
// invalidation this feature adds to mergeSubjects/deleteSubject. Same
// fresh-migrated-throwaway-Postgres technique as decide.repo.test.ts — real
// inserts, because the DB-level partial unique index (SCENARIO 8b) and the
// cross-table transaction behavior (SCENARIO 4, 5b) can only be proven
// against a real Postgres connection, not a mocked repo shape.
//
// Kept at this exact path (not *.integration.test.ts) because spec.md's
// Backend DoD pins the precise command
// `npx vitest run apps/api/src/subject-duplicate/subject-duplicate.repo.test.ts`;
// vitest.config.ts's exclude list carries this filename as a named
// exception.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subject_duplicate_repo_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const migratePool = new pg.Pool({ connectionString: testDatabaseUrl });
  const migrateDb = drizzle(migratePool);

  await migrate(migrateDb, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await migratePool.end();

  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.OPENROUTER_API_KEY = "e2e-dummy-key";
}, 60_000);

afterAll(async () => {
  const { closeDb } = await import("../db/client.js");
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 30_000);

async function seedSubject(name: string): Promise<string> {
  const { createSubject } = await import("../subject/subject.repo.js");
  const subject = await createSubject({ name, kind: "architecture-mentor" });

  return subject.id;
}

describe("insertDuplicateSuggestionIfNew — SCENARIO 8b (DB partial unique index closes the race)", () => {
  it("treats a second insert for an already-pending pair as a no-op", async () => {
    const { insertDuplicateSuggestionIfNew } = await import("./subject-duplicate.repo.js");

    const subjectAId = await seedSubject("Webdev");
    const subjectBId = await seedSubject("Programming — Web Development");

    const first = await insertDuplicateSuggestionIfNew({
      subjectXId: subjectAId,
      subjectYId: subjectBId,
      similarity: 0.93,
      reason: "similarity 0.93 between name+description embeddings",
    });

    expect(first).not.toBeNull();
    expect(first!.status).toBe("pending");

    const second = await insertDuplicateSuggestionIfNew({
      subjectXId: subjectAId,
      subjectYId: subjectBId,
      similarity: 0.94,
      reason: "second attempt, same pair",
    });

    expect(second).toBeNull();

    const { listSubjectDuplicateSuggestions } = await import("./subject-duplicate.repo.js");
    const pending = await listSubjectDuplicateSuggestions("pending");
    const matches = pending.filter(
      (s) =>
        (s.subjectAId === subjectAId && s.subjectBId === subjectBId) ||
        (s.subjectAId === subjectBId && s.subjectBId === subjectAId),
    );

    expect(matches).toHaveLength(1);
  });

  it("stores the pair in canonical lexicographic order regardless of call order", async () => {
    const { insertDuplicateSuggestionIfNew } = await import("./subject-duplicate.repo.js");

    const idOne = await seedSubject("Zzz Subject");
    const idTwo = await seedSubject("Aaa Subject");
    const [expectedA, expectedB] = [idOne, idTwo].sort();

    const inserted = await insertDuplicateSuggestionIfNew({
      subjectXId: idOne,
      subjectYId: idTwo,
      similarity: 0.9,
      reason: "canonical order test",
    });

    expect(inserted).not.toBeNull();
    expect(inserted!.subjectAId).toBe(expectedA);
    expect(inserted!.subjectBId).toBe(expectedB);
  });
});

describe("resolveSubjectDuplicateSuggestion — accept (SCENARIO 4)", () => {
  it("marks the accepted row 'accepted' and every other pending row referencing the merged-away subject 'stale', atomically", async () => {
    const { insertDuplicateSuggestionIfNew, resolveSubjectDuplicateSuggestion, getSubjectDuplicateSuggestion } =
      await import("./subject-duplicate.repo.js");

    const targetId = await seedSubject("Keep This One");
    const sourceId = await seedSubject("Absorbed Subject");
    const unrelatedId = await seedSubject("Unrelated Subject");

    const suggestion = await insertDuplicateSuggestionIfNew({
      subjectXId: targetId,
      subjectYId: sourceId,
      similarity: 0.95,
      reason: "accept test",
    });

    const otherPendingOnSource = await insertDuplicateSuggestionIfNew({
      subjectXId: sourceId,
      subjectYId: unrelatedId,
      similarity: 0.88,
      reason: "should go stale when source is merged away",
    });

    expect(suggestion).not.toBeNull();
    expect(otherPendingOnSource).not.toBeNull();

    const result = await resolveSubjectDuplicateSuggestion(suggestion!.id, {
      status: "accepted",
      targetSubjectId: targetId,
    });

    expect("error" in result).toBe(false);

    const acceptedRow = await getSubjectDuplicateSuggestion(suggestion!.id);
    expect(acceptedRow!.status).toBe("accepted");
    expect(acceptedRow!.resolvedAt).not.toBeNull();

    const staleRow = await getSubjectDuplicateSuggestion(otherPendingOnSource!.id);
    expect(staleRow!.status).toBe("stale");
    expect(staleRow!.resolvedAt).not.toBeNull();
  });

  it("rejects a targetSubjectId that isn't one of the suggestion's own pair", async () => {
    const { insertDuplicateSuggestionIfNew, resolveSubjectDuplicateSuggestion } = await import(
      "./subject-duplicate.repo.js"
    );

    const subjectAId = await seedSubject("Pair Member A");
    const subjectBId = await seedSubject("Pair Member B");
    const unrelatedId = await seedSubject("Not In This Pair");

    const suggestion = await insertDuplicateSuggestionIfNew({
      subjectXId: subjectAId,
      subjectYId: subjectBId,
      similarity: 0.9,
      reason: "invalid target test",
    });

    const result = await resolveSubjectDuplicateSuggestion(suggestion!.id, {
      status: "accepted",
      targetSubjectId: unrelatedId,
    });

    expect(result).toEqual({ error: "invalid_target" });
  });
});

describe("resolveSubjectDuplicateSuggestion — reject (SCENARIO 5)", () => {
  it("marks the row rejected without touching either subject", async () => {
    const { insertDuplicateSuggestionIfNew, resolveSubjectDuplicateSuggestion } = await import(
      "./subject-duplicate.repo.js"
    );
    const { getSubject } = await import("../subject/subject.repo.js");

    const subjectAId = await seedSubject("Rust");
    const subjectBId = await seedSubject("Ruby");

    const suggestion = await insertDuplicateSuggestionIfNew({
      subjectXId: subjectAId,
      subjectYId: subjectBId,
      similarity: 0.87,
      reason: "false positive test",
    });

    const result = await resolveSubjectDuplicateSuggestion(suggestion!.id, { status: "rejected" });

    expect("error" in result).toBe(false);
    expect((result as { status: string }).status).toBe("rejected");

    expect(await getSubject(subjectAId)).not.toBeNull();
    expect(await getSubject(subjectBId)).not.toBeNull();
  });
});

describe("resolveSubjectDuplicateSuggestion — idempotency (Decision #14)", () => {
  it("returns already_resolved rather than flipping an already-resolved row's status again", async () => {
    const { insertDuplicateSuggestionIfNew, resolveSubjectDuplicateSuggestion } = await import(
      "./subject-duplicate.repo.js"
    );

    const subjectAId = await seedSubject("First Resolve A");
    const subjectBId = await seedSubject("First Resolve B");

    const suggestion = await insertDuplicateSuggestionIfNew({
      subjectXId: subjectAId,
      subjectYId: subjectBId,
      similarity: 0.9,
      reason: "idempotency test",
    });

    const first = await resolveSubjectDuplicateSuggestion(suggestion!.id, { status: "rejected" });
    expect("error" in first).toBe(false);

    const second = await resolveSubjectDuplicateSuggestion(suggestion!.id, { status: "rejected" });
    expect(second).toEqual({ error: "already_resolved" });
  });
});

describe("deleteSubject — SCENARIO 5b (plain delete invalidates a pending suggestion)", () => {
  it("leaves a pending suggestion referencing the deleted subject as 'stale'", async () => {
    const { insertDuplicateSuggestionIfNew, getSubjectDuplicateSuggestion } = await import(
      "./subject-duplicate.repo.js"
    );
    const { deleteSubject } = await import("../subject/subject.repo.js");

    const subjectAId = await seedSubject("Will Be Deleted");
    const subjectBId = await seedSubject("Untouched Sibling");

    const suggestion = await insertDuplicateSuggestionIfNew({
      subjectXId: subjectAId,
      subjectYId: subjectBId,
      similarity: 0.91,
      reason: "delete invalidation test",
    });

    const deleted = await deleteSubject(subjectAId);
    expect(deleted).toBe(true);

    const staleRow = await getSubjectDuplicateSuggestion(suggestion!.id);
    expect(staleRow!.status).toBe("stale");
    expect(staleRow!.resolvedAt).not.toBeNull();
  });
});
