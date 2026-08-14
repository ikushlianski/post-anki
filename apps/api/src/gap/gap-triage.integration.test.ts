import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// SCENARIOS 1, 5, 6, 8 (.planning/2026-08-14-gap-triage/scenarios.md) — the
// real-Postgres proof for the triage write path's transaction (AC17), the
// due-for-resurface read-only query (AC18), both mark-resurfaced outcomes
// (AC19), and that dismissing a gap never blocks a fresh re-discovery of
// the same label from getting its own row while the dismissed row survives
// untouched as audit history (AC20). Harness mirrors
// gap-mastery-cascade-delete.integration.test.ts exactly: a dedicated,
// freshly-migrated throwaway Postgres database, real transactions, no
// mocked DB layer.

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

const dbName = `gap_triage_${randomUUID().replace(/-/g, "_")}`;
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

const { triageGapLocked, listGapsDueForResurface, markGapResurfaced } = await import(
  "./gap-triage.repo.js"
);
const { insertDiscoveredGaps } = await import("./gap.repo.js");

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

interface SeededTopic {
  topicId: string;
}

async function seedTopic(): Promise<SeededTopic> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Gap triage test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Gap triage test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Gap triage test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Gap triage test topic"],
  );

  return { topicId };
}

async function seedGap(
  topicId: string,
  overrides: Partial<{
    label: string;
    triageState: string;
    deferredUntil: Date | null;
    dismissedAt: Date | null;
    dismissedCheckinSentAt: Date | null;
  }> = {},
): Promise<string> {
  const gapId = id("gap");

  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin, triage_state, deferred_until, dismissed_at, dismissed_checkin_sent_at)
     VALUES ($1, $2, $3, 'open', 'user', $4, $5, $6, $7)`,
    [
      gapId,
      topicId,
      overrides.label ?? "Gap triage test gap",
      overrides.triageState ?? "untriaged",
      overrides.deferredUntil ?? null,
      overrides.dismissedAt ?? null,
      overrides.dismissedCheckinSentAt ?? null,
    ],
  );

  return gapId;
}

describe("SCENARIO 1 — triageGapLocked commits inside a real transaction", () => {
  it("returns the post-transition row, not a stale pre-lock read (AC17)", async () => {
    const { topicId } = await seedTopic();
    const gapId = await seedGap(topicId);

    const result = await triageGapLocked(gapId, "important", new Date().toISOString());

    expect(result?.changed).toBe(true);
    expect(result?.gap.triageState).toBe("important");

    const { rows } = await client.query(`SELECT triage_state FROM gaps WHERE id = $1`, [gapId]);

    expect(rows[0]!.triage_state).toBe("important");
  }, 30_000);

  it("returns null for a gap id that does not exist", async () => {
    const result = await triageGapLocked("gap_missing", "important", new Date().toISOString());

    expect(result).toBeNull();
  }, 30_000);
});

describe("SCENARIO 5/6 — listGapsDueForResurface is read-only (AC18)", () => {
  it("returns the identical candidate set across two calls with no intervening mark-resurfaced", async () => {
    const { topicId } = await seedTopic();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await seedGap(topicId, { triageState: "user_deferred", deferredUntil: past });

    const first = await listGapsDueForResurface(new Date().toISOString());
    const second = await listGapsDueForResurface(new Date().toISOString());

    expect(first.userDeferredDue).toHaveLength(1);
    expect(second.userDeferredDue).toHaveLength(1);
    expect(first.userDeferredDue[0]!.gap.id).toBe(second.userDeferredDue[0]!.gap.id);
  }, 30_000);
});

describe("SCENARIO 5/6 — markGapResurfaced (AC19)", () => {
  it("deferral-expired resets triageState to untriaged and clears deferredUntil", async () => {
    const { topicId } = await seedTopic();
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const gapId = await seedGap(topicId, { triageState: "user_deferred", deferredUntil: past });

    await markGapResurfaced(gapId, "deferral-expired", new Date().toISOString());

    const { rows } = await client.query(
      `SELECT triage_state, deferred_until FROM gaps WHERE id = $1`,
      [gapId],
    );

    expect(rows[0]!.triage_state).toBe("untriaged");
    expect(rows[0]!.deferred_until).toBeNull();
  }, 30_000);

  it("dismissed-checkin only stamps the sent flag, leaving triageState at dismissed", async () => {
    const { topicId } = await seedTopic();
    const gapId = await seedGap(topicId, {
      triageState: "dismissed",
      dismissedAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    });

    await markGapResurfaced(gapId, "dismissed-checkin", new Date().toISOString());

    const { rows } = await client.query(
      `SELECT triage_state, dismissed_checkin_sent_at FROM gaps WHERE id = $1`,
      [gapId],
    );

    expect(rows[0]!.triage_state).toBe("dismissed");
    expect(rows[0]!.dismissed_checkin_sent_at).not.toBeNull();

    // The one-time-only effect: after the flag is stamped, the same gap
    // never appears due again.
    const dueAfter = await listGapsDueForResurface(new Date().toISOString());

    expect(dueAfter.dismissedCheckinDue.find((c) => c.gap.id === gapId)).toBeUndefined();
  }, 30_000);
});

describe("SCENARIO 8 — a fresh discovery of a previously-dismissed label creates a new row (AC20)", () => {
  it("preserves the dismissed row's triage fields untouched while inserting a distinct new gap row", async () => {
    const { topicId } = await seedTopic();
    const dismissedAt = new Date("2026-01-01T00:00:00.000Z");
    const checkinSentAt = new Date("2026-02-01T00:00:00.000Z");
    const gapId = await seedGap(topicId, {
      label: "async iterators",
      triageState: "dismissed",
      dismissedAt,
      dismissedCheckinSentAt: checkinSentAt,
    });

    const [newGap] = await insertDiscoveredGaps(topicId, [
      { label: "async iterators", depth: "working", concern: null },
    ]);

    expect(newGap!.id).not.toBe(gapId);

    const { rows } = await client.query(`SELECT * FROM gaps WHERE topic_id = $1`, [topicId]);

    expect(rows).toHaveLength(2);

    const original = rows.find((r) => r.id === gapId)!;

    expect(original.triage_state).toBe("dismissed");
    expect(original.dismissed_at.toISOString()).toBe(dismissedAt.toISOString());
    expect(original.dismissed_checkin_sent_at.toISOString()).toBe(checkinSentAt.toISOString());

    const fresh = rows.find((r) => r.id === newGap!.id)!;

    expect(fresh.triage_state).toBe("untriaged");
  }, 30_000);
});
