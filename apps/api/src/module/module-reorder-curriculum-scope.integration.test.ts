import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// reorderModules curriculum scoping — closes the gap where a caller could
// splice another curriculum's module id into the payload and move it into
// this curriculum's ordering (issue #75). The check must be exact-set, not
// subset: assignOrders reassigns 1..N sequentially to only the ids it's
// given, so a payload that merely omits one of the curriculum's own modules
// would leave that module's stale order colliding with the newly-assigned
// range if a subset check let it through.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `module_reorder_scope_${randomUUID().replace(/-/g, "_")}`;
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

const { reorderModules } = await import("./module.repo.js");

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

async function insertModule(
  moduleId: string,
  curriculumId: string,
  title: string,
  order: number,
): Promise<void> {
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`, [
    moduleId,
    curriculumId,
    title,
    order,
  ]);
}

async function moduleOrders(curriculumId: string): Promise<Record<string, number>> {
  const { rows } = await client.query(
    `SELECT id, "order" FROM modules WHERE curriculum_id = $1`,
    [curriculumId],
  );

  return Object.fromEntries(rows.map((row) => [row.id, row.order as number]));
}

interface Fixture {
  curriculumAId: string;
  curriculumBId: string;
  a1: string;
  a2: string;
  a3: string;
  b1: string;
  b2: string;
}

async function seedFixture(): Promise<Fixture> {
  const subjectId = id("sub");
  await insertSubject(subjectId, "Fixture subject");

  const curriculumAId = id("cur");
  const curriculumBId = id("cur");
  await insertCurriculum(curriculumAId, subjectId, "Curriculum A");
  await insertCurriculum(curriculumBId, subjectId, "Curriculum B");

  const a1 = id("mod");
  const a2 = id("mod");
  const a3 = id("mod");
  const b1 = id("mod");
  const b2 = id("mod");

  await insertModule(a1, curriculumAId, "A1", 1);
  await insertModule(a2, curriculumAId, "A2", 2);
  await insertModule(a3, curriculumAId, "A3", 3);
  await insertModule(b1, curriculumBId, "B1", 1);
  await insertModule(b2, curriculumBId, "B2", 2);

  return { curriculumAId, curriculumBId, a1, a2, a3, b1, b2 };
}

describe("reorderModules", () => {
  it("reorders every module when the payload is exactly this curriculum's module set", async () => {
    const { curriculumAId, curriculumBId, a1, a2, a3, b1, b2 } = await seedFixture();

    const result = await reorderModules(curriculumAId, [a3, a1, a2]);

    expect(result).toEqual({ reordered: 3 });

    const ordersA = await moduleOrders(curriculumAId);
    expect(ordersA).toEqual({ [a3]: 1, [a1]: 2, [a2]: 3 });

    const ordersB = await moduleOrders(curriculumBId);
    expect(ordersB).toEqual({ [b1]: 1, [b2]: 2 });
  }, 30_000);

  it("rejects a payload that smuggles another curriculum's module id and changes nothing", async () => {
    const { curriculumAId, curriculumBId, a1, a2, a3, b1, b2 } = await seedFixture();

    const result = await reorderModules(curriculumAId, [a1, a2, b1]);

    expect(result).toEqual({ error: "invalid_id_set" });

    const ordersA = await moduleOrders(curriculumAId);
    expect(ordersA).toEqual({ [a1]: 1, [a2]: 2, [a3]: 3 });

    const ordersB = await moduleOrders(curriculumBId);
    expect(ordersB).toEqual({ [b1]: 1, [b2]: 2 });
  }, 30_000);

  it("rejects an incomplete payload that omits one of the curriculum's own modules", async () => {
    const { curriculumAId, curriculumBId, a1, a2, a3, b1, b2 } = await seedFixture();

    const result = await reorderModules(curriculumAId, [a1, a2]);

    expect(result).toEqual({ error: "invalid_id_set" });

    const ordersA = await moduleOrders(curriculumAId);
    expect(ordersA).toEqual({ [a1]: 1, [a2]: 2, [a3]: 3 });

    const ordersB = await moduleOrders(curriculumBId);
    expect(ordersB).toEqual({ [b1]: 1, [b2]: 2 });
  }, 30_000);
});
