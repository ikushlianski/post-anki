import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "./assert-local-db-target.js";

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

const dbName = `nest_subjects_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("./migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

const MIGRATION_SQL = readFileSync(
  new URL("./migrations/0089_nest-subjects-under-parents.sql", import.meta.url),
  "utf8",
)
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
});

afterAll(async () => {
  await client?.end();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function seedSubject(name: string, parentId: string | null = null): Promise<string> {
  const id = `sub_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [id, name, parentId]);

  return id;
}

async function runMigrationSql(): Promise<void> {
  for (const statement of MIGRATION_SQL) {
    await client.query(statement);
  }
}

async function parentOf(name: string): Promise<string | null | undefined> {
  const result = await client.query<{ parent_id: string | null }>(
    `SELECT parent_id FROM subjects WHERE name = $1`,
    [name],
  );

  return result.rows[0]?.parent_id;
}

async function countNamed(name: string): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM subjects WHERE name = $1`,
    [name],
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function inTransaction(body: () => Promise<void>): Promise<void> {
  await client.query("BEGIN");

  try {
    await body();
  } finally {
    await client.query("ROLLBACK");
  }
}

const BUSINESS_CHILDREN = ["Time management", "Sales", "SMM", "Negotiations", "HR", "Marketing"];

describe("nest-subjects-under-parents data migration", () => {
  it("should move the named subjects under the web-development parent and create the business children", async () => {
    await inTransaction(async () => {
      const programmingId = await seedSubject("Programming / Web Development");
      const businessId = await seedSubject("Business");
      await seedSubject("Databases");
      await seedSubject("AI");
      await seedSubject("Architecture");
      await seedSubject("Cloud Computing");

      await runMigrationSql();

      for (const name of ["Databases", "AI", "Architecture", "Cloud Computing"]) {
        expect(await parentOf(name)).toBe(programmingId);
      }

      for (const name of BUSINESS_CHILDREN) {
        expect(await parentOf(name)).toBe(businessId);
      }
    });
  });

  it("should change nothing and fail nothing when the named parents are absent", async () => {
    await inTransaction(async () => {
      await seedSubject("Databases");
      const before = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM subjects`);

      await runMigrationSql();

      const after = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM subjects`);

      expect(after.rows[0]?.total).toBe(before.rows[0]?.total);
      expect(await parentOf("Databases")).toBeNull();
    });
  });

  it("should create no duplicate business children when the migration runs twice", async () => {
    await inTransaction(async () => {
      await seedSubject("Business");
      await seedSubject("Programming / Web Development");
      await seedSubject("Databases");

      await runMigrationSql();
      await runMigrationSql();

      for (const name of BUSINESS_CHILDREN) {
        expect(await countNamed(name)).toBe(1);
      }

      expect(await countNamed("Databases")).toBe(1);
    });
  });
});
