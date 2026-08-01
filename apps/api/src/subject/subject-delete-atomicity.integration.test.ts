import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The atomicity half of the connection-nesting fix
// (docs/architecture/concurrency-and-verification-hardening/review.md —
// "Bonus: the curricula deletions become part of the same transaction").
// `deleteSubject` deletes each owned curriculum and then the subject row; as
// long as `deleteCurriculum` takes its own pooled connection those are
// separate commits, so a failure partway through leaves the subject present
// with some of its courses already destroyed and no way to tell which.
//
// The failure is injected rather than waited for: `deleteCurriculum` is
// wrapped so the FIRST call runs for real and the SECOND throws, which is
// exactly "after at least one curriculum has been deleted, before the subject
// row is". With `deleteCurriculum` transaction-aware and handed the lock
// transaction, that rollback takes the first deletion with it.
//
// Same real-Postgres rules as every other *.integration.test.ts here: the e2e
// docker-compose DB on localhost:5436, never mocked, DATABASE_URL asserted
// local-only before anything opens a connection.

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(DATABASE_URL);

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const injected = vi.hoisted(() => ({
  calls: 0,
  failOnCall: Number.POSITIVE_INFINITY,
}));

vi.mock("../curriculum/curriculum.repo.js", async () => {
  const actual =
    await vi.importActual<typeof import("../curriculum/curriculum.repo.js")>(
      "../curriculum/curriculum.repo.js",
    );

  return {
    ...actual,
    deleteCurriculum: vi.fn(
      async (...args: Parameters<typeof actual.deleteCurriculum>) => {
        injected.calls += 1;

        if (injected.calls >= injected.failOnCall) {
          throw new Error("injected failure partway through deleteSubject");
        }

        return actual.deleteCurriculum(...args);
      },
    ),
  };
});

const { deleteSubject } = await import("./subject.repo.js");

let client: pg.Client;

const createdSubjectIds: string[] = [];
const createdCurriculumIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

beforeEach(() => {
  injected.calls = 0;
  injected.failOnCall = Number.POSITIVE_INFINITY;
});

afterAll(async () => {
  if (client && createdSubjectIds.length > 0) {
    await client.query(`DELETE FROM topics WHERE curriculum_id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM modules WHERE curriculum_id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM curricula WHERE subject_id = ANY($1)`, [createdSubjectIds]);
    await client.query(`DELETE FROM subjects WHERE id = ANY($1)`, [createdSubjectIds]);
  }

  await client?.end();
  await closeDb();
});

async function insertSubject(name: string): Promise<string> {
  const id = `sub_delatomic_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [id, name],
  );
  createdSubjectIds.push(id);

  return id;
}

async function insertCurriculum(subjectId: string, name: string): Promise<string> {
  const id = `cur_delatomic_${randomUUID()}`;

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    id,
    subjectId,
    name,
  ]);
  createdCurriculumIds.push(id);

  return id;
}

// The curriculum row is only the outermost thing `deleteCurriculum` destroys —
// it also clears the whole module/topic tree via `clearCurriculumStructure`,
// which runs its own `db.transaction(...)`. Seeding structure is what makes
// the rollback claim cover everything a real delete would take with it, and
// what exercises that nested transaction on a handed-down executor.
async function insertModuleWithTopic(curriculumId: string): Promise<void> {
  const moduleId = `mod_delatomic_${randomUUID()}`;
  const topicId = `top_delatomic_${randomUUID()}`;

  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 0)`,
    [moduleId, curriculumId],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, 'Topic', 0)`,
    [topicId, moduleId, curriculumId],
  );
}

async function countStructureFor(curriculumId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM modules WHERE curriculum_id = $1)
          + (SELECT count(*) FROM topics WHERE curriculum_id = $1) AS n`,
    [curriculumId],
  );

  return Number(rows[0]!.n);
}

async function countCurriculaFor(subjectId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM curricula WHERE subject_id = $1`,
    [subjectId],
  );

  return rows[0]!.n as number;
}

async function countSubjectRows(subjectId: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM subjects WHERE id = $1`, [
    subjectId,
  ]);

  return rows[0]!.n as number;
}

describe("deleteSubject is atomic across its curricula", () => {
  it("destroys no curriculum when the delete fails after the first one has already run", async () => {
    const subjectId = await insertSubject("Atomic Delete Subject");
    const firstCurriculumId = await insertCurriculum(subjectId, "First curriculum");

    await insertCurriculum(subjectId, "Second curriculum");
    await insertModuleWithTopic(firstCurriculumId);

    injected.failOnCall = 2;

    await expect(deleteSubject(subjectId)).rejects.toThrow(
      "injected failure partway through deleteSubject",
    );

    expect(injected.calls).toBe(2);

    expect(await countCurriculaFor(subjectId)).toBe(2);
    expect(await countStructureFor(firstCurriculumId)).toBe(2);
    expect(await countSubjectRows(subjectId)).toBe(1);
  }, 30_000);

  it("still deletes the subject, every curriculum and their structure when nothing fails", async () => {
    const subjectId = await insertSubject("Uncontended Atomic Delete Subject");
    const curriculumId = await insertCurriculum(subjectId, "Only curriculum");

    await insertModuleWithTopic(curriculumId);

    expect(await deleteSubject(subjectId)).toBe(true);

    expect(await countCurriculaFor(subjectId)).toBe(0);
    expect(await countStructureFor(curriculumId)).toBe(0);
    expect(await countSubjectRows(subjectId)).toBe(0);
  }, 30_000);
});
