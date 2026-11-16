import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const dbName = `knowledge_bit_card_difficulty_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { cardIsDifficultSql, listDifficultPlainCards } = await import(
  "./knowledge-bit-card-difficulty.repo.js"
);
const { getDb } = await import("../db/client.js");
const { sql } = await import("drizzle-orm");

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

const NOW = new Date("2026-06-30T12:00:00.000Z");
const DAY_MS = 86_400_000;

type Grade = "again" | "hard" | "good" | "easy";

interface SeedReview {
  grade: Grade;
  daysAgo: number;
  prevInterval?: number;
  undone?: boolean;
}

async function seedCard(reviews: SeedReview[], subjectId = "subj_a"): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'x', 'pending', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, $3, $4)`,
    [variantId, bitId, `front ${bitId}`, `back ${bitId}`],
  );

  for (const review of reviews) {
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, prev_schedule, reviewed_at, undone_at, card_key)
       VALUES ($1, $2, $3, $4, false, $5, $6, $7, '')`,
      [
        `kbr_${randomUUID()}`,
        bitId,
        variantId,
        review.grade,
        JSON.stringify({ intervalDays: review.prevInterval ?? 1 }),
        new Date(NOW.getTime() - review.daysAgo * DAY_MS),
        review.undone ? NOW : null,
      ],
    );
  }

  return bitId;
}

async function isDifficult(bitId: string): Promise<boolean> {
  const result = await getDb().execute<{ difficult: boolean }>(
    sql`select ${cardIsDifficultSql(sql`${bitId}::text`, sql`''`, NOW)} as difficult`,
  );

  return result.rows[0]?.difficult ?? false;
}

describe("cardIsDifficultSql (real Postgres)", () => {
  it("should flag a card with two Agains once it has 4 reviews over 7+ days", async () => {
    const bitId = await seedCard([
      { grade: "again", daysAgo: 20 },
      { grade: "good", daysAgo: 15 },
      { grade: "again", daysAgo: 10 },
      { grade: "good", daysAgo: 5 },
    ]);

    expect(await isDifficult(bitId)).toBe(true);
  });

  it("should flag a card where at least half of the reviews were Again or Hard", async () => {
    const bitId = await seedCard([
      { grade: "hard", daysAgo: 20 },
      { grade: "good", daysAgo: 15 },
      { grade: "hard", daysAgo: 10 },
      { grade: "good", daysAgo: 5 },
    ]);

    expect(await isDifficult(bitId)).toBe(true);
  });

  it("should flag a card forgotten after it had gone 3+ days between reviews", async () => {
    const bitId = await seedCard([
      { grade: "good", daysAgo: 20 },
      { grade: "good", daysAgo: 15 },
      { grade: "good", daysAgo: 10 },
      { grade: "again", daysAgo: 5, prevInterval: 3 },
    ]);

    expect(await isDifficult(bitId)).toBe(true);
  });

  it("should not flag a card that was only forgotten right after a short gap", async () => {
    const bitId = await seedCard([
      { grade: "good", daysAgo: 20 },
      { grade: "good", daysAgo: 15 },
      { grade: "good", daysAgo: 10 },
      { grade: "again", daysAgo: 5, prevInterval: 2 },
    ]);

    expect(await isDifficult(bitId)).toBe(false);
  });

  it("should not flag a struggling card with fewer than 4 reviews", async () => {
    const bitId = await seedCard([
      { grade: "again", daysAgo: 20 },
      { grade: "again", daysAgo: 15 },
      { grade: "again", daysAgo: 10 },
    ]);

    expect(await isDifficult(bitId)).toBe(false);
  });

  it("should not flag a struggling card whose first review is under 7 days old", async () => {
    const bitId = await seedCard([
      { grade: "again", daysAgo: 6 },
      { grade: "again", daysAgo: 5 },
      { grade: "again", daysAgo: 4 },
      { grade: "again", daysAgo: 3 },
    ]);

    expect(await isDifficult(bitId)).toBe(false);
  });

  it("should ignore undone reviews when judging difficulty", async () => {
    const bitId = await seedCard([
      { grade: "good", daysAgo: 20 },
      { grade: "good", daysAgo: 15 },
      { grade: "good", daysAgo: 10 },
      { grade: "good", daysAgo: 8 },
      { grade: "again", daysAgo: 6, undone: true },
      { grade: "again", daysAgo: 5, undone: true },
    ]);

    expect(await isDifficult(bitId)).toBe(false);
  });

  it("should retire a difficult card after two Good/Easy reviews at 7+ day gaps", async () => {
    const bitId = await seedCard([
      { grade: "again", daysAgo: 40 },
      { grade: "again", daysAgo: 35 },
      { grade: "good", daysAgo: 20, prevInterval: 7 },
      { grade: "easy", daysAgo: 5, prevInterval: 14 },
    ]);

    expect(await isDifficult(bitId)).toBe(false);
  });

  it("should keep a card difficult when a recent Good came after a gap shorter than 7 days", async () => {
    const bitId = await seedCard([
      { grade: "again", daysAgo: 40 },
      { grade: "again", daysAgo: 35 },
      { grade: "good", daysAgo: 20, prevInterval: 7 },
      { grade: "good", daysAgo: 5, prevInterval: 6 },
    ]);

    expect(await isDifficult(bitId)).toBe(true);
  });

  it("should make a retired card difficult again after a later Again", async () => {
    const bitId = await seedCard([
      { grade: "again", daysAgo: 60 },
      { grade: "again", daysAgo: 55 },
      { grade: "good", daysAgo: 40, prevInterval: 7 },
      { grade: "easy", daysAgo: 20, prevInterval: 14 },
      { grade: "again", daysAgo: 1, prevInterval: 30 },
    ]);

    expect(await isDifficult(bitId)).toBe(true);
  });
});

describe("listDifficultPlainCards (real Postgres)", () => {
  it("should list only difficult cards of the requested subjects with their front and back", async () => {
    const struggling: SeedReview[] = [
      { grade: "again", daysAgo: 20 },
      { grade: "good", daysAgo: 15 },
      { grade: "again", daysAgo: 10 },
      { grade: "good", daysAgo: 5 },
    ];
    const wantedId = await seedCard(struggling, "subj_list");
    const otherSubjectId = await seedCard(struggling, "subj_other");
    const easyId = await seedCard(
      [
        { grade: "good", daysAgo: 20 },
        { grade: "good", daysAgo: 15 },
        { grade: "good", daysAgo: 10 },
        { grade: "good", daysAgo: 5 },
      ],
      "subj_list",
    );

    const rows = await listDifficultPlainCards(getDb(), {
      subjectIds: ["subj_list"],
      limit: 10,
      now: NOW,
    });

    expect(rows).toEqual([
      {
        bitId: wantedId,
        front: `front ${wantedId}`,
        back: `back ${wantedId}`,
        subjectId: "subj_list",
      },
    ]);
    expect(rows.map((row) => row.bitId)).not.toContain(otherSubjectId);
    expect(rows.map((row) => row.bitId)).not.toContain(easyId);
  });

  it("should respect the limit", async () => {
    const struggling: SeedReview[] = [
      { grade: "again", daysAgo: 20 },
      { grade: "again", daysAgo: 15 },
      { grade: "good", daysAgo: 10 },
      { grade: "good", daysAgo: 5 },
    ];

    await seedCard(struggling, "subj_limit");
    await seedCard(struggling, "subj_limit");

    const rows = await listDifficultPlainCards(getDb(), {
      subjectIds: ["subj_limit"],
      limit: 1,
      now: NOW,
    });

    expect(rows).toHaveLength(1);
  });
});
