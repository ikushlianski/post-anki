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

const dbName = `kb_suspended_list_${randomUUID().replace(/-/g, "_")}`;
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
const { listSuspendedKnowledgeBits } = await import("./knowledge-bit-suspended.repo.js");
const { updateKnowledgeBitScheduleControls } = await import(
  "./knowledge-bit-review-suspension.orchestrator.js"
);

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

const NOW = new Date("2026-10-10T12:00:00.000Z");

interface SeedOptions {
  approvalState?: "approved" | "pending";
  subjectId?: string | null;
  suspendedAt?: string | null;
  buriedUntil?: string | null;
  lapses?: number;
  body?: string;
}

async function seedBit(options: SeedOptions = {}): Promise<string> {
  const knowledgeBitId = `kb_${randomUUID()}`;
  const knowledgeSourceId = `ks_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, subject_id) VALUES ($1, 'paste', $2)`,
    [knowledgeSourceId, options.subjectId ?? null],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, $3, $4)`,
    [
      knowledgeBitId,
      knowledgeSourceId,
      options.body ?? "TCP uses a three-way handshake.",
      options.approvalState ?? "approved",
    ],
  );

  if (options.suspendedAt !== undefined || options.buriedUntil !== undefined || options.lapses) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, review_count, phase, suspended_at, buried_until, lapses)
       VALUES ($1, 3, 'review', $2, $3, $4)`,
      [
        knowledgeBitId,
        options.suspendedAt ?? null,
        options.buriedUntil ?? null,
        options.lapses ?? 0,
      ],
    );
  }

  return knowledgeBitId;
}

async function seedVariant(
  knowledgeBitId: string,
  { kind = "wh_question", prompt = "Why a handshake?", answer = "To agree on sequence numbers.", superseded = false, createdAt = "2026-01-01T00:00:00.000Z" } = {},
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, superseded_at, created_at)
     VALUES ($1, $2, $3, 0, $4, $5, $6, $7)`,
    [
      `kbqv_${randomUUID()}`,
      knowledgeBitId,
      kind,
      prompt,
      answer,
      superseded ? "2026-01-02T00:00:00.000Z" : null,
      createdAt,
    ],
  );
}

async function seedSubject(name: string): Promise<string> {
  const subjectId = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [subjectId, name]);

  return subjectId;
}

describe("listSuspendedKnowledgeBits (real Postgres)", () => {
  it("should list a hand-suspended card with its question, answer, subject and since date", async () => {
    const subjectId = await seedSubject("Networking");
    const bitId = await seedBit({ subjectId, suspendedAt: "2026-10-05T08:00:00.000Z", body: "Handshake" });
    await seedVariant(bitId, { prompt: "Why a handshake?", answer: "To agree on sequence numbers." });

    const page = await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW);

    expect(page.hasMore).toBe(false);
    expect(page.items).toContainEqual({
      knowledgeBitId: bitId,
      itemText: "Handshake",
      question: "Why a handshake?",
      answer: "To agree on sequence numbers.",
      subjectName: "Networking",
      reason: "suspended",
      lapses: 0,
      suspended: true,
      buriedUntil: null,
      since: "2026-10-05T08:00:00.000Z",
    });
  });

  it("should label a card suspended after eight lapses as a leech with its lapse count", async () => {
    const bitId = await seedBit({ suspendedAt: "2026-10-06T08:00:00.000Z", lapses: 8 });
    await seedVariant(bitId);

    const card = (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.find(
      (item) => item.knowledgeBitId === bitId,
    );

    expect(card).toMatchObject({ reason: "leech", lapses: 8, suspended: true });
  });

  it("should list a buried card with the end of its bury and leave out a bury that has passed", async () => {
    const buriedBit = await seedBit({ buriedUntil: "2026-10-10T20:00:00.000Z" });
    await seedVariant(buriedBit);
    const expiredBit = await seedBit({ buriedUntil: "2026-10-09T20:00:00.000Z" });
    await seedVariant(expiredBit);

    const ids = (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.map(
      (item) => item.knowledgeBitId,
    );

    expect(ids).toContain(buriedBit);
    expect(ids).not.toContain(expiredBit);
    expect(
      (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.find(
        (item) => item.knowledgeBitId === buriedBit,
      ),
    ).toMatchObject({ reason: "buried", buriedUntil: "2026-10-10T20:00:00.000Z", since: null, suspended: false });
  });

  it("should leave out cards in rotation, unapproved bits and bits with no live question", async () => {
    const inRotation = await seedBit({ lapses: 2 });
    await seedVariant(inRotation);
    const pending = await seedBit({ approvalState: "pending", suspendedAt: "2026-10-05T08:00:00.000Z" });
    await seedVariant(pending);
    const onlySuperseded = await seedBit({ suspendedAt: "2026-10-05T08:00:00.000Z" });
    await seedVariant(onlySuperseded, { superseded: true });

    const ids = (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.map(
      (item) => item.knowledgeBitId,
    );

    expect(ids).not.toContain(inRotation);
    expect(ids).not.toContain(pending);
    expect(ids).not.toContain(onlySuperseded);
  });

  it("should show the basic question for a bit that has several live questions", async () => {
    const bitId = await seedBit({ suspendedAt: "2026-10-05T08:00:00.000Z" });
    await seedVariant(bitId, { kind: "wh_question", prompt: "Why?", answer: "Why answer." });
    await seedVariant(bitId, { kind: "basic", prompt: "What is TCP?", answer: "A transport protocol." });

    const card = (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.find(
      (item) => item.knowledgeBitId === bitId,
    );

    expect(card).toMatchObject({ question: "What is TCP?", answer: "A transport protocol." });
  });

  it("should page newest suspension first with a has-more flag", async () => {
    const older = await seedBit({ suspendedAt: "2026-10-01T08:00:00.000Z", body: "older" });
    const newer = await seedBit({ suspendedAt: "2026-10-09T08:00:00.000Z", body: "newer" });
    await seedVariant(older);
    await seedVariant(newer);

    const everything = (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.map(
      (item) => item.knowledgeBitId,
    );

    expect(everything.indexOf(newer)).toBeLessThan(everything.indexOf(older));

    const firstPage = await listSuspendedKnowledgeBits({ limit: 1, offset: 0 }, NOW);

    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items.map((item) => item.knowledgeBitId)).toEqual([everything[0]]);

    const secondPage = await listSuspendedKnowledgeBits({ limit: 1, offset: 1 }, NOW);

    expect(secondPage.items.map((item) => item.knowledgeBitId)).toEqual([everything[1]]);
  });

  it("should drop a card from the list once it is brought back through the schedule endpoint", async () => {
    const bitId = await seedBit({ suspendedAt: "2026-10-05T08:00:00.000Z", buriedUntil: "2026-10-10T20:00:00.000Z" });
    await seedVariant(bitId);

    const before = (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.map(
      (item) => item.knowledgeBitId,
    );
    expect(before).toContain(bitId);

    const outcome = await updateKnowledgeBitScheduleControls(
      bitId,
      { suspended: false, buried: false, tz: "UTC" },
      NOW,
    );

    expect(outcome).toMatchObject({ ok: true, suspended: false, buriedUntil: null });

    const after = (await listSuspendedKnowledgeBits({ limit: 50, offset: 0 }, NOW)).items.map(
      (item) => item.knowledgeBitId,
    );
    expect(after).not.toContain(bitId);
  });
});
