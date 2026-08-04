import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The merged-away subject's tracked_tool_scan_state rows (.planning/TODO.md
// — "tracked_tool_scan_state rows for a merged-away subject stay orphaned").
// mergeSubjects reassigns curricula, domain_nodes and the doc-scan
// suggestion tables but left this one untouched, so every watermark row a
// merged-away source subject owned kept pointing at a subject id that no
// longer existed.
//
// A blind reassign (the doc-scan suggestion tables' own pattern) is not
// enough here: the table is keyed (subject_id, tool_key), so a source row
// whose tool_key the target has ALSO scanned would collide with the
// target's own row on that primary key. The fix deletes the source's row
// for any tool_key already present at the target (keeping the target's
// watermark) and reassigns the rest.
//
// Same real-Postgres rules as every other *.integration.test.ts here: the
// e2e docker-compose DB on localhost:5436, never mocked, DATABASE_URL
// asserted local-only before anything opens a connection.

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

const dbName = `subj_merge_scan_${randomUUID().replace(/-/g, "_")}`;
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
const { getTrackedToolScanState, upsertTrackedToolScanState } = await import(
  "../domain-map/domain-map.repo.js"
);

let client: pg.Client;

const createdSubjectIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  if (client && createdSubjectIds.length > 0) {
    await client.query(`DELETE FROM tracked_tool_scan_state WHERE subject_id = ANY($1)`, [
      createdSubjectIds,
    ]);
    await client.query(`DELETE FROM subjects WHERE id = ANY($1)`, [createdSubjectIds]);
  }

  await client?.end();
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function insertSubject(name: string): Promise<string> {
  const id = `sub_scanmerge_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function countScanStateRows(subjectId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM tracked_tool_scan_state WHERE subject_id = $1`,
    [subjectId],
  );

  return rows[0]!.n as number;
}

interface MergeOutcome {
  error?: string;
}

describe("mergeSubjects and the source subject's tracked_tool_scan_state rows", () => {
  it("keeps the target's watermark when both subjects scanned the same tool", async () => {
    const sourceId = await insertSubject("Scan Reassign Conflict Source");
    const targetId = await insertSubject("Scan Reassign Conflict Target");

    await upsertTrackedToolScanState(sourceId, "shared-tool", "source-hash");
    await upsertTrackedToolScanState(targetId, "shared-tool", "target-hash");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    const merged = await getTrackedToolScanState(targetId, "shared-tool");
    expect(merged?.lastContentHash).toBe("target-hash");

    expect(await countScanStateRows(sourceId)).toBe(0);
    expect(await countScanStateRows(targetId)).toBe(1);
  }, 30_000);

  it("reassigns the source's watermark when the target never scanned that tool", async () => {
    const sourceId = await insertSubject("Scan Reassign Disjoint Source");
    const targetId = await insertSubject("Scan Reassign Disjoint Target");

    await upsertTrackedToolScanState(sourceId, "source-only-tool", "source-hash");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    const merged = await getTrackedToolScanState(targetId, "source-only-tool");
    expect(merged?.lastContentHash).toBe("source-hash");

    expect(await countScanStateRows(sourceId)).toBe(0);
    expect(await countScanStateRows(targetId)).toBe(1);
  }, 30_000);

  it("leaves both watermarks intact, reassigned, when the two subjects scanned disjoint tools", async () => {
    const sourceId = await insertSubject("Scan Reassign Mixed Source");
    const targetId = await insertSubject("Scan Reassign Mixed Target");

    await upsertTrackedToolScanState(sourceId, "tool-a", "source-a-hash");
    await upsertTrackedToolScanState(sourceId, "tool-b", "source-b-hash");
    await upsertTrackedToolScanState(targetId, "tool-b", "target-b-hash");
    await upsertTrackedToolScanState(targetId, "tool-c", "target-c-hash");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    expect(await countScanStateRows(sourceId)).toBe(0);
    expect(await countScanStateRows(targetId)).toBe(3);

    expect((await getTrackedToolScanState(targetId, "tool-a"))?.lastContentHash).toBe(
      "source-a-hash",
    );
    expect((await getTrackedToolScanState(targetId, "tool-b"))?.lastContentHash).toBe(
      "target-b-hash",
    );
    expect((await getTrackedToolScanState(targetId, "tool-c"))?.lastContentHash).toBe(
      "target-c-hash",
    );
  }, 30_000);

  it("does nothing when neither subject ever scanned a tool", async () => {
    const sourceId = await insertSubject("Scan Reassign Empty Source");
    const targetId = await insertSubject("Scan Reassign Empty Target");

    const mergeResult = (await mergeSubjects(targetId, sourceId)) as MergeOutcome;
    expect(mergeResult.error).toBeUndefined();

    expect(await countScanStateRows(sourceId)).toBe(0);
    expect(await countScanStateRows(targetId)).toBe(0);
  }, 30_000);
});
