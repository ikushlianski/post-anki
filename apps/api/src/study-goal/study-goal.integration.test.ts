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

const dbName = `study_goal_${randomUUID().replace(/-/g, "_")}`;
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

const priorities = await import("./subject-priority.orchestrator.js");
const daily = await import("./study-goal-daily.orchestrator.js");
const addGoals = await import("./add-knowledge-goal.orchestrator.js");
const { handlePutDailyGoal } = await import("./study-goal-daily.controller.js");
const { handleDeleteSubjectPriority } = await import("./subject-priority.controller.js");
const { deleteSubject } = await import("../subject/subject.repo.js");
const { currentPeriodKey } = await import("@post-anki/shared");

const NOW = new Date("2090-03-10T12:00:00.000Z");
const QUERY = { period: undefined, tz: "UTC", includeDescendants: false } as const;

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
  await client.query(`DELETE FROM knowledge_bits`);
  await client.query(`DELETE FROM knowledge_sources`);
  await client.query(`DELETE FROM subject_priorities`);
  await client.query(`DELETE FROM add_knowledge_goals`);
  await client.query(`DELETE FROM study_goals`);
  await client.query(`DELETE FROM subjects`);
});

async function seedSubject(parentId: string | null = null): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [id, id, parentId]);

  return id;
}

async function seedSource(subjectId: string | null, createdAt: Date = NOW): Promise<string> {
  const id = `ks_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id, created_at) VALUES ($1, 'prose', 'source', $2, $3)`,
    [id, subjectId, createdAt],
  );

  return id;
}

async function seedBit(sourceId: string): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
    [id, sourceId],
  );

  return id;
}

async function seedReview(
  bitId: string,
  reviewedAt: Date,
  options: { wasNew?: boolean; undone?: boolean } = {},
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, undone_at) VALUES ($1, $2, $3, 'good', $4, $5, $6)`,
    [
      `kbreview_${randomUUID()}`,
      bitId,
      `kbqv_${randomUUID()}`,
      options.wasNew ?? false,
      reviewedAt,
      options.undone ? reviewedAt : null,
    ],
  );
}

async function seedCard(subjectId: string | null): Promise<string> {
  return seedBit(await seedSource(subjectId));
}

function fakeReq(body: unknown): http.IncomingMessage {
  return Object.assign(Readable.from([JSON.stringify(body)]), { headers: {} }) as unknown as http.IncomingMessage;
}

function fakeRes(): { res: http.ServerResponse; status: () => number } {
  let status = 0;
  const res = {
    writeHead: (code: number) => {
      status = code;
    },
    end: () => undefined,
  } as unknown as http.ServerResponse;

  return { res, status: () => status };
}

async function createPriority(
  subjectId: string,
  periodKind: "year" | "month" | "week",
  metric: "reviews" | "new_cards" | "notes" | "none" = "reviews",
  targetValue: number | null = 10,
) {
  const result = await priorities.createSubjectPriority(
    subjectId,
    {
      periodKind,
      periodKey: currentPeriodKey(periodKind, NOW, "UTC"),
      title: "Focus",
      targetMetric: metric,
      targetValue: metric === "none" ? null : targetValue,
    },
    "UTC",
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.priority;
}

describe("daily study goal (real Postgres)", () => {
  it("should not count an undone review toward today's goal", async () => {
    const bit = await seedCard(null);

    await seedReview(bit, NOW);
    await seedReview(bit, NOW, { undone: true });

    expect((await daily.readDailyGoalProgress("UTC", NOW)).doneToday).toBe(1);
  });

  it("should put a review made just after local midnight on the new day and not on the day before", async () => {
    const bit = await seedCard(null);
    const justAfterTokyoMidnight = new Date("2090-03-09T15:05:00.000Z");
    const justBeforeTokyoMidnight = new Date("2090-03-09T14:55:00.000Z");

    await seedReview(bit, justAfterTokyoMidnight);
    await seedReview(bit, justBeforeTokyoMidnight);

    const tokyoMorning = new Date("2090-03-09T16:00:00.000Z");
    const progress = await daily.readDailyGoalProgress("Asia/Tokyo", tokyoMorning);

    expect(progress.doneToday).toBe(1);
    expect(progress.dayEndsAt).toBe("2090-03-10T15:00:00.000Z");
  });

  it("should report the target as null until the learner sets one", async () => {
    expect((await daily.readDailyGoalProgress("UTC", NOW)).target).toBeNull();

    await daily.saveDailyGoal({ dailyReviewTarget: 50 });

    expect((await daily.readDailyGoalProgress("UTC", NOW)).target).toBe(50);
  });

  it("should leave the same goal after saving it twice", async () => {
    await daily.saveDailyGoal({ dailyReviewTarget: 30 });
    await daily.saveDailyGoal({ dailyReviewTarget: 30 });

    const { rows } = await client.query(`SELECT count(*)::int AS total FROM study_goals`);

    expect(rows[0].total).toBe(1);
    expect(await daily.readDailyGoal()).toEqual({ dailyReviewTarget: 30 });
  });

  it("should reject a non-positive target through the route handler", async () => {
    const { res, status } = fakeRes();

    await handlePutDailyGoal(fakeReq({ dailyReviewTarget: 0 }), res);

    expect(status()).toBe(400);
  });
});

describe("subject priorities (real Postgres)", () => {
  it("should roll a nested sub-subject's reviews and notes up to its parent for year, month and week", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);
    const bit = await seedCard(child);

    await seedReview(bit, NOW, { wasNew: true });
    await seedReview(bit, NOW);

    for (const kind of ["year", "month", "week"] as const) {
      const priority = await createPriority(parent, kind);

      expect(priority.progress).toEqual({ reviews: 2, newCards: 1, notes: 1 });
    }
  });

  it("should not count an undone review in a priority's progress", async () => {
    const subject = await seedSubject();
    const bit = await seedCard(subject);

    await seedReview(bit, NOW);
    await seedReview(bit, NOW, { undone: true });

    expect((await createPriority(subject, "week")).progress.reviews).toBe(1);
  });

  it("should count notes only inside the priority's period", async () => {
    const subject = await seedSubject();

    await seedSource(subject, NOW);
    await seedSource(subject, new Date("2090-03-01T12:00:00.000Z"));
    await seedSource(subject, new Date("2089-12-31T12:00:00.000Z"));

    expect((await createPriority(subject, "week", "notes")).progress.notes).toBe(1);
    expect((await createPriority(subject, "month", "notes")).progress.notes).toBe(2);
    expect((await createPriority(subject, "year", "notes")).progress.notes).toBe(2);
  });

  it("should ignore a source whose subject no longer exists", async () => {
    const subject = await seedSubject();

    await seedSource(`subj_${randomUUID()}`);

    expect((await createPriority(subject, "week", "notes")).progress.notes).toBe(0);
  });

  it("should mark a priority met once its numeric target is reached", async () => {
    const subject = await seedSubject();
    const bit = await seedCard(subject);

    await seedReview(bit, NOW);
    await seedReview(bit, NOW);

    expect((await createPriority(subject, "week", "reviews", 2)).targetMet).toBe(true);
    expect((await createPriority(subject, "week", "reviews", 3)).targetMet).toBe(false);
  });

  it("should let a text-only priority be ticked done and unticked by hand", async () => {
    const subject = await seedSubject();
    const priority = await createPriority(subject, "month", "none");

    const ticked = await priorities.updateSubjectPriority(priority.id, { done: true }, "UTC");

    expect(ticked.ok && ticked.priority.targetMet).toBe(true);

    const unticked = await priorities.updateSubjectPriority(priority.id, { done: false }, "UTC");

    expect(unticked.ok && unticked.priority.targetMet).toBe(false);
  });

  it("should refuse to create a priority for an unknown subject", async () => {
    const result = await priorities.createSubjectPriority(
      "missing",
      { periodKind: "year", periodKey: "2090", title: "x", targetMetric: "none", targetValue: null },
      "UTC",
    );

    expect(result).toEqual({ ok: false, error: "subject_not_found" });
    expect(await priorities.listSubjectPriorities("missing", QUERY)).toBeNull();
  });

  it("should refuse a week number the year does not have", async () => {
    const subject = await seedSubject();
    const result = await priorities.createSubjectPriority(
      subject,
      { periodKind: "week", periodKey: "2027-W53", title: "x", targetMetric: "none", targetValue: null },
      "UTC",
    );

    expect(result).toEqual({ ok: false, error: "invalid_period_key" });
  });

  it("should list a parent's own priorities, plus its children's only when asked", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);

    await createPriority(parent, "year", "none");
    await createPriority(child, "year", "none");

    expect((await priorities.listSubjectPriorities(parent, QUERY))?.priorities).toHaveLength(1);
    expect(
      (await priorities.listSubjectPriorities(parent, { ...QUERY, includeDescendants: true }))?.priorities,
    ).toHaveLength(2);
    expect(
      (await priorities.listSubjectPriorities(parent, { ...QUERY, period: "week" }))?.priorities,
    ).toHaveLength(0);
  });

  it("should answer 404 when deleting a priority that does not exist", async () => {
    const { res, status } = fakeRes();

    await handleDeleteSubjectPriority(res, "missing");

    expect(status()).toBe(404);
  });

  it("should remove a subject's priorities and add-knowledge goal when the subject is deleted", async () => {
    const subject = await seedSubject();

    await createPriority(subject, "year", "none");
    await addGoals.putGoal({ subjectId: subject, period: "week", targetNotes: 3 });
    await deleteSubject(subject);

    const priorityRows = await client.query(`SELECT 1 FROM subject_priorities`);
    const goalRows = await client.query(`SELECT 1 FROM add_knowledge_goals`);

    expect(priorityRows.rowCount).toBe(0);
    expect(goalRows.rowCount).toBe(0);
  });
});

describe("add-knowledge goals (real Postgres)", () => {
  it("should keep one goal per subject when the same subject is saved again", async () => {
    const subject = await seedSubject();

    await addGoals.putGoal({ subjectId: subject, period: "week", targetNotes: 3 });
    await addGoals.putGoal({ subjectId: subject, period: "day", targetNotes: 5 });

    expect(await addGoals.listGoals()).toEqual([
      expect.objectContaining({ subjectId: subject, period: "day", targetNotes: 5 }),
    ]);
  });

  it("should refuse a goal for an unknown subject", async () => {
    expect(await addGoals.putGoal({ subjectId: "missing", period: "week", targetNotes: 3 })).toBeNull();
  });

  it("should count this week's notes in the hot subject and its sub-subjects", async () => {
    const parent = await seedSubject();
    const child = await seedSubject(parent);

    await seedSource(child, NOW);
    await seedSource(parent, NOW);
    await seedSource(parent, new Date("2090-03-02T12:00:00.000Z"));
    await addGoals.putGoal({ subjectId: parent, period: "week", targetNotes: 5 });

    const [progress] = await addGoals.listGoalProgress("UTC", NOW);

    expect(progress).toMatchObject({ subjectId: parent, target: 5, added: 2 });
    expect(progress?.periodEndsAt).toBe("2090-03-13T00:00:00.000Z");
  });

  it("should show zero for a hot subject with no notes today", async () => {
    const subject = await seedSubject();

    await seedSource(subject, new Date("2090-03-09T12:00:00.000Z"));
    await addGoals.putGoal({ subjectId: subject, period: "day", targetNotes: 1 });

    expect((await addGoals.listGoalProgress("UTC", NOW))[0]?.added).toBe(0);
  });

  it("should drop a goal whose subject no longer exists from progress", async () => {
    await client.query(`INSERT INTO add_knowledge_goals (id, subject_id, period, target_notes) VALUES ('g1', 'gone', 'week', 2)`);

    expect(await addGoals.listGoalProgress("UTC", NOW)).toEqual([]);
  });
});

describe("current priorities (real Postgres)", () => {
  it("should list only this week's priorities across subjects and leave other weeks out", async () => {
    const first = await seedSubject();
    const second = await seedSubject();
    const bit = await seedCard(first);

    await seedReview(bit, NOW);
    await createPriority(first, "week", "reviews", 1);
    await createPriority(second, "week", "none");
    await createPriority(second, "month", "none");
    await priorities.createSubjectPriority(
      second,
      { periodKind: "week", periodKey: "2090-W01", title: "old", targetMetric: "none", targetValue: null },
      "UTC",
    );

    const list = await priorities.listCurrentPriorities("week", "UTC", NOW);

    expect(list.priorities).toHaveLength(2);
    expect(list.priorities.find((priority) => priority.subjectId === first)?.targetMet).toBe(true);
  });
});
