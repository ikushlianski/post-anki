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

const dbName = `knowledge_bit_repo_${randomUUID().replace(/-/g, "_")}`;
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

const { updateKnowledgeBitBody } = await import("./knowledge-bit.repo.js");
const { insertQuestionVariant } = await import("./knowledge-bit-question-variant.repo.js");

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

async function seedKnowledgeSource(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [id],
  );

  return id;
}

let ordinalCounter = 0;

async function seedFullyDerivedKnowledgeBit(
  knowledgeSourceId: string,
  topicId: string | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;
  const now = new Date();
  const ordinal = ordinalCounter++;

  await client.query(
    `INSERT INTO knowledge_bits
       (id, knowledge_source_id, ordinal, body,
        embedding, embedding_hash, embedded_at,
        tagged_at, tag_failed_at,
        topic_id, placement_suggestion, placement_checked_at, placement_failed_at,
        placement_suggestion_resolved_at,
        wh_question_generated_at, wh_question_generation_failed_at,
        wh_question_generation_attempts, wh_question_generation_claimed_at,
        wh_question_generation_claim_token,
        fill_blank_generated_at, fill_blank_generation_failed_at,
        fill_blank_generation_attempts, fill_blank_generation_claimed_at,
        fill_blank_generation_claim_token)
     VALUES ($1, $2, $6, 'Original body.',
        $3, 'hash-1', $4,
        $4, $4,
        $5, 'A placement suggestion', $4, $4,
        $4,
        $4, $4,
        2, $4,
        'wh-claim-token',
        $4, $4,
        2, $4,
        'fill-blank-claim-token')`,
    [id, knowledgeSourceId, JSON.stringify([0.1, 0.2]), now, topicId, ordinal],
  );

  return id;
}

async function seedTagAssignment(
  knowledgeBitId: string,
  source: "auto" | "manual" = "auto",
): Promise<string> {
  const tagId = `tag_${randomUUID()}`;
  const assignmentId = `tga_${randomUUID()}`;
  const name = `Original tag ${tagId}`;

  await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, $2)`, [tagId, name]);
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id, source) VALUES ($1, $2, 'knowledgeBit', $3, $4)`,
    [assignmentId, tagId, knowledgeBitId, source],
  );

  return assignmentId;
}

async function seedQuestionVariant(knowledgeBitId: string, kind: string, order: number): Promise<string> {
  const id = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, $3, $4, 'A prompt', 'An answer')`,
    [id, knowledgeBitId, kind, order],
  );

  return id;
}

async function seedVariantAttempt(variantId: string): Promise<string> {
  const id = `kbvattempt_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback)
     VALUES ($1, $2, 'My answer', 1, 'correct', 'Nice work')`,
    [id, variantId],
  );

  return id;
}

// Scenario 11 (existing bits default to pending, not grandfathered approved) is covered by
// migrations.integration.test.ts's own assertion that approval_state is
// `NOT NULL DEFAULT 'pending'` — that's what actually backfills every pre-existing row when the
// column lands, which a fresh per-test database can't otherwise reproduce.
describe("knowledge_bits.approval_state default (real Postgres)", () => {
  it("should default a newly-inserted bit to pending", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("pending");
  });
});

describe("updateKnowledgeBitBody (real Postgres)", () => {
  it("updates the body and returns true when the row exists", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    const updated = await updateKnowledgeBitBody(id, "Revised body.");

    expect(updated).toBe(true);

    const { rows } = await client.query(`SELECT body FROM knowledge_bits WHERE id = $1`, [id]);

    expect(rows[0]!.body).toBe("Revised body.");
  });

  it("should update the background in place when provided", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    await updateKnowledgeBitBody(id, "Revised body.", "Revised background.");

    const { rows } = await client.query(
      `SELECT background FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.background).toBe("Revised background.");
  });

  it("should update only the background and leave generation state and variants untouched when the body is unchanged", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    const variantId = await seedQuestionVariant(id, "wh_question", 0);

    const updated = await updateKnowledgeBitBody(id, "Original body.", "Revised background.");

    expect(updated).toBe(true);

    const { rows } = await client.query(
      `SELECT background, embedded_at, tagged_at, wh_question_generated_at
       FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.background).toBe("Revised background.");
    expect(rows[0]!.embedded_at).toBeInstanceOf(Date);
    expect(rows[0]!.tagged_at).toBeInstanceOf(Date);
    expect(rows[0]!.wh_question_generated_at).toBeInstanceOf(Date);

    const { rows: variantRows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(variantRows).toHaveLength(1);
  });

  it("should leave the background untouched when not provided", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    await client.query(`UPDATE knowledge_bits SET background = $1 WHERE id = $2`, [
      "Original background.",
      id,
    ]);

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT background FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.background).toBe("Original background.");
  });

  it("resets embedding, tagging, and placement columns to null", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT embedding, embedding_hash, embedded_at, tagged_at, tag_failed_at,
              placement_suggestion, placement_checked_at, placement_failed_at,
              placement_suggestion_resolved_at
       FROM knowledge_bits WHERE id = $1`,
      [id],
    );
    const row = rows[0]!;

    expect(row.embedding).toBeNull();
    expect(row.embedding_hash).toBeNull();
    expect(row.embedded_at).toBeNull();
    expect(row.tagged_at).toBeNull();
    expect(row.tag_failed_at).toBeNull();
    expect(row.placement_suggestion).toBeNull();
    expect(row.placement_checked_at).toBeNull();
    expect(row.placement_failed_at).toBeNull();
    expect(row.placement_suggestion_resolved_at).toBeNull();
  });

  it("preserves topicId as the confirmed placement, not a scan artifact", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId, "topic_1");

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(`SELECT topic_id FROM knowledge_bits WHERE id = $1`, [id]);

    expect(rows[0]!.topic_id).toBe("topic_1");
  });

  it("resets wh-question generation/claim columns and attempts to zero", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT wh_question_generated_at, wh_question_generation_failed_at,
              wh_question_generation_attempts, wh_question_generation_claimed_at,
              wh_question_generation_claim_token
       FROM knowledge_bits WHERE id = $1`,
      [id],
    );
    const row = rows[0]!;

    expect(row.wh_question_generated_at).toBeNull();
    expect(row.wh_question_generation_failed_at).toBeNull();
    expect(row.wh_question_generation_attempts).toBe(0);
    expect(row.wh_question_generation_claimed_at).toBeNull();
    expect(row.wh_question_generation_claim_token).toBeNull();
  });

  it("resets fill-blank generation/claim columns and attempts to zero", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT fill_blank_generated_at, fill_blank_generation_failed_at,
              fill_blank_generation_attempts, fill_blank_generation_claimed_at,
              fill_blank_generation_claim_token
       FROM knowledge_bits WHERE id = $1`,
      [id],
    );
    const row = rows[0]!;

    expect(row.fill_blank_generated_at).toBeNull();
    expect(row.fill_blank_generation_failed_at).toBeNull();
    expect(row.fill_blank_generation_attempts).toBe(0);
    expect(row.fill_blank_generation_claimed_at).toBeNull();
    expect(row.fill_blank_generation_claim_token).toBeNull();
  });

  it("deletes dependent question variant rows for the edited bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    await seedQuestionVariant(id, "wh_question", 0);
    await seedQuestionVariant(id, "fill_in_the_blank", 0);

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [id],
    );

    expect(rows).toHaveLength(0);
  });

  it("leaves other bits' question variants untouched", async () => {
    const sourceId = await seedKnowledgeSource();
    const editedId = await seedFullyDerivedKnowledgeBit(sourceId);
    const otherId = await seedFullyDerivedKnowledgeBit(sourceId);
    const otherVariantId = await seedQuestionVariant(otherId, "wh_question", 0);

    await updateKnowledgeBitBody(editedId, "Revised body.");

    const { rows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE id = $1`,
      [otherVariantId],
    );

    expect(rows).toHaveLength(1);
  });

  it("deletes stale tag assignments for the edited bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    await seedTagAssignment(id);

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT id FROM tag_assignments WHERE node_type = 'knowledgeBit' AND node_id = $1`,
      [id],
    );

    expect(rows).toHaveLength(0);
  });

  it("deletes an auto-tagged assignment but keeps a manually-assigned tag in place", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    const autoAssignmentId = await seedTagAssignment(id, "auto");
    const manualAssignmentId = await seedTagAssignment(id, "manual");

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT id FROM tag_assignments WHERE node_type = 'knowledgeBit' AND node_id = $1`,
      [id],
    );

    expect(rows.map((row) => row.id)).toEqual([manualAssignmentId]);
    expect(rows.map((row) => row.id)).not.toContain(autoAssignmentId);
  });

  it("leaves other bits' tag assignments untouched", async () => {
    const sourceId = await seedKnowledgeSource();
    const editedId = await seedFullyDerivedKnowledgeBit(sourceId);
    const otherId = await seedFullyDerivedKnowledgeBit(sourceId);
    const otherAssignmentId = await seedTagAssignment(otherId);

    await updateKnowledgeBitBody(editedId, "Revised body.");

    const { rows } = await client.query(`SELECT id FROM tag_assignments WHERE id = $1`, [otherAssignmentId]);

    expect(rows).toHaveLength(1);
  });

  it("deletes a variant with zero attempts (regression check)", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    const variantId = await seedQuestionVariant(id, "wh_question", 0);

    await updateKnowledgeBitBody(id, "Revised body.");

    const { rows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows).toHaveLength(0);
  });

  it("supersedes instead of deleting a variant that has a recorded learner attempt, keeping the attempt reachable", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    const variantId = await seedQuestionVariant(id, "wh_question", 0);
    const attemptId = await seedVariantAttempt(variantId);

    await updateKnowledgeBitBody(id, "Revised body.");

    // "Not orphaned" here means: the attempt's variantId still joins to a real row in
    // knowledge_bit_question_variants, so the attempt is still reachable by that join — the row
    // itself is marked superseded rather than deleted.
    const { rows } = await client.query(
      `SELECT v.id, v.superseded_at
       FROM knowledge_bit_variant_attempts a
       JOIN knowledge_bit_question_variants v ON v.id = a.variant_id
       WHERE a.id = $1`,
      [attemptId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(variantId);
    expect(rows[0]!.superseded_at).not.toBeNull();
  });

  it("does not re-supersede an already-superseded variant's timestamp on a second edit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    const variantId = await seedQuestionVariant(id, "wh_question", 0);
    await seedVariantAttempt(variantId);

    await updateKnowledgeBitBody(id, "Revised body 1.");

    const first = await client.query(
      `SELECT superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );
    const firstSupersededAt = first.rows[0]!.superseded_at;

    await updateKnowledgeBitBody(id, "Revised body 2.");

    const second = await client.query(
      `SELECT superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(second.rows[0]!.superseded_at).toEqual(firstSupersededAt);
  });

  it("lets regeneration insert a fresh active variant for the same slot after the old answered one was superseded", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);
    const variantId = await seedQuestionVariant(id, "wh_question", 0);
    await seedVariantAttempt(variantId);

    await updateKnowledgeBitBody(id, "Revised body.");

    await expect(
      insertQuestionVariant(id, "wh_question", 0, "A new prompt", "A new answer"),
    ).resolves.not.toThrow();

    const { rows } = await client.query(
      `SELECT id, superseded_at FROM knowledge_bit_question_variants
       WHERE knowledge_bit_id = $1 AND kind = 'wh_question' AND "order" = 0
       ORDER BY created_at ASC`,
      [id],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(variantId);
    expect(rows[0]!.superseded_at).not.toBeNull();
    expect(rows[1]!.superseded_at).toBeNull();
  });

  it("returns false for a missing id and writes nothing, including no dependent-row delete", async () => {
    const orphanVariantId = await seedQuestionVariant("kb_missing", "wh_question", 0);

    const updated = await updateKnowledgeBitBody("kb_missing", "Revised body.");

    expect(updated).toBe(false);

    const { rows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE id = $1`,
      [orphanVariantId],
    );

    expect(rows).toHaveLength(1);
  });
});
