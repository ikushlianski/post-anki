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
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `liveness_repo_${randomUUID().replace(/-/g, "_")}`;
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

const {
  readLivenessStatus,
  readLivenessStatuses,
  startLivenessTracking,
  recordLivenessActivity,
  recordNudgeSent,
  recordNudgeResponse,
  listDormantEntityIds,
  listNudgeCandidates,
  getLivenessRecord,
} = await import("./liveness.repo.js");

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

function entityId(): string {
  return `llitem_${randomUUID()}`;
}

function daysAgo(days: number, from = Date.now()): string {
  return new Date(from - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("SCENARIO 15 — liveness is derived at read time, never from a scheduled recompute", () => {
  it("reads an untracked entity as unset, not as dead", async () => {
    const status = await readLivenessStatus({
      entityType: "learning_list_item",
      entityId: entityId(),
    });

    expect(status.score).toBeNull();
    expect(status.dormant).toBe(false);
    expect(status.generationAllowed).toBe(true);
    expect(status.nudgeDue).toBe(false);
  });

  it("derives a lower score for the same stored row as time passes, with no write in between", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id });
    await recordLivenessActivity({ entityType: "learning_list_item", entityId: id }, daysAgo(0));

    const fresh = await readLivenessStatus(
      { entityType: "learning_list_item", entityId: id },
      new Date().toISOString(),
    );
    const later = await readLivenessStatus(
      { entityType: "learning_list_item", entityId: id },
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );

    expect(fresh.score).toBe(7);
    expect(later.score).toBeLessThan(fresh.score!);
    expect(later.generationAllowed).toBe(false);
  });

  it("keeps a decayed but never-declined entity findable — decay stops generation, not surfacing", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id }, daysAgo(40));

    const status = await readLivenessStatus({ entityType: "learning_list_item", entityId: id });

    expect(status.generationAllowed).toBe(false);
    expect(status.dormant).toBe(false);
  });
});

describe("recordLivenessActivity — concurrent answer submissions", () => {
  it("keeps the latest activity timestamp when many updates land at once", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id }, daysAgo(20));

    const base = Date.now();
    const latest = daysAgo(1, base);
    const stamps = [daysAgo(9, base), latest, daysAgo(5, base), daysAgo(3, base)];

    await Promise.all(
      stamps.map((at) =>
        recordLivenessActivity({ entityType: "learning_list_item", entityId: id }, at),
      ),
    );

    const record = await getLivenessRecord({ entityType: "learning_list_item", entityId: id });

    expect(record!.lastActivityAt).toBe(latest);
  });

  it("never manufactures a liveness row for an entity that is not tracked", async () => {
    const id = entityId();

    const updated = await recordLivenessActivity({
      entityType: "learning_list_item",
      entityId: id,
    });

    expect(updated).toBe(false);
    expect(await getLivenessRecord({ entityType: "learning_list_item", entityId: id })).toBeNull();
  });
});

describe("startLivenessTracking — one row per entity under concurrent approval", () => {
  it("creates exactly one row even when two approvals race", async () => {
    const id = entityId();

    await Promise.all([
      startLivenessTracking({ entityType: "learning_list_item", entityId: id }),
      startLivenessTracking({ entityType: "learning_list_item", entityId: id }),
    ]);

    const rows = await client.query(
      `SELECT id FROM liveness WHERE entity_type = 'learning_list_item' AND entity_id = $1`,
      [id],
    );

    expect(rows.rowCount).toBe(1);
  });
});

describe("nudges — SCENARIOS 8, 9, 10, 11", () => {
  it("marks a decayed, never-nudged item as nudge-due", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id }, daysAgo(30));

    const candidates = await listNudgeCandidates("learning_list_item");

    expect(candidates.map((candidate) => candidate.entityId)).toContain(id);
  });

  it("stops nudging within the cooldown window after a nudge is sent", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id }, daysAgo(30));
    await recordNudgeSent({ entityType: "learning_list_item", entityId: id }, daysAgo(1));

    const status = await readLivenessStatus({ entityType: "learning_list_item", entityId: id });

    expect(status.nudgeDue).toBe(false);
  });

  it("revives an item on yes without requiring a single answered question", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id }, daysAgo(40));

    const before = await readLivenessStatus({ entityType: "learning_list_item", entityId: id });
    const after = await recordNudgeResponse(
      { entityType: "learning_list_item", entityId: id },
      "yes",
    );

    expect(before.generationAllowed).toBe(false);
    expect("error" in after).toBe(false);
    expect((after as { generationAllowed: boolean }).generationAllowed).toBe(true);
  });

  it("does not ratchet the score upward on repeated yes-then-silence", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id }, daysAgo(40));

    const first = await recordNudgeResponse(
      { entityType: "learning_list_item", entityId: id },
      "yes",
    );
    const second = await recordNudgeResponse(
      { entityType: "learning_list_item", entityId: id },
      "yes",
    );

    expect((second as { score: number }).score).toBe((first as { score: number }).score);
  });

  it("makes an item dormant only on an explicit decline, and never deletes the row", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id });

    const declined = await recordNudgeResponse(
      { entityType: "learning_list_item", entityId: id },
      "no",
    );

    expect((declined as { dormant: boolean }).dormant).toBe(true);
    expect(await listDormantEntityIds("learning_list_item")).toContain(id);
    expect(await getLivenessRecord({ entityType: "learning_list_item", entityId: id })).not.toBeNull();
  });

  it("restores a declined item instantly on a later yes", async () => {
    const id = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: id }, daysAgo(40));
    await recordNudgeResponse({ entityType: "learning_list_item", entityId: id }, "no");

    const revived = await recordNudgeResponse(
      { entityType: "learning_list_item", entityId: id },
      "yes",
    );

    expect((revived as { dormant: boolean }).dormant).toBe(false);
    expect((revived as { generationAllowed: boolean }).generationAllowed).toBe(true);
  });

  it("reports a nudge response for an untracked entity rather than inventing a row", async () => {
    const result = await recordNudgeResponse(
      { entityType: "learning_list_item", entityId: entityId() },
      "yes",
    );

    expect(result).toEqual({ error: "not_tracked" });
  });
});

describe("readLivenessStatuses — the learning list's one batched read", () => {
  it("returns a status for every requested entity, tracked or not", async () => {
    const tracked = entityId();
    const untracked = entityId();

    await startLivenessTracking({ entityType: "learning_list_item", entityId: tracked });

    const statuses = await readLivenessStatuses([
      { entityType: "learning_list_item", entityId: tracked },
      { entityType: "learning_list_item", entityId: untracked },
    ]);

    expect(statuses.get(`learning_list_item:${tracked}`)!.score).toBe(7);
    expect(statuses.get(`learning_list_item:${untracked}`)!.score).toBeNull();
  });

  it("scores curricula on the same scale as learning-list items", async () => {
    const curriculumId = `cur_${randomUUID()}`;

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(40));

    const statuses = await readLivenessStatuses([
      { entityType: "curriculum", entityId: curriculumId },
    ]);
    const status = statuses.get(`curriculum:${curriculumId}`)!;

    expect(status.score).toBeLessThan(7);
    expect(status.dormant).toBe(false);
  });
});
