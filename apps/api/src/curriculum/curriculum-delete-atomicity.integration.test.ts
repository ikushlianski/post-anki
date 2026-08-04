import { randomUUID } from "node:crypto";
import type { Table } from "drizzle-orm";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// The standalone half of the atomicity work
// (docs/architecture/concurrency-and-verification-hardening/review.md — its
// "Resolution" section left this open explicitly). `deleteSubject` hands
// `deleteCurriculum` its own transaction, so the nested case already commits
// once; `DELETE /curricula/:id` handed it nothing, so the structure clear, the
// sources delete and the curricula row delete were three separate commits. A
// failure between them left the modules/topics/gaps of a still-existing course
// destroyed, with nothing to say which.
//
// There is no module boundary between the structure clear and the `curricula`
// delete to mock (and no foreign key on `curricula` to trip naturally —
// verified against the e2e DB's pg_constraint), so the failure is injected at
// the executor: `getDb` is wrapped in a proxy that throws when a delete is
// issued against the `curricula` table, and that proxy follows the executor
// into `db.transaction(...)` so it fires whether the delete runs on the pool
// (before the fix) or on a transaction (after it).
//
// Same real-Postgres rules as every other *.integration.test.ts here: the e2e
// docker-compose DB on localhost:5436, never mocked, DATABASE_URL asserted
// local-only before anything opens a connection.

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

const dbName = `curr_del_atomic_${randomUUID().replace(/-/g, "_")}`;
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

const INJECTED_FAILURE = "injected failure before the curriculum row is deleted";

const injected = vi.hoisted(() => ({ failOnCurriculaDelete: false }));

vi.mock("../db/client.js", async () => {
  const actual = await vi.importActual<typeof import("../db/client.js")>("../db/client.js");
  const { getTableName } = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");

  interface ProxiedExecutor {
    delete: (table: Table) => unknown;
    transaction: (run: (tx: object) => unknown, config?: unknown) => unknown;
  }

  const instrument = <T extends object>(executor: T): T =>
    new Proxy(executor, {
      get(target, prop) {
        const inner = target as unknown as ProxiedExecutor;

        if (prop === "delete") {
          return (table: Table) => {
            if (injected.failOnCurriculaDelete && getTableName(table) === "curricula") {
              throw new Error("injected failure before the curriculum row is deleted");
            }

            return inner.delete(table);
          };
        }

        if (prop === "transaction") {
          return (run: (tx: object) => unknown, config?: unknown) =>
            inner.transaction((tx) => run(instrument(tx)), config);
        }

        const value = Reflect.get(target, prop);

        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  return { ...actual, getDb: () => instrument(actual.getDb()) };
});

const { deleteCurriculum } = await import("./curriculum.repo.js");

let client: pg.Client;

const createdSubjectIds: string[] = [];
const createdCurriculumIds: string[] = [];

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

beforeEach(() => {
  injected.failOnCurriculaDelete = false;
});

afterAll(async () => {
  if (client && createdCurriculumIds.length > 0) {
    await client.query(
      `DELETE FROM gaps WHERE topic_id IN (SELECT id FROM topics WHERE curriculum_id = ANY($1))`,
      [createdCurriculumIds],
    );
    await client.query(`DELETE FROM topics WHERE curriculum_id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM modules WHERE curriculum_id = ANY($1)`, [createdCurriculumIds]);
    await client.query(`DELETE FROM curricula WHERE id = ANY($1)`, [createdCurriculumIds]);
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

interface SeededCurriculum {
  curriculumId: string;
  gapId: string;
}

async function seedCurriculumWithStructure(name: string): Promise<SeededCurriculum> {
  const subjectId = `sub_curdelatomic_${randomUUID()}`;
  const curriculumId = `cur_curdelatomic_${randomUUID()}`;
  const moduleId = `mod_curdelatomic_${randomUUID()}`;
  const topicId = `top_curdelatomic_${randomUUID()}`;
  const gapId = `gap_curdelatomic_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
    [subjectId, `curriculum delete atomicity ${subjectId}`],
  );
  createdSubjectIds.push(subjectId);

  await client.query(`INSERT INTO curricula (id, subject_id, name) VALUES ($1, $2, $3)`, [
    curriculumId,
    subjectId,
    name,
  ]);
  createdCurriculumIds.push(curriculumId);

  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, 'Module', 1)`,
    [moduleId, curriculumId],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, 'Topic', 1)`,
    [topicId, moduleId, curriculumId],
  );
  await client.query(`INSERT INTO gaps (id, topic_id, label) VALUES ($1, $2, $3)`, [
    gapId,
    topicId,
    `gap for ${topicId}`,
  ]);

  await client.query(
    `INSERT INTO sources (id, curriculum_id, kind, value) VALUES ($1, $2, 'text', 'seed material')`,
    [`src_curdelatomic_${randomUUID()}`, curriculumId],
  );

  return { curriculumId, gapId };
}

async function countRows(table: string, curriculumId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM ${table} WHERE curriculum_id = $1`,
    [curriculumId],
  );

  return rows[0]!.n as number;
}

async function countCurriculumRows(curriculumId: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM curricula WHERE id = $1`, [
    curriculumId,
  ]);

  return rows[0]!.n as number;
}

async function countGapRows(gapId: string): Promise<number> {
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM gaps WHERE id = $1`, [gapId]);

  return rows[0]!.n as number;
}

describe("deleteCurriculum called standalone is atomic", () => {
  it("destroys nothing when the delete fails after the structure has already been cleared", async () => {
    const seeded = await seedCurriculumWithStructure("Atomic standalone delete");

    injected.failOnCurriculaDelete = true;

    await expect(deleteCurriculum(seeded.curriculumId)).rejects.toThrow(INJECTED_FAILURE);

    expect(await countCurriculumRows(seeded.curriculumId)).toBe(1);
    expect(await countRows("modules", seeded.curriculumId)).toBe(1);
    expect(await countRows("topics", seeded.curriculumId)).toBe(1);
    expect(await countGapRows(seeded.gapId)).toBe(1);
    expect(await countRows("sources", seeded.curriculumId)).toBe(1);
  }, 30_000);

  it("still deletes the curriculum, its structure and its sources when nothing fails", async () => {
    const seeded = await seedCurriculumWithStructure("Uncontended standalone delete");

    expect(await deleteCurriculum(seeded.curriculumId)).toBe(true);

    expect(await countCurriculumRows(seeded.curriculumId)).toBe(0);
    expect(await countRows("modules", seeded.curriculumId)).toBe(0);
    expect(await countRows("topics", seeded.curriculumId)).toBe(0);
    expect(await countGapRows(seeded.gapId)).toBe(0);
    expect(await countRows("sources", seeded.curriculumId)).toBe(0);
  }, 30_000);

  it("reports false without touching anything for a curriculum that does not exist", async () => {
    expect(await deleteCurriculum(`cur_curdelatomic_missing_${randomUUID()}`)).toBe(false);
  }, 30_000);
});
