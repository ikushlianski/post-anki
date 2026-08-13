import { randomUUID } from "node:crypto";
import type http from "node:http";
import { Readable } from "node:stream";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { selectNudge } from "@post-anki/core";
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

const dbName = `push_nudge_${randomUUID().replace(/-/g, "_")}`;
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

const { gatherPushCandidates } = await import("./push.repo.js");
const { gatherNudgeCandidates } = await import("../liveness/nudge.repo.js");
const { recordNudgeResponse, startLivenessTracking } = await import(
  "../liveness/liveness.repo.js"
);
const { handleCreateNudgeResponse } = await import("../liveness/liveness.controller.js");

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

const NOW = new Date().toISOString();

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function seedSubject(): Promise<string> {
  const subjectId = id("subj");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, `Push nudge subject ${subjectId}`],
  );

  return subjectId;
}

async function seedStudiableCurriculum(subjectId: string, name: string): Promise<string> {
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");
  const gapId = id("gap");

  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, name],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, 1, 0)`,
    [topicId, moduleId, curriculumId, `Topic for ${name}`],
  );
  await client.query(
    `INSERT INTO gaps (id, topic_id, label, state, origin) VALUES ($1, $2, $3, 'open', 'user')`,
    [gapId, topicId, `Gap for ${name}`],
  );

  return curriculumId;
}

describe("SCENARIO 11 — a paused course decays but stays in the daily push", () => {
  it("keeps a curriculum that decayed over a long break in the daily push, because only a decline hides it", async () => {
    const subjectId = await seedSubject();
    const curriculumId = await seedStudiableCurriculum(subjectId, "React Native");

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(90));

    const candidates = await gatherPushCandidates();
    const nudgeCandidates = await gatherNudgeCandidates(NOW);
    const decayed = nudgeCandidates.find((c) => c.entityId === curriculumId)!;

    expect(decayed.score).toBe(1);
    expect(candidates.map((c) => c.curriculumId)).toContain(curriculumId);
  }, 30_000);

  it("keeps a curriculum with no liveness history in the daily push, because unset is not dead", async () => {
    const subjectId = await seedSubject();
    const curriculumId = await seedStudiableCurriculum(subjectId, "Never tracked");

    const candidates = await gatherPushCandidates();

    expect(candidates.map((c) => c.curriculumId)).toContain(curriculumId);
  }, 30_000);
});

interface CapturedResponse {
  status: number;
  body: unknown;
}

function fakeResponse(): { res: http.ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, body: null };
  const res = {
    writeHead(status: number) {
      captured.status = status;
    },
    end(payload: string) {
      captured.body = JSON.parse(payload);
    },
  } as unknown as http.ServerResponse;

  return { res, captured };
}

async function postNudgeResponse(body: unknown): Promise<CapturedResponse> {
  const { res, captured } = fakeResponse();
  const req = Readable.from([
    Buffer.from(JSON.stringify(body)),
  ]) as unknown as http.IncomingMessage;

  await handleCreateNudgeResponse(req, res);

  return captured;
}

describe("SCENARIO 9/10 — the learner answers a curriculum nudge over the same HTTP surface", () => {
  it("makes a nudged curriculum dormant and drops it from the daily push on a no", async () => {
    const subjectId = await seedSubject();
    const curriculumId = await seedStudiableCurriculum(subjectId, "Answered no over HTTP");

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(40));

    const declined = await postNudgeResponse({
      entityType: "curriculum",
      entityId: curriculumId,
      response: "no",
    });

    const candidates = await gatherPushCandidates();

    expect(declined.status).toBe(201);
    expect(declined.body).toMatchObject({ dormant: true });
    expect(candidates.map((c) => c.curriculumId)).not.toContain(curriculumId);
  }, 30_000);

  it("revives a curriculum above the generation threshold on a yes, with no answered question", async () => {
    const subjectId = await seedSubject();
    const curriculumId = await seedStudiableCurriculum(subjectId, "Answered yes over HTTP");

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(90));

    const revived = await postNudgeResponse({
      entityType: "curriculum",
      entityId: curriculumId,
      response: "yes",
    });

    expect(revived.status).toBe(201);
    expect(revived.body).toMatchObject({ dormant: false, generationAllowed: true });
  }, 30_000);

  it("refuses a nudge response for an entity that was never tracked", async () => {
    const answered = await postNudgeResponse({
      entityType: "curriculum",
      entityId: id("curr"),
      response: "yes",
    });

    expect(answered.status).toBe(404);
    expect(answered.body).toEqual({ error: "not_tracked" });
  }, 30_000);
});

describe("SCENARIO 10 — declining the nudge makes it dormant, deletes nothing", () => {
  it("stops a declined curriculum from appearing in the daily push", async () => {
    const subjectId = await seedSubject();
    const curriculumId = await seedStudiableCurriculum(subjectId, "Declined course");

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(40));
    await recordNudgeResponse({ entityType: "curriculum", entityId: curriculumId }, "no");

    const candidates = await gatherPushCandidates();

    expect(candidates.map((c) => c.curriculumId)).not.toContain(curriculumId);
  }, 30_000);

  it("deletes no topic or gap when a curriculum is declined", async () => {
    const subjectId = await seedSubject();
    const curriculumId = await seedStudiableCurriculum(subjectId, "Declined but intact");

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(40));
    await recordNudgeResponse({ entityType: "curriculum", entityId: curriculumId }, "no");

    const topicRows = await client.query(`SELECT id FROM topics WHERE curriculum_id = $1`, [
      curriculumId,
    ]);
    const gapRows = await client.query(
      `SELECT g.id FROM gaps g JOIN topics t ON t.id = g.topic_id WHERE t.curriculum_id = $1`,
      [curriculumId],
    );

    expect(topicRows.rows).toHaveLength(1);
    expect(gapRows.rows).toHaveLength(1);
  }, 30_000);

  it("restores a declined curriculum to the daily push the moment the learner says yes again", async () => {
    const subjectId = await seedSubject();
    const curriculumId = await seedStudiableCurriculum(subjectId, "Revived course");

    await startLivenessTracking({ entityType: "curriculum", entityId: curriculumId }, daysAgo(40));
    await recordNudgeResponse({ entityType: "curriculum", entityId: curriculumId }, "no");
    await recordNudgeResponse({ entityType: "curriculum", entityId: curriculumId }, "yes");

    const candidates = await gatherPushCandidates();

    expect(candidates.map((c) => c.curriculumId)).toContain(curriculumId);
  }, 30_000);
});

describe("SCENARIO 8 — silence decays liveness and triggers a nudge in the daily push", () => {
  it("names the decayed course and surfaces its similarly quiet siblings", async () => {
    const subjectId = await seedSubject();
    const [target, sibling] = await Promise.all([
      seedStudiableCurriculum(subjectId, "Security for agentic AI on AWS"),
      seedStudiableCurriculum(subjectId, "Observability on AWS"),
    ]);

    await Promise.all([
      startLivenessTracking({ entityType: "curriculum", entityId: target }, daysAgo(90)),
      startLivenessTracking({ entityType: "curriculum", entityId: sibling }, daysAgo(20)),
    ]);

    const selection = selectNudge(
      (await gatherNudgeCandidates(NOW)).filter(
        (candidate) => candidate.groupKey === subjectId,
      ),
      NOW,
    );

    expect(selection?.target.name).toBe("Security for agentic AI on AWS");
    expect(selection?.related.map((item) => item.name)).toContain("Observability on AWS");
  }, 30_000);

  it("never re-nudges a curriculum the learner already declined, however long ago", async () => {
    const subjectId = await seedSubject();
    const declined = await seedStudiableCurriculum(subjectId, "Declined forever");

    await startLivenessTracking({ entityType: "curriculum", entityId: declined }, daysAgo(90));
    await recordNudgeResponse(
      { entityType: "curriculum", entityId: declined },
      "no",
      daysAgo(30),
    );

    const nudgeCandidates = (await gatherNudgeCandidates(NOW)).filter(
      (candidate) => candidate.entityId === declined,
    );
    const selection = selectNudge(nudgeCandidates, NOW);

    expect(nudgeCandidates).toHaveLength(1);
    expect(selection).toBeNull();
  }, 30_000);
});
