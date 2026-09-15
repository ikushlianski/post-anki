import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import type { ScopeContext } from "./probe-session.repo.js";

// loadTopicContext (probe-session.generate.ts) now fetches every topic's
// gaps/feedback/lower-level-coverage/mastery in ONE batched query per
// concern instead of one query per topic, then regroups the results back
// per-topic in memory. The real risk that refactor introduces is cross-topic
// leakage: a mastery-gated gap belonging to one topic accidentally getting
// attributed to another topic once results are batched together. This test
// seeds two topics under one module, each with its own due and not-due
// mastery-tracked gap, and proves the due-ranked selection stays correctly
// scoped per topic — no gap crosses topic boundaries in either direction.

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

const dbName = `probe_batched_ctx_${randomUUID().replace(/-/g, "_")}`;
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

const mockGenerateAgent = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: {
    probeQuizBatch: "probeQuizBatch",
    phraseBatchGenerate: "phraseBatchGenerate",
    gradeBatch: "gradeBatch",
  },
  getMastra: () => ({
    getAgent: () => ({ generate: mockGenerateAgent }),
  }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { generateReplenishBatch } = await import("./probe-session.generate.js");

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

const PASTED_GROUNDING_TEXT = "Idempotent retry design notes. ".repeat(10);

async function seedTopicWithGaps(
  moduleId: string,
  curriculumId: string,
  order: number,
  title: string,
  gapMasterySequenceNumber: number,
  dueLabel: string,
  dueScheduledForSequence: number,
  notDueLabel: string,
  notDueScheduledForSequence: number,
): Promise<string> {
  const topicId = id("topic");
  const dueGapId = id("gap");
  const notDueGapId = id("gap");

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", gap_mastery_sequence_number)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [topicId, moduleId, curriculumId, title, order, gapMasterySequenceNumber],
  );

  for (const [gapId, label] of [
    [dueGapId, dueLabel],
    [notDueGapId, notDueLabel],
  ] as const) {
    await client.query(
      `INSERT INTO gaps (id, topic_id, label, state) VALUES ($1, $2, $3, 'open')`,
      [gapId, topicId, label],
    );
  }

  await client.query(
    `INSERT INTO gap_mastery (id, gap_id, status, scheduled_for_sequence)
     VALUES ($1, $2, 'struggling', $3)`,
    [id("gpm"), dueGapId, dueScheduledForSequence],
  );
  await client.query(
    `INSERT INTO gap_mastery (id, gap_id, status, scheduled_for_sequence)
     VALUES ($1, $2, 'struggling', $3)`,
    [id("gpm"), notDueGapId, notDueScheduledForSequence],
  );

  return topicId;
}

describe("loadTopicContext's batched per-topic queries stay correctly scoped per topic", () => {
  it("keeps each topic's due/not-due mastery gate independent of the other topic's", async () => {
    const subjectId = id("subj");
    const curriculumId = id("curr");
    const moduleId = id("mod");

    await client.query(
      `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
      [subjectId, "Batched context test subject"],
    );
    await client.query(
      `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
      [curriculumId, subjectId, "Batched context test curriculum"],
    );
    await client.query(
      `INSERT INTO sources (id, curriculum_id, kind, value, title, approval_status)
       VALUES ($1, $2, 'text', $3, 'Pasted material', 'approved')`,
      [id("src"), curriculumId, PASTED_GROUNDING_TEXT],
    );
    await client.query(
      `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
      [moduleId, curriculumId, "Batched context test module"],
    );

    // Topic A: sequence number 5 — its due gap is scheduled at 3 (due),
    // its not-due gap is scheduled at 10 (not due).
    const topicAId = await seedTopicWithGaps(
      moduleId,
      curriculumId,
      1,
      "Topic A",
      5,
      "topic-a-due-gap",
      3,
      "topic-a-not-due-gap",
      10,
    );

    // Topic B: sequence number 0 — its due gap is scheduled at 0 (due),
    // its not-due gap is scheduled at 1 (not due). Deliberately the inverse
    // shape from Topic A's, so a swapped/merged mastery map would produce
    // an observably wrong inclusion on at least one side.
    const topicBId = await seedTopicWithGaps(
      moduleId,
      curriculumId,
      2,
      "Topic B",
      0,
      "topic-b-due-gap",
      0,
      "topic-b-not-due-gap",
      1,
    );

    mockGenerateAgent.mockResolvedValue({
      object: { questions: [] },
    });

    const ctx: ScopeContext = {
      scope: "module",
      scopeId: moduleId,
      curriculumId,
      status: "confirmed",
      title: "Batched context test module",
      priorMaturity: 0,
      topics: [
        {
          id: topicAId,
          title: "Topic A",
          summary: null,
          depth: "working",
          curriculumId,
          priority: 0,
        },
        {
          id: topicBId,
          title: "Topic B",
          summary: null,
          depth: "working",
          curriculumId,
          priority: 0,
        },
      ],
    };

    await generateReplenishBatch("module", ctx, false);

    expect(mockGenerateAgent).toHaveBeenCalledTimes(1);

    const prompt = mockGenerateAgent.mock.calls[0]![0] as string;

    expect(prompt).toContain("topic-a-due-gap");
    expect(prompt).toContain("topic-b-due-gap");
    expect(prompt).not.toContain("topic-a-not-due-gap");
    expect(prompt).not.toContain("topic-b-not-due-gap");
  }, 30_000);
});
