import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb, getDb } from "../db/client.js";

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

const dbName = `rpe_repo_${randomUUID().replace(/-/g, "_")}`;
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
const repo = await import("./review-point-event.repo.js");

afterAll(async () => {
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

beforeAll(() => {
  getDb();
});

function award(
  knowledgeBitId: string,
  reviewId: string,
  at: string,
  extra: Partial<Parameters<typeof repo.awardReviewPointInTx>[1]> = {},
) {
  return getDb().transaction((tx) =>
    repo.awardReviewPointInTx(tx, {
      reviewId,
      knowledgeBitId,
      reviewedAt: new Date(at),
      intervalDaysAfter: 1,
      ...extra,
    }),
  );
}

describe("review point ledger (real Postgres)", () => {
  it("should count one award when the same review is awarded twice", async () => {
    const bit = `kb_${randomUUID()}`;
    const reviewId = `r_${randomUUID()}`;

    const first = await award(bit, reviewId, "2026-10-10T10:00:00Z");
    const second = await award(bit, reviewId, "2026-10-10T10:00:05Z");

    expect(first).toEqual(second);
    expect(await repo.sumPointsForDay("2026-10-10")).toBe(1);
  });

  it("should pay every review of the same card the same day in full", async () => {
    const bit = `kb_${randomUUID()}`;

    for (let i = 0; i < 8; i += 1) {
      await award(bit, `r_${randomUUID()}`, `2026-11-01T0${i}:00:00Z`);
    }

    expect(await repo.sumPointsForDay("2026-11-01")).toBe(8);
  });

  it("should net a single award when a review is voided and the card regraded", async () => {
    const bit = `kb_${randomUUID()}`;
    const first = `r_${randomUUID()}`;

    await award(bit, first, "2026-12-01T08:00:00Z");
    await getDb().transaction((tx) =>
      repo.voidPointEventByReviewIdInTx(tx, first, new Date("2026-12-01T08:02:00Z")),
    );
    await award(bit, `r_${randomUUID()}`, "2026-12-01T08:03:00Z");

    expect(await repo.sumPointsForDay("2026-12-01")).toBe(1);
  });

  it("should keep a card mastered after a later lapse, and drop it when its review is voided", async () => {
    const bit = `kb_${randomUUID()}`;
    const before = await repo.countMasteredCards();
    const matured = `r_${randomUUID()}`;

    await award(bit, matured, "2027-01-01T08:00:00Z", { intervalDaysAfter: 25 });
    await award(bit, `r_${randomUUID()}`, "2027-01-30T08:00:00Z", { intervalDaysAfter: 1 });

    expect(await repo.countMasteredCards()).toBe(before + 1);

    await getDb().transaction((tx) => repo.voidPointEventByReviewIdInTx(tx, matured, new Date()));

    expect(await repo.countMasteredCards()).toBe(before);
  });

  it("should count live reviews in total and per subject, ignoring voided ones", async () => {
    const bit = `kb_${randomUUID()}`;
    const before = await repo.countReviews();
    const voided = `r_${randomUUID()}`;

    await award(bit, `r_${randomUUID()}`, "2027-02-01T08:00:00Z");
    await award(bit, voided, "2027-02-01T09:00:00Z");
    await getDb().transaction((tx) => repo.voidPointEventByReviewIdInTx(tx, voided, new Date()));

    expect(await repo.countReviews()).toBe(before + 1);
  });
});
