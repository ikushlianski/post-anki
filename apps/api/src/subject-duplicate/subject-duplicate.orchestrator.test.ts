import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIO 1 (.planning/ai-duplicate-detection/scenarios.md) —
// subject-duplicate.orchestrator.ts's triggerSubjectDuplicateScan(), with
// global.fetch mocked for the embeddings call (per spec.md's Backend DoD)
// but everything else — subject rows, the embedding cache write-back, the
// suggestion insert — hitting a REAL Postgres instance, because "exactly
// one pending suggestion row exists" can only be proven against real rows,
// not a mocked repo shape. Same fresh-migrated-throwaway-Postgres technique
// as decide.repo.test.ts.
//
// Kept at this exact path (not *.integration.test.ts) because spec.md's
// Backend DoD pins the precise command
// `npx vitest run apps/api/src/subject-duplicate/subject-duplicate.orchestrator.test.ts`;
// vitest.integration.config.ts's include list carries this filename as a
// named exception (vitest.config.ts's own exclude list also names it, to
// keep it out of the fast `npm run test` sweep).

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

const dbName = `subject_duplicate_orch_${randomUUID().replace(/-/g, "_")}`;
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

// Deliberately near-duplicate ("Webdev" / "Programming — Web Development")
// vs. clearly-unrelated ("Rust", "Cooking") vectors — matches SCENARIO 1's
// own "Webdev"/"Programming — Web Development" style case from
// scenarios.md. Any other text (e.g. the language-practice deck's, which
// should never even reach the embeddings call since it's filtered out by
// kind before this point) falls back to a neutral vector.
function fakeEmbeddingForText(text: string): number[] {
  if (text.startsWith("Webdev\n")) {
    return [1, 0.001, 0];
  }

  if (text.startsWith("Programming — Web Development\n")) {
    return [0.9995, 0.002, 0];
  }

  if (text.startsWith("Rust\n")) {
    return [0, 1, 0];
  }

  if (text.startsWith("Cooking\n")) {
    return [0, 0, 1];
  }

  return [0.3, 0.3, 0.3];
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const init = args[1];
    const body = JSON.parse(String(init?.body)) as { input: string[]; model: string };
    const data = body.input.map((text, index) => ({
      index,
      embedding: fakeEmbeddingForText(text),
    }));

    return new Response(JSON.stringify({ data, model: body.model }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("triggerSubjectDuplicateScan — SCENARIO 1", () => {
  it("surfaces exactly one pending suggestion for the near-duplicate pair and none for unrelated subjects", async () => {
    const { createSubject } = await import("../subject/subject.repo.js");

    const webdev = await createSubject({
      name: "Webdev",
      description: "Frontend and backend web development",
      kind: "architecture-mentor",
    });
    const programming = await createSubject({
      name: "Programming — Web Development",
      description: "Frontend and backend web development, in more depth",
      kind: "architecture-mentor",
    });
    const rust = await createSubject({
      name: "Rust",
      description: "Systems programming language",
      kind: "architecture-mentor",
    });
    const cooking = await createSubject({
      name: "Cooking",
      description: "Recipes and kitchen techniques",
      kind: "architecture-mentor",
    });
    const deck = await createSubject({
      name: "Spanish Deck",
      description: "Vocabulary flashcards",
      kind: "language-practice",
    });

    const { triggerSubjectDuplicateScan } = await import("./subject-duplicate.orchestrator.js");
    const result = await triggerSubjectDuplicateScan();

    const suggestionPairs = result.suggestions.map((s) => [s.subjectAId, s.subjectBId].sort());
    const webdevProgrammingPair = [webdev.id, programming.id].sort();

    expect(suggestionPairs).toContainEqual(webdevProgrammingPair);
    expect(suggestionPairs).toHaveLength(1);

    const referencesUnrelatedPair = result.suggestions.some(
      (s) =>
        (s.subjectAId === rust.id || s.subjectBId === rust.id) &&
        (s.subjectAId === cooking.id || s.subjectBId === cooking.id),
    );
    expect(referencesUnrelatedPair).toBe(false);

    // SCENARIO 1's kind restriction: language-practice subjects are never
    // compared or suggested, matching mergeSubjects' own kind restriction.
    const referencesDeck = result.suggestions.some(
      (s) => s.subjectAId === deck.id || s.subjectBId === deck.id,
    );
    expect(referencesDeck).toBe(false);

    // Only the 4 architecture-mentor subjects were candidates for
    // embedding; the language-practice deck never reaches the embeddings
    // call at all.
    expect(result.embeddedCount).toBe(4);
    expect(result.reusedCount).toBe(0);
    expect(result.capped).toBe(false);

    const status = result.suggestions.find(
      (s) =>
        (s.subjectAId === webdev.id || s.subjectBId === webdev.id) &&
        (s.subjectAId === programming.id || s.subjectBId === programming.id),
    );
    expect(status?.status).toBe("pending");
  });

  it("makes zero embedding API calls on a rescan when nothing changed (SCENARIO 2)", async () => {
    const { createSubject } = await import("../subject/subject.repo.js");
    const { triggerSubjectDuplicateScan } = await import("./subject-duplicate.orchestrator.js");

    await createSubject({
      name: "Unchanged Subject",
      description: "Nothing about this changes between scans",
      kind: "architecture-mentor",
    });

    const first = await triggerSubjectDuplicateScan();
    expect(first.embeddedCount).toBeGreaterThan(0);

    vi.mocked(global.fetch).mockClear();

    const second = await triggerSubjectDuplicateScan();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(second.embeddedCount).toBe(0);
  });
});
