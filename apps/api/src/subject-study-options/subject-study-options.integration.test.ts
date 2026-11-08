import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `study_options_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: databaseUrl.toString() });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = databaseUrl.toString();
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { getKnowledgeBitReviewQueue } = await import("../knowledge-bit/knowledge-bit-review-queue.repo.js");
const { recordKnowledgeBitReview } = await import("../knowledge-bit/knowledge-bit-review.orchestrator.js");
const { updateAdminSettings, getAdminSettings } = await import("../admin-settings/admin-settings.repo.js");
const { readSubjectStudyOptions, updateSubjectStudyOptions } = await import(
  "./subject-study-options.orchestrator.js"
);
const { handleUpdateSubjectStudyOptions } = await import("./subject-study-options.controller.js");

const NOW = new Date("2090-03-10T12:00:00.000Z");
const CLOCK = { tz: "UTC", now: NOW };

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: databaseUrl.toString() });
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

beforeEach(async () => {
  await client.query(`DELETE FROM knowledge_bit_reviews`);
  await client.query(`DELETE FROM knowledge_bit_schedules`);
  await client.query(`DELETE FROM knowledge_bit_question_variants`);
  await client.query(`DELETE FROM knowledge_bits`);
  await client.query(`DELETE FROM knowledge_sources`);
  await client.query(`DELETE FROM subjects`);
  await client.query(`DELETE FROM app_settings`);
});

async function seedSubject(parentId: string | null = null): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [id, id, parentId]);

  return id;
}

async function seedCard(subjectId: string | null): Promise<{ bitId: string; variantId: string }> {
  const sourceId = `ks_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) VALUES ($1, 'prose', 'source', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [bitId, sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'Q?', 'A.')`,
    [variantId, bitId],
  );

  return { bitId, variantId };
}

async function seedCards(subjectId: string | null, total: number): Promise<void> {
  for (let i = 0; i < total; i++) {
    await seedCard(subjectId);
  }
}

async function seedNewReviews(bitId: string, total: number): Promise<void> {
  for (let i = 0; i < total; i++) {
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at) VALUES ($1, $2, $3, 'good', true, $4)`,
      [`kbreview_${randomUUID()}`, bitId, `kbqv_${randomUUID()}`, NOW],
    );
  }
}

async function patchStatus(subjectId: string, body: unknown): Promise<number> {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), {
    headers: {},
  }) as unknown as http.IncomingMessage;
  let status = 0;
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: () => undefined,
  } as unknown as http.ServerResponse;

  await handleUpdateSubjectStudyOptions(req, res, subjectId);

  return status;
}

describe("subject study options storage (real Postgres)", () => {
  it("migration: should leave every existing subject with null overrides and existing app settings with defaults", async () => {
    const subjectId = await seedSubject();
    await client.query(`INSERT INTO app_settings (id) VALUES ('app')`);

    const { rows } = await client.query(
      `SELECT new_cards_per_day, learning_steps_minutes, relearning_steps_minutes, desired_retention FROM subjects WHERE id = $1`,
      [subjectId],
    );
    const settings = await getAdminSettings();

    expect(rows[0]).toEqual({
      new_cards_per_day: null,
      learning_steps_minutes: null,
      relearning_steps_minutes: null,
      desired_retention: null,
    });
    expect(settings).toMatchObject({
      newCardsPerDay: 20,
      learningStepsMinutes: [1, 10],
      relearningStepsMinutes: [10],
      desiredRetention: 0.9,
    });
  });

  it("should use the parent subject's new-card limit when the child has none", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);

    await updateSubjectStudyOptions(parent, { newCardsPerDay: 7 });

    const result = await readSubjectStudyOptions(child);

    expect(result?.effective.newCardsPerDay).toBe(7);
    expect(result?.sources.newCardsPerDay).toBe(parent);
    expect(result?.own.newCardsPerDay).toBeNull();
  });

  it("should let a child override only learning steps while inheriting the rest", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);

    await updateSubjectStudyOptions(parent, { newCardsPerDay: 7, desiredRetention: 0.85 });
    await updateSubjectStudyOptions(child, { learningStepsMinutes: [5, 30] });

    const result = await readSubjectStudyOptions(child);

    expect(result?.effective).toEqual({
      newCardsPerDay: 7,
      maxReviewsPerDay: 200,
      learningStepsMinutes: [5, 30],
      relearningStepsMinutes: [10],
      desiredRetention: 0.85,
    });
  });

  it("should fall back to app defaults when no subject in the chain sets a value", async () => {
    const subject = await seedSubject();

    await updateAdminSettings({ newCardsPerDay: 33 });

    const result = await readSubjectStudyOptions(subject);

    expect(result?.effective.newCardsPerDay).toBe(33);
    expect(result?.sources.newCardsPerDay).toBe("app");
  });

  it("should inherit the review cap own, then ancestor, then app-wide, and re-inherit when cleared", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);

    expect((await readSubjectStudyOptions(child))?.sources.maxReviewsPerDay).toBe("app");
    expect((await readSubjectStudyOptions(child))?.effective.maxReviewsPerDay).toBe(200);

    await updateSubjectStudyOptions(parent, { maxReviewsPerDay: 80 });

    const inherited = await readSubjectStudyOptions(child);

    expect(inherited?.effective.maxReviewsPerDay).toBe(80);
    expect(inherited?.sources.maxReviewsPerDay).toBe(parent);
    expect(inherited?.own.maxReviewsPerDay).toBeNull();

    await updateSubjectStudyOptions(child, { maxReviewsPerDay: 0 });

    const own = await readSubjectStudyOptions(child);

    expect(own?.effective.maxReviewsPerDay).toBe(0);
    expect(own?.own.maxReviewsPerDay).toBe(0);
    expect(own?.sources.maxReviewsPerDay).toBe(child);

    await updateSubjectStudyOptions(child, { maxReviewsPerDay: null });

    expect((await readSubjectStudyOptions(child))?.effective.maxReviewsPerDay).toBe(80);
  });

  it("should follow the app-wide review cap when no subject sets one", async () => {
    const subject = await seedSubject();

    await updateAdminSettings({ maxReviewsPerDay: 45 });

    const result = await readSubjectStudyOptions(subject);

    expect(result?.effective.maxReviewsPerDay).toBe(45);
    expect(result?.sources.maxReviewsPerDay).toBe("app");
  });

  it("should re-inherit when an override is cleared with null", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);

    await updateSubjectStudyOptions(parent, { newCardsPerDay: 7 });
    await updateSubjectStudyOptions(child, { newCardsPerDay: 3 });

    expect((await readSubjectStudyOptions(child))?.effective.newCardsPerDay).toBe(3);

    await updateSubjectStudyOptions(child, { newCardsPerDay: null });

    expect((await readSubjectStudyOptions(child))?.effective.newCardsPerDay).toBe(7);
  });

  it("should answer not found for an unknown subject", async () => {
    expect(await readSubjectStudyOptions("subj_missing")).toBeNull();
    expect(await updateSubjectStudyOptions("subj_missing", { newCardsPerDay: 5 })).toBeNull();
    expect(await patchStatus("subj_missing", { newCardsPerDay: 5 })).toBe(404);
  });

  it("should reject an empty or out-of-range steps list with 400", async () => {
    const subject = await seedSubject();

    expect(await patchStatus(subject, { learningStepsMinutes: [] })).toBe(400);
    expect(await patchStatus(subject, { learningStepsMinutes: [0] })).toBe(400);
    expect(await patchStatus(subject, { relearningStepsMinutes: [99999] })).toBe(400);
    expect(await patchStatus(subject, {})).toBe(400);
    expect((await readSubjectStudyOptions(subject))?.own.learningStepsMinutes).toBeNull();
  });
});

describe("per-subject new-card cap (real Postgres)", () => {
  it("should cap new cards per subject independently so one full subject does not block another", async () => {
    const full = await seedSubject();
    const light = await seedSubject();

    await updateSubjectStudyOptions(full, { newCardsPerDay: 2 });
    await updateSubjectStudyOptions(light, { newCardsPerDay: 5 });
    await seedCards(full, 4);
    await seedCards(light, 4);

    const { bitId } = await seedCard(full);
    await seedNewReviews(bitId, 2);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);
    const bySubject = new Map<string | null, number>();

    for (const card of queue.cards) {
      bySubject.set(card.subjectId, (bySubject.get(card.subjectId) ?? 0) + 1);
    }

    expect(bySubject.get(full)).toBeUndefined();
    expect(bySubject.get(light)).toBe(4);
    expect(queue.newLimitReached).toBe(true);
  });

  it("should serve new cards of a child subject up to its inherited parent limit", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);

    await updateSubjectStudyOptions(parent, { newCardsPerDay: 3 });
    await seedCards(child, 6);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(3);
    expect(queue.counts.new).toBe(3);
  });

  it("should treat an unplaced card as using app defaults", async () => {
    await updateAdminSettings({ newCardsPerDay: 4 });
    await seedCards(null, 9);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.cards).toHaveLength(4);
  });

  it("should show remaining new cards as zero, not negative, when the limit is lowered below today's count", async () => {
    const subject = await seedSubject();
    const { bitId } = await seedCard(subject);

    await seedNewReviews(bitId, 6);
    await updateSubjectStudyOptions(subject, { newCardsPerDay: 2 });
    await seedCards(subject, 2);

    const queue = await getKnowledgeBitReviewQueue(500, undefined, CLOCK);

    expect(queue.newRemainingToday).toBe(0);
    expect(queue.cards).toHaveLength(0);
  });
});

describe("grading with subject study options (real Postgres)", () => {
  it("should space learning repeats by the subject's steps for a new card", async () => {
    const subject = await seedSubject();
    const { variantId } = await seedCard(subject);

    await updateSubjectStudyOptions(subject, { learningStepsMinutes: [5, 30] });

    const result = await recordKnowledgeBitReview({ variantId, grade: "again" }, NOW);

    expect(result.ok && new Date(result.dueAt).getTime() - NOW.getTime()).toBe(5 * 60_000);
  });

  it("should not move already-scheduled due dates when options change", async () => {
    const subject = await seedSubject();
    const { bitId, variantId } = await seedCard(subject);

    await recordKnowledgeBitReview({ variantId, grade: "again" }, NOW);

    const before = await client.query(`SELECT due_at FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`, [bitId]);

    await updateSubjectStudyOptions(subject, { learningStepsMinutes: [90], newCardsPerDay: 1 });

    const after = await client.query(`SELECT due_at FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1`, [bitId]);

    expect(after.rows[0].due_at).toEqual(before.rows[0].due_at);
  });

  it("should store the detail level and hinting per subject and let the learner clear them", async () => {
    const subject = await seedSubject();

    await updateSubjectStudyOptions(subject, { detailLevel: "deep", hintingEnabled: false });

    const saved = await readSubjectStudyOptions(subject);

    expect(saved?.own.detailLevel).toBe("deep");
    expect(saved?.own.hintingEnabled).toBe(false);

    await updateSubjectStudyOptions(subject, { detailLevel: null, hintingEnabled: null });

    const cleared = await readSubjectStudyOptions(subject);

    expect(cleared?.own.detailLevel).toBeNull();
    expect(cleared?.own.hintingEnabled).toBeNull();
  });
});
