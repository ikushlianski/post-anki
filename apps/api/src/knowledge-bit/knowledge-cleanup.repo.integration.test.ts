import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.KNOWLEDGE_CLEANUP_TEST_BASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `knowledge_cleanup_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();

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

const { purgeKnowledgeBits, deleteKnowledgeSource, clearAllKnowledge } = await import(
  "./knowledge-cleanup.repo.js"
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

interface Seeded {
  sourceId: string;
  bitId: string;
  variantId: string;
}

async function seedPiece(sourceId: string = `ksrc_${randomUUID()}`, ordinal = 0): Promise<Seeded> {
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 't', 'detected')
     ON CONFLICT (id) DO NOTHING`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
     VALUES ($1, $2, $3, 'A bit', 'approved')`,
    [bitId, sourceId, ordinal],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'wh_question', 0, 'P', 'A')`,
    [variantId, bitId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback)
     VALUES ($1, $2, 'a', 3, 'good', 'ok')`,
    [`att_${randomUUID()}`, variantId],
  );
  await client.query(`INSERT INTO knowledge_bit_schedules (knowledge_bit_id) VALUES ($1)`, [bitId]);
  await client.query(
    `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new)
     VALUES ($1, $2, $3, 'good', true)`,
    [`rev_${randomUUID()}`, bitId, variantId],
  );
  await client.query(
    `INSERT INTO knowledge_bit_feedback (id, knowledge_source_id, knowledge_bit_id, verdict, statement)
     VALUES ($1, $2, $3, 'approved', 's')`,
    [`fb_${randomUUID()}`, sourceId, bitId],
  );
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, 'tag_x', 'knowledgeBit', $2)`,
    [`ta_${randomUUID()}`, bitId],
  );

  return { sourceId, bitId, variantId };
}

async function countReferences(piece: Seeded): Promise<number> {
  const { rows } = await client.query(
    `SELECT
       (SELECT count(*) FROM knowledge_bits WHERE id = $1) +
       (SELECT count(*) FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1) +
       (SELECT count(*) FROM knowledge_bit_variant_attempts WHERE variant_id = $2) +
       (SELECT count(*) FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1) +
       (SELECT count(*) FROM knowledge_bit_reviews WHERE knowledge_bit_id = $1 OR variant_id = $2) +
       (SELECT count(*) FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1) +
       (SELECT count(*) FROM tag_assignments WHERE node_type = 'knowledgeBit' AND node_id = $1) AS n`,
    [piece.bitId, piece.variantId],
  );

  return Number(rows[0].n);
}

async function seedSurvivors(): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name) VALUES ($1, 'Keep me') ON CONFLICT DO NOTHING`,
    ["subj_keep"],
  );
  await client.query(
    `INSERT INTO card_style_notes (id, text) VALUES ($1, 'keep style') ON CONFLICT DO NOTHING`,
    ["note_keep"],
  );
}

async function survivorCount(): Promise<number> {
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM subjects WHERE id = 'subj_keep') +
            (SELECT count(*) FROM card_style_notes WHERE id = 'note_keep') AS n`,
  );

  return Number(rows[0].n);
}

describe("purgeKnowledgeBits (real Postgres)", () => {
  it("should remove every row referencing the deleted piece while leaving other pieces and subjects intact", async () => {
    await seedSurvivors();

    const doomed = await seedPiece();
    const kept = await seedPiece();

    const counts = await purgeKnowledgeBits([doomed.bitId, "kb_unknown"]);

    expect(counts).toMatchObject({
      knowledgeBits: 1,
      questionVariants: 1,
      variantAttempts: 1,
      schedules: 1,
      reviews: 1,
      feedback: 1,
      tagAssignments: 1,
    });
    expect(await countReferences(doomed)).toBe(0);
    expect(await countReferences(kept)).toBe(7);
    expect(await survivorCount()).toBe(2);
  });

  it("should return zero counts when the ids no longer exist so a repeated delete is harmless", async () => {
    const piece = await seedPiece();

    await purgeKnowledgeBits([piece.bitId]);

    const again = await purgeKnowledgeBits([piece.bitId]);

    expect(Object.values(again).every((n) => n === 0)).toBe(true);
  });
});

describe("deleteKnowledgeSource (real Postgres)", () => {
  it("should remove the source, all its pieces, their dependents and its grades but not another source", async () => {
    const first = await seedPiece();
    const second = await seedPiece(first.sourceId, 1);
    const other = await seedPiece();

    await client.query(
      `INSERT INTO knowledge_source_extraction_grade (id, knowledge_source_id, run_number, rating)
       VALUES ($1, $2, 1, 4)`,
      [`g_${randomUUID()}`, first.sourceId],
    );

    const counts = await deleteKnowledgeSource(first.sourceId);

    expect(counts).toMatchObject({ knowledgeSources: 1, knowledgeBits: 2, extractionGrades: 1 });
    expect(await countReferences(first)).toBe(0);
    expect(await countReferences(second)).toBe(0);
    expect(await countReferences(other)).toBe(7);

    const { rows } = await client.query(`SELECT count(*)::int AS n FROM knowledge_sources WHERE id = $1`, [
      first.sourceId,
    ]);

    expect(rows[0].n).toBe(0);
  });

  it("should return zero counts for an unknown source", async () => {
    const counts = await deleteKnowledgeSource("ksrc_missing");

    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });
});

describe("clearAllKnowledge (real Postgres)", () => {
  it("should wipe every knowledge table and keep subjects and style notes", async () => {
    await seedSurvivors();

    const piece = await seedPiece();

    await client.query(`INSERT INTO card_triage_sessions (id) VALUES ($1)`, [`ts_${randomUUID()}`]);
    await client.query(
      `INSERT INTO facts (id, body, source, source_ref) VALUES ($1, 'b', 's', $2)`,
      [`f_${randomUUID()}`, `ref_${randomUUID()}`],
    );

    const counts = await clearAllKnowledge();

    expect(counts.knowledgeBits).toBeGreaterThanOrEqual(1);
    expect(counts.facts).toBe(1);
    expect(counts.triageSessions).toBe(1);
    expect(await countReferences(piece)).toBe(0);

    for (const table of [
      "knowledge_bits",
      "knowledge_bit_question_variants",
      "knowledge_sources",
      "knowledge_bit_schedules",
      "knowledge_bit_reviews",
      "knowledge_bit_variant_attempts",
      "knowledge_bit_feedback",
      "knowledge_source_extraction_grade",
      "topic_card_variants",
      "facts",
      "card_triage_sessions",
    ]) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);

      expect(rows[0].n, table).toBe(0);
    }

    expect(await survivorCount()).toBe(2);
  });
});
