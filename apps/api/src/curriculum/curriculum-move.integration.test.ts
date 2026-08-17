import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// move-curriculum-to-subject — the "reorganize my curricula across
// subjects" flow (splitting one big subject into focused ones). Covers the
// two things a naive `UPDATE curricula SET subject_id = ...` would get
// wrong: every curriculum_domain_node_mappings row this curriculum owns
// points at a domain node in the OLD subject's tree (domain_nodes.subject_id
// scopes a separate forest per subject), so those rows are meaningless once
// the curriculum belongs to a new subject and must be cleared, not carried
// across or silently left dangling; and a move into a language-practice
// subject would make the curriculum invisible (SubjectSection never renders
// a curricula list for that subject kind), so the target must stay
// architecture-mentor-only, same as the existing subject-merge picker.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

// A dedicated, freshly-migrated throwaway Postgres database — never the
// shared e2e/dev database BASE_DATABASE_URL resolves to — so this file never
// leaves fixture rows behind in a database a developer might also be pointing
// DATABASE_URL at for unrelated local work (e.g. `npm run dev`). Same pattern
// as domain-node-merge-concurrency.integration.test.ts.
function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `curriculum_move_${randomUUID().replace(/-/g, "_")}`;
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

const { moveCurriculumToSubject } = await import("./curriculum.repo.js");
const { listMappingsForCurriculum } = await import(
  "../curriculum-domain-mapping/curriculum-domain-mapping.repo.js"
);

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

async function insertSubject(
  subjectId: string,
  name: string,
  kind: "architecture-mentor" | "language-practice" = "architecture-mentor",
): Promise<void> {
  await client.query(`INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, $3)`, [
    subjectId,
    name,
    kind,
  ]);
}

async function insertCurriculum(curriculumId: string, subjectId: string, name: string): Promise<void> {
  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    name,
  ]);
}

async function insertDomainNode(nodeId: string, subjectId: string, name: string): Promise<void> {
  await client.query(`INSERT INTO domain_nodes (id, subject_id, name) VALUES ($1, $2, $3)`, [
    nodeId,
    subjectId,
    name,
  ]);
}

async function insertMapping(
  curriculumId: string,
  domainNodeId: string,
  status: "suggested" | "confirmed" | "rejected",
): Promise<void> {
  await client.query(
    `INSERT INTO curriculum_domain_node_mappings (id, curriculum_id, domain_node_id, status, source)
     VALUES ($1, $2, $3, $4, 'ai_suggested')`,
    [id("cdnm"), curriculumId, domainNodeId, status],
  );
}

async function countMappings(curriculumId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM curriculum_domain_node_mappings WHERE curriculum_id = $1`,
    [curriculumId],
  );

  return rows[0]!.n as number;
}

interface MoveOutcome {
  error?: string;
  subjectId?: string;
}

describe("moveCurriculumToSubject", () => {
  it("reassigns subjectId and clears every domain-node mapping row, whatever its status", async () => {
    const sourceSubjectId = id("sub");
    const targetSubjectId = id("sub");
    await insertSubject(sourceSubjectId, "Webdev (source)");
    await insertSubject(targetSubjectId, "Frontend (target)");

    const curriculumId = id("cur");
    await insertCurriculum(curriculumId, sourceSubjectId, "React fundamentals");

    const confirmedNodeId = id("node");
    const rejectedNodeId = id("node");
    const suggestedNodeId = id("node");
    await insertDomainNode(confirmedNodeId, sourceSubjectId, "Frontend frameworks");
    await insertDomainNode(rejectedNodeId, sourceSubjectId, "Old candidate");
    await insertDomainNode(suggestedNodeId, sourceSubjectId, "Pending candidate");
    await insertMapping(curriculumId, confirmedNodeId, "confirmed");
    await insertMapping(curriculumId, rejectedNodeId, "rejected");
    await insertMapping(curriculumId, suggestedNodeId, "suggested");

    expect(await countMappings(curriculumId)).toBe(3);

    const result = (await moveCurriculumToSubject(curriculumId, targetSubjectId)) as MoveOutcome;

    expect(result.error).toBeUndefined();
    expect(result.subjectId).toBe(targetSubjectId);

    const { rows: curriculumRows } = await client.query(
      `SELECT subject_id FROM curricula WHERE id = $1`,
      [curriculumId],
    );
    expect(curriculumRows[0]!.subject_id).toBe(targetSubjectId);

    expect(await countMappings(curriculumId)).toBe(0);
    expect(await listMappingsForCurriculum(curriculumId)).toEqual([]);
  }, 30_000);

  it("reports same_subject and changes nothing when the target is the curriculum's current subject", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "Only subject");

    const curriculumId = id("cur");
    await insertCurriculum(curriculumId, subjectId, "Curriculum staying put");

    const result = (await moveCurriculumToSubject(curriculumId, subjectId)) as MoveOutcome;

    expect(result.error).toBe("same_subject");

    const { rows } = await client.query(`SELECT subject_id FROM curricula WHERE id = $1`, [curriculumId]);
    expect(rows[0]!.subject_id).toBe(subjectId);
  }, 30_000);

  it("reports not_found for a curriculum id that does not exist", async () => {
    const targetSubjectId = id("sub");
    await insertSubject(targetSubjectId, "Real target subject");

    const result = (await moveCurriculumToSubject(
      id("cur_missing"),
      targetSubjectId,
    )) as MoveOutcome;

    expect(result.error).toBe("not_found");
  }, 30_000);

  it("reports subject_not_found and changes nothing when the target subject does not exist", async () => {
    const subjectId = id("sub");
    await insertSubject(subjectId, "Source subject");

    const curriculumId = id("cur");
    await insertCurriculum(curriculumId, subjectId, "Curriculum with a bad target");

    const result = (await moveCurriculumToSubject(
      curriculumId,
      id("sub_missing"),
    )) as MoveOutcome;

    expect(result.error).toBe("subject_not_found");

    const { rows } = await client.query(`SELECT subject_id FROM curricula WHERE id = $1`, [curriculumId]);
    expect(rows[0]!.subject_id).toBe(subjectId);
  }, 30_000);

  it("reports kind_mismatch and changes nothing when the target subject is language-practice", async () => {
    const subjectId = id("sub");
    const targetSubjectId = id("sub");
    await insertSubject(subjectId, "Source subject for kind guard");
    await insertSubject(targetSubjectId, "Language practice deck", "language-practice");

    const curriculumId = id("cur");
    await insertCurriculum(curriculumId, subjectId, "Curriculum blocked from a practice deck");

    const result = (await moveCurriculumToSubject(curriculumId, targetSubjectId)) as MoveOutcome;

    expect(result.error).toBe("kind_mismatch");

    const { rows } = await client.query(`SELECT subject_id FROM curricula WHERE id = $1`, [curriculumId]);
    expect(rows[0]!.subject_id).toBe(subjectId);
  }, 30_000);
});
