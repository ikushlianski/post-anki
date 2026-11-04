import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

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

const dbName = `learning_path_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { abandonLearningPath, insertLearningPath, markLearningPathCompletedIfDue, getLearningPath } =
  await import("./learning-path.repo.js");

afterAll(async () => {
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function newPath(): Promise<string> {
  const created = await insertLearningPath({
    name: "Path",
    targetRoleLabel: "Role",
    orderedDomainNodeIds: [],
  });

  return created.path.id;
}

describe("abandonLearningPath (real Postgres)", () => {
  it("should abandon an active path", async () => {
    const id = await newPath();

    const result = await abandonLearningPath(id);

    expect(result?.status).toBe("abandoned");
  });

  it("should keep a completed path completed and return it unchanged", async () => {
    const id = await newPath();
    const completedAt = new Date("2026-02-01T00:00:00.000Z");

    await markLearningPathCompletedIfDue(id, completedAt);

    const result = await abandonLearningPath(id);
    const stored = await getLearningPath(id);

    expect(result?.status).toBe("completed");
    expect(stored?.path.status).toBe("completed");
    expect(stored?.path.completedAt).toBe(completedAt.toISOString());
  });

  it("should return null for an unknown path", async () => {
    expect(await abandonLearningPath("missing")).toBeNull();
  });
});
