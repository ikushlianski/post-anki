import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIO 5 (.planning/ontology-split-merge/scenarios.md) — the merge-vs-
// merge concurrency race proof. Mirrors phrase-bank-concurrency-fix's own
// integration-test pattern exactly: real Postgres (the e2e docker-compose DB
// on localhost:5436, never mocked), two concurrent calls fired via
// Promise.all against the real connection pool, DATABASE_URL required and
// asserted local-only before anything opens a connection.
//
// Unlike the phrase-bank races (where BOTH concurrent calls are meant to
// succeed), this is a genuine "exactly one wins" race: mergeSubjects never
// throws on a lost race — it returns a discriminated { error: "not_found" }
// result instead, which is what makes this the clean, catchable failure mode
// spec.md's advisory-lock design promises (never a 500, never a response
// claiming success from both, never a state where the source's children end
// up attached to neither target).

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

const dbName = `subj_merge_conc_${randomUUID().replace(/-/g, "_")}`;
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

const { mergeSubjects } = await import("./subject.repo.js");

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

function newSubjectId(prefix: string): string {
  return `sub_${prefix}_${randomUUID()}`;
}

async function insertSubject(id: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
}

interface MergeOutcome {
  error?: string;
  targetSubjectId?: string;
  sourceSubjectId?: string;
  curriculaMoved?: number;
  domainNodesMoved?: number;
}

function isSuccess(outcome: MergeOutcome): outcome is Required<
  Pick<MergeOutcome, "targetSubjectId" | "sourceSubjectId" | "curriculaMoved" | "domainNodesMoved">
> {
  return outcome.error === undefined;
}

describe("SCENARIO 5 — two concurrent merges racing for the same source subject", () => {
  it("exactly one merge succeeds with the moved counts, the other 404s cleanly, no partial/duplicated ownership of the source's children", async () => {
    const sourceId = newSubjectId("s5-source");
    const targetBId = newSubjectId("s5-target-b");
    const targetCId = newSubjectId("s5-target-c");

    await insertSubject(sourceId, "S5 Source");
    await insertSubject(targetBId, "S5 Target B");
    await insertSubject(targetCId, "S5 Target C");

    const curriculumId = `curr_${randomUUID()}`;
    await client.query(
      `INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, 'S5 curriculum')`,
      [curriculumId, sourceId],
    );

    const domainNodeId = `dnode_${randomUUID()}`;
    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order") VALUES ($1, $2, NULL, 'S5 node', 0)`,
      [domainNodeId, sourceId],
    );

    const [resultB, resultC]: [MergeOutcome, MergeOutcome] = await Promise.all([
      mergeSubjects(targetBId, sourceId),
      mergeSubjects(targetCId, sourceId),
    ]);

    const outcomes = [resultB, resultC];
    const succeeded = outcomes.filter(isSuccess);
    const failed = outcomes.filter((o) => !isSuccess(o));

    // Non-negotiable per spec.md's Definition of Done: both promises must
    // resolve (never reject) — asserted as its own explicit check before any
    // row is inspected, so a swallowed exception can never masquerade as
    // "the other one just didn't finish".
    expect(outcomes).toHaveLength(2);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const winner = succeeded[0]!;
    expect(winner.curriculaMoved).toBe(1);
    expect(winner.domainNodesMoved).toBe(1);
    expect(winner.sourceSubjectId).toBe(sourceId);

    expect(failed[0]!.error).toBe("not_found");

    const winnerId = winner.targetSubjectId;
    const loserId = winnerId === targetBId ? targetCId : targetBId;

    const { rows: winnerCurricula } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE subject_id = $1`,
      [winnerId],
    );
    expect(winnerCurricula[0]!.n).toBe(1);

    const { rows: loserCurricula } = await client.query(
      `SELECT count(*)::int AS n FROM curricula WHERE subject_id = $1`,
      [loserId],
    );
    expect(loserCurricula[0]!.n).toBe(0);

    const { rows: winnerNodes } = await client.query(
      `SELECT count(*)::int AS n FROM domain_nodes WHERE subject_id = $1`,
      [winnerId],
    );
    expect(winnerNodes[0]!.n).toBe(1);

    const { rows: loserNodes } = await client.query(
      `SELECT count(*)::int AS n FROM domain_nodes WHERE subject_id = $1`,
      [loserId],
    );
    expect(loserNodes[0]!.n).toBe(0);

    const { rows: sourceRows } = await client.query(`SELECT count(*)::int AS n FROM subjects WHERE id = $1`, [
      sourceId,
    ]);
    expect(sourceRows[0]!.n).toBe(0);

    const { rows: curriculumRow } = await client.query(
      `SELECT subject_id FROM curricula WHERE id = $1`,
      [curriculumId],
    );
    expect(curriculumRow[0]!.subject_id).toBe(winnerId);

    const { rows: domainNodeRow } = await client.query(
      `SELECT subject_id FROM domain_nodes WHERE id = $1`,
      [domainNodeId],
    );
    expect(domainNodeRow[0]!.subject_id).toBe(winnerId);
  });

  it("a merge against a subject that no longer exists (already merged away) returns not_found without throwing", async () => {
    const sourceId = newSubjectId("s5-gone");
    const targetId = newSubjectId("s5-gone-target");

    await insertSubject(sourceId, "S5 Already Gone Source");
    await insertSubject(targetId, "S5 Already Gone Target");

    await client.query(`DELETE FROM subjects WHERE id = $1`, [sourceId]);

    const result = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;

    expect(result.error).toBe("not_found");
  });
});
