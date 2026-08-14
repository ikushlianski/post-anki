import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIOS 1, 6, 7, 9, 10 (.planning/33-untriaged-gaps-auto-defer/scenarios.md)
// — the real-Postgres proof for the sweep's persisted flip (AC 15-17, 36, 37),
// the markGapResurfaced regression guard (AC 34 — "the highest-value
// regression test in the story"), the sweep's ORDER BY untriaged_since
// starvation guard (AC 37a), and idempotency (AC 37). Harness mirrors
// gap-triage-concurrency.integration.test.ts exactly: dedicated throwaway
// Postgres database, real transactions, no mocked DB layer.

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

const dbName = `gap_auto_defer_${randomUUID().replace(/-/g, "_")}`;
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

const { markGapResurfaced, triageGapLocked, sweepAutoDeferredGaps, SWEEP_BATCH_LIMIT } =
  await import("./gap-triage.repo.js");

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

async function seedTopic(): Promise<{ topicId: string }> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Auto-defer test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Auto-defer test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Auto-defer test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Auto-defer test topic"],
  );

  return { topicId };
}

async function seedGap(
  topicId: string,
  overrides: Partial<{
    label: string;
    triageState: string;
    untriagedSince: Date;
    deferredUntil: Date | null;
  }> = {},
): Promise<string> {
  const gapId = id("gap");

  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin, triage_state, untriaged_since, deferred_until)
     VALUES ($1, $2, $3, 'open', 'user', $4, $5, $6)`,
    [
      gapId,
      topicId,
      overrides.label ?? "Auto-defer test gap",
      overrides.triageState ?? "untriaged",
      overrides.untriagedSince ?? new Date(),
      overrides.deferredUntil ?? null,
    ],
  );

  return gapId;
}

async function readGap(gapId: string) {
  const { rows } = await client.query(
    `SELECT triage_state, untriaged_since, auto_deferred_at, triaged_at FROM gaps WHERE id = $1`,
    [gapId],
  );

  return rows[0]!;
}

describe("SCENARIO 1 — a gap the user never touches quietly files itself away", () => {
  it("the sweep flips a 3-day-old untriaged gap to auto_deferred, stamps auto_deferred_at, leaves triaged_at null (AC 15-17, 36)", async () => {
    const { topicId } = await seedTopic();
    const monday = new Date("2026-05-25T21:00:00.000Z");
    const gapId = await seedGap(topicId, { untriagedSince: monday });

    const thursday = "2026-05-28T21:00:00.000Z";
    const result = await sweepAutoDeferredGaps(thursday);

    expect(result).toEqual({ autoDeferred: 1, capped: false });

    const row = await readGap(gapId);

    expect(row.triage_state).toBe("auto_deferred");
    expect(row.auto_deferred_at.toISOString()).toBe(thursday);
    expect(row.triaged_at).toBeNull();
  });
});

describe("SCENARIO 6 — a 60-day deferral expires and does not get instantly auto-filed (AC 34)", () => {
  it("markGapResurfaced('deferral-expired') resets untriaged_since, so the very next sweep is a no-op", async () => {
    const { topicId } = await seedTopic();
    const staleUntriagedSince = new Date("2026-01-01T00:00:00.000Z");
    const gapId = await seedGap(topicId, {
      triageState: "user_deferred",
      untriagedSince: staleUntriagedSince,
      deferredUntil: new Date("2026-05-28T00:00:00.000Z"),
    });

    const resurfacedAt = "2026-05-28T08:00:00.000Z";

    await markGapResurfaced(gapId, "deferral-expired", resurfacedAt);

    const afterResurface = await readGap(gapId);

    expect(afterResurface.triage_state).toBe("untriaged");
    expect(afterResurface.untriaged_since.toISOString()).toBe(resurfacedAt);

    // The next morning's sweep must NOT auto-defer it — it just got its full
    // 3-day window back.
    const nextMorning = "2026-05-29T06:00:00.000Z";
    const sweepResult = await sweepAutoDeferredGaps(nextMorning);

    expect(sweepResult.autoDeferred).toBe(0);

    const afterSweep = await readGap(gapId);

    expect(afterSweep.triage_state).toBe("untriaged");
  });
});

describe("SCENARIO 7 — a returning user finds their gaps already handled", () => {
  it("three gaps left untriaged for five days are all auto_deferred by one sweep", async () => {
    const { topicId } = await seedTopic();
    const fiveDaysAgo = new Date("2026-05-23T00:00:00.000Z");

    const gapIds = await Promise.all([
      seedGap(topicId, { label: "gap one", untriagedSince: fiveDaysAgo }),
      seedGap(topicId, { label: "gap two", untriagedSince: fiveDaysAgo }),
      seedGap(topicId, { label: "gap three", untriagedSince: fiveDaysAgo }),
    ]);

    const now = "2026-05-28T06:00:00.000Z";
    const result = await sweepAutoDeferredGaps(now);

    expect(result.autoDeferred).toBe(3);

    for (const gapId of gapIds) {
      const row = await readGap(gapId);

      expect(row.triage_state).toBe("auto_deferred");
    }
  });
});

describe("SCENARIO 9 — a sweep racing a concurrent triage tap", () => {
  it("if the tap wins the lock first, the gap ends important, never auto_deferred", async () => {
    const { topicId } = await seedTopic();
    const threeDaysAgo = new Date("2026-05-25T00:00:00.000Z");
    const gapId = await seedGap(topicId, { untriagedSince: threeDaysAgo });

    const now = "2026-05-28T06:00:00.000Z";

    await triageGapLocked(gapId, "important", now);

    const result = await sweepAutoDeferredGaps(now);

    // The gap is no longer `untriaged` by the time the sweep's candidate
    // query runs, so it is not touched at all.
    expect(result.autoDeferred).toBe(0);

    const row = await readGap(gapId);

    expect(row.triage_state).toBe("important");
  });
});

describe("sweepAutoDeferredGaps — idempotency (AC 37)", () => {
  it("running it twice with the same now flips gaps on the first run, reports 0 on the second", async () => {
    const { topicId } = await seedTopic();
    const threeDaysAgo = new Date("2026-05-25T00:00:00.000Z");
    const gapId = await seedGap(topicId, { untriagedSince: threeDaysAgo });

    const now = "2026-05-28T06:00:00.000Z";

    const first = await sweepAutoDeferredGaps(now);

    expect(first.autoDeferred).toBe(1);

    const second = await sweepAutoDeferredGaps(now);

    expect(second.autoDeferred).toBe(0);

    const row = await readGap(gapId);

    expect(row.triage_state).toBe("auto_deferred");
  });
});

describe("sweepAutoDeferredGaps — candidate ordering under a backlog larger than the cap (AC 37a)", () => {
  it(
    `seeding SWEEP_BATCH_LIMIT + 5 untriaged gaps where only the 5 oldest are due flips all 5 in one run`,
    async () => {
      const { topicId } = await seedTopic();
      const now = "2026-05-28T06:00:00.000Z";

      // The 5 oldest — due (untriagedSince 4 days before `now`).
      const dueUntriagedSince = new Date("2026-05-24T00:00:00.000Z");

      await client.query(
        `INSERT INTO gaps (id, topic_id, label, state, origin, triage_state, untriaged_since)
         SELECT
           'due_' || gs::text || '_${randomUUID().replace(/-/g, "")}',
           $1,
           'due gap ' || gs::text,
           'open',
           'user',
           'untriaged',
           $2
         FROM generate_series(1, 5) AS gs`,
        [topicId, dueUntriagedSince],
      );

      // SWEEP_BATCH_LIMIT more — NOT due (untriagedSince is `now` itself),
      // and each one second newer than the last so ordering is deterministic
      // and every one of them sorts after the 5 due rows above.
      await client.query(
        `INSERT INTO gaps (id, topic_id, label, state, origin, triage_state, untriaged_since)
         SELECT
           'notdue_' || gs::text || '_${randomUUID().replace(/-/g, "")}',
           $1,
           'not-due gap ' || gs::text,
           'open',
           'user',
           'untriaged',
           $2::timestamptz + (gs::text || ' seconds')::interval
         FROM generate_series(1, ${SWEEP_BATCH_LIMIT}) AS gs`,
        [topicId, now],
      );

      const result = await sweepAutoDeferredGaps(now);

      expect(result.autoDeferred).toBe(5);
      expect(result.capped).toBe(true);

      const { rows: dueRows } = await client.query(
        `SELECT triage_state FROM gaps WHERE topic_id = $1 AND label LIKE 'due gap%'`,
        [topicId],
      );

      expect(dueRows.every((r) => r.triage_state === "auto_deferred")).toBe(true);

      // Running the sweep again must make further progress, not repeat the
      // same starved batch forever.
      const second = await sweepAutoDeferredGaps(now);

      expect(second.autoDeferred).toBe(0);
      expect(second.capped).toBe(true);
    },
    30_000,
  );
});
