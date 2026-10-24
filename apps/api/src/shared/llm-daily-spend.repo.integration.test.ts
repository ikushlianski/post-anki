import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import { addDailySpendUsd, readDailySpendUsd } from "./llm-daily-spend.repo.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";
const TEST_DB_NAME = `spend_cap_test_${randomUUID().replace(/-/g, "_")}`;

assertLocalDbTarget(BASE_DATABASE_URL);

const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${TEST_DB_NAME}`;

let adminPool: pg.Pool;
let poolA: pg.Pool;
let poolB: pg.Pool;
let dbA: ReturnType<typeof drizzle<typeof schema>>;
let dbB: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  poolA = new pg.Pool({ connectionString: url.toString() });
  poolB = new pg.Pool({ connectionString: url.toString() });
  dbA = drizzle(poolA, { schema });
  dbB = drizzle(poolB, { schema });
  await migrate(drizzle(poolA), {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
});

afterAll(async () => {
  await poolA?.end();
  await poolB?.end();
  await adminPool?.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await adminPool?.end();
});

describe("llm daily spend repo", () => {
  it("should report zero for a day nobody has spent on", async () => {
    expect(await readDailySpendUsd("2026-01-01", dbA)).toBe(0);
  });

  it("should add up spend written through two separate connections as one daily total", async () => {
    await addDailySpendUsd("2026-01-02", 0.25, dbA);
    const total = await addDailySpendUsd("2026-01-02", 0.5, dbB);

    expect(total).toBeCloseTo(0.75);
    expect(await readDailySpendUsd("2026-01-02", dbA)).toBeCloseTo(0.75);
  });

  it("should not lose spend when many calls record at the same moment", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => addDailySpendUsd("2026-01-03", 0.1, i % 2 ? dbA : dbB)),
    );

    expect(await readDailySpendUsd("2026-01-03", dbA)).toBeCloseTo(2);
  });

  it("should keep each UTC day's total separate", async () => {
    await addDailySpendUsd("2026-01-04", 1, dbA);

    expect(await readDailySpendUsd("2026-01-05", dbA)).toBe(0);
  });
});
