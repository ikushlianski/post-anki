import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 4 (.planning/curriculum-merge/scenarios.md) — the one genuinely
// new precondition curriculum merge needs that mergeSubjects/mergeTags never
// had to check (spec.md Decision #2): the SOURCE curriculum must not have a
// curriculum_structure_turns row with role='assistant' AND status='pending'
// (curriculum_structure_turns_pending_assistant_unique would otherwise abort
// the transaction with a raw Postgres error instead of a clean 400 whenever
// BOTH curricula happen to have a pending turn at merge time). Scoped to the
// source only, not the target — Case 2 below proves a pending turn on the
// TARGET does not block the merge and survives untouched, per Decision #2's
// verified reasoning that the target's own curriculum_structure_turns rows
// are never deleted or reassigned by this merge.
//
// No HTTP path creates a curriculum_structure_turns row in this exact
// role='assistant', status='pending' shape deterministically (the real
// window is a narrow, unreliable-to-hit-via-HTTP race) — a direct SQL
// insert is the correct, honest test setup here, matching
// ontology-split-merge's own precedent for state with no independent HTTP
// creation path.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

// A dedicated, freshly-migrated throwaway Postgres database — never the
// shared e2e/dev database BASE_DATABASE_URL resolves to — so this file never
// leaves fixture rows behind in a database a developer might also be pointing
// DATABASE_URL at for unrelated local work (e.g. `npm run dev`). Same pattern
// as db/migrations.integration.test.ts and seed-domain-nodes.integration.test.ts.
function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `curr_merge_pending_${randomUUID().replace(/-/g, "_")}`;
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

const { mergeCurricula } = await import("./curriculum.repo.js");

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function insertSubject(subjectId: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, name],
  );
}

async function insertCurriculum(curriculumId: string, subjectId: string, name: string): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    name,
  ]);
}

async function insertModule(moduleId: string, curriculumId: string): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 0)`, [
    moduleId,
    curriculumId,
    "S4 module",
  ]);
}

async function insertStructureTurn(
  turnId: string,
  curriculumId: string,
  role: "assistant" | "user",
  status: "pending" | "complete",
  order: number,
): Promise<void> {
  await client.query(
    `INSERT INTO curriculum_structure_turns (id, curriculum_id, role, message, status, "order")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [turnId, curriculumId, role, "S4 turn", status, order],
  );
}

interface MergeOutcome {
  error?: string;
  targetCurriculumId?: string;
  sourceCurriculumId?: string;
  modulesMoved?: number;
  topicsMoved?: number;
}

async function setupSubjectAndPair(): Promise<{
  subjectId: string;
  targetId: string;
  sourceId: string;
}> {
  const subjectId = id("sub");
  await insertSubject(subjectId, "S4 subject");

  const targetId = id("s4-target");
  const sourceId = id("s4-source");

  await insertCurriculum(targetId, subjectId, "S4 Target");
  await insertCurriculum(sourceId, subjectId, "S4 Source");

  return { subjectId, targetId, sourceId };
}

describe("SCENARIO 4 — pending assistant structure-shaping turn blocks merge only on the source side", () => {
  it("Case 1 — the SOURCE has a pending assistant turn: merge is rejected with pending_structure_turn, no rows change", async () => {
    const { targetId, sourceId } = await setupSubjectAndPair();

    const sourceModuleId = id("mod");
    await insertModule(sourceModuleId, sourceId);

    const pendingTurnId = id("turn");
    await insertStructureTurn(pendingTurnId, sourceId, "assistant", "pending", 1);

    const result = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBe("pending_structure_turn");

    // Fully rejected, not partially applied — neither curriculum's rows
    // changed.
    const { rows: sourceModuleRows } = await client.query(
      `SELECT curriculum_id FROM modules WHERE id = $1`,
      [sourceModuleId],
    );
    expect(sourceModuleRows[0]!.curriculum_id).toBe(sourceId);

    const { rows: sourceCurriculumRows } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE id = $1`,
      [sourceId],
    );
    expect(sourceCurriculumRows[0]!.n).toBe(1);

    const { rows: turnRows } = await client.query(
      `SELECT status FROM curriculum_structure_turns WHERE id = $1`,
      [pendingTurnId],
    );
    expect(turnRows).toHaveLength(1);
    expect(turnRows[0]!.status).toBe("pending");
  });

  it("Case 2 — the TARGET has a pending assistant turn and the source is clean: merge SUCCEEDS, target's pending turn survives untouched", async () => {
    const { targetId, sourceId } = await setupSubjectAndPair();

    const targetPendingTurnId = id("turn");
    await insertStructureTurn(targetPendingTurnId, targetId, "assistant", "pending", 1);

    const sourceModuleId = id("mod");
    await insertModule(sourceModuleId, sourceId);

    const result = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.modulesMoved).toBe(1);

    const { rows: turnRows } = await client.query(
      `SELECT id, status, curriculum_id FROM curriculum_structure_turns WHERE id = $1`,
      [targetPendingTurnId],
    );
    expect(turnRows).toHaveLength(1);
    expect(turnRows[0]!.id).toBe(targetPendingTurnId);
    expect(turnRows[0]!.status).toBe("pending");
    expect(turnRows[0]!.curriculum_id).toBe(targetId);

    const { rows: sourceRows } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE id = $1`,
      [sourceId],
    );
    expect(sourceRows[0]!.n).toBe(0);
  });

  it("Case 3 — both curricula have a 'complete' turn (not pending): merge proceeds normally, source's turn is deleted, target's own turn is untouched", async () => {
    const { targetId, sourceId } = await setupSubjectAndPair();

    const targetCompleteTurnId = id("turn");
    await insertStructureTurn(targetCompleteTurnId, targetId, "assistant", "complete", 1);

    const sourceCompleteTurnId = id("turn");
    await insertStructureTurn(sourceCompleteTurnId, sourceId, "assistant", "complete", 1);

    const sourceModuleId = id("mod");
    await insertModule(sourceModuleId, sourceId);

    const result = (await mergeCurricula(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBeUndefined();
    expect(result.modulesMoved).toBe(1);

    const { rows: targetTurnRows } = await client.query(
      `SELECT count(*)::int AS n FROM curriculum_structure_turns WHERE id = $1`,
      [targetCompleteTurnId],
    );
    expect(targetTurnRows[0]!.n).toBe(1);

    const { rows: sourceTurnRows } = await client.query(
      `SELECT count(*)::int AS n FROM curriculum_structure_turns WHERE id = $1`,
      [sourceCompleteTurnId],
    );
    expect(sourceTurnRows[0]!.n).toBe(0);
  });
});
