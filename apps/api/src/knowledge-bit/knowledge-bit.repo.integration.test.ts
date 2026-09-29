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

async function seedTagAssignment(knowledgeBitId: string): Promise<string> {
  const tagId = `tag_${randomUUID()}`;
  const assignmentId = `tga_${randomUUID()}`;
  const name = `Original tag ${tagId}`;

  await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, $2)`, [tagId, name]);
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, 'knowledgeBit', $3)`,
    [assignmentId, tagId, knowledgeBitId],
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

describe("updateKnowledgeBitBody (real Postgres)", () => {
  it("updates the body and returns true when the row exists", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedFullyDerivedKnowledgeBit(sourceId);

    const updated = await updateKnowledgeBitBody(id, "Revised body.");

    expect(updated).toBe(true);

    const { rows } = await client.query(`SELECT body FROM knowledge_bits WHERE id = $1`, [id]);

    expect(rows[0]!.body).toBe("Revised body.");
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

  it("leaves other bits' tag assignments untouched", async () => {
    const sourceId = await seedKnowledgeSource();
    const editedId = await seedFullyDerivedKnowledgeBit(sourceId);
    const otherId = await seedFullyDerivedKnowledgeBit(sourceId);
    const otherAssignmentId = await seedTagAssignment(otherId);

    await updateKnowledgeBitBody(editedId, "Revised body.");

    const { rows } = await client.query(`SELECT id FROM tag_assignments WHERE id = $1`, [otherAssignmentId]);

    expect(rows).toHaveLength(1);
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
