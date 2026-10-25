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

const dbName = `knowledge_bit_approval_${randomUUID().replace(/-/g, "_")}`;
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

const {
  approveKnowledgeBit,
  rejectKnowledgeBit,
  editKnowledgeBitQuestionVariant,
  listPendingKnowledgeBitsForReview,
} = await import("./knowledge-bit-approval.repo.js");

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

async function seedKnowledgeSource(rawText = "Some prose."): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
    [id, rawText],
  );

  return id;
}

async function seedKnowledgeBit(
  knowledgeSourceId: string,
  ordinal: number,
  body: string,
  background: string | null = null,
  approvalState: "pending" | "approved" | "rejected" = "pending",
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, background, approval_state)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, knowledgeSourceId, ordinal, body, background, approvalState],
  );

  return id;
}

async function seedQuestionVariant(
  knowledgeBitId: string,
  kind: string,
  order: number,
  prompt = "A prompt",
  answer = "An answer",
): Promise<string> {
  const id = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, knowledgeBitId, kind, order, prompt, answer],
  );

  return id;
}

describe("approveKnowledgeBit (real Postgres)", () => {
  it("should flip a pending bit's approvalState to approved and change nothing else", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to approve", "Some background.");

    await seedQuestionVariant(id, "basic", 0);

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe(true);

    const { rows } = await client.query(
      `SELECT approval_state, body, background FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("approved");
    expect(rows[0]!.body).toBe("A bit to approve");
    expect(rows[0]!.background).toBe("Some background.");
  });

  it("should return not_found for a knowledge bit id that does not exist", async () => {
    const approved = await approveKnowledgeBit("kb_missing");

    expect(approved).toBe("not_found");
  });

  it("should return blocked and leave the state untouched for an already-rejected bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already rejected", null, "rejected");

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe("blocked");

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("rejected");
  });

  it("should return true on a retried approve of a bit that is already approved", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already approved", null, "approved");

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe(true);
  });

  it("should return no_variant when the bit has no active variants after a body edit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A pending bit");

    const approved = await approveKnowledgeBit(id);

    expect(approved).toBe("no_variant");
  });
});

describe("rejectKnowledgeBit (real Postgres)", () => {
  it("should flip a pending bit's approvalState to rejected, keeping the row", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to reject");

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(true);

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("rejected");
  });

  it("should return false for a knowledge bit id that does not exist", async () => {
    const rejected = await rejectKnowledgeBit("kb_missing");

    expect(rejected.ok).toBe(false);
  });

  it("should return false and leave the state untouched for an already-approved bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already approved", null, "approved");

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(false);

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.approval_state).toBe("approved");
  });

  it("should return true on a retried reject of a bit that is already rejected", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Already rejected", null, "rejected");

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(true);
  });

  it("should clear topicId when rejecting a bit that was already placed", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A placed bit");

    await client.query(`UPDATE knowledge_bits SET topic_id = 'topic_abc' WHERE id = $1`, [id]);

    const rejected = await rejectKnowledgeBit(id);

    expect(rejected.ok).toBe(true);

    const { rows } = await client.query(
      `SELECT topic_id FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.topic_id).toBeNull();
  });
});

describe("editKnowledgeBitQuestionVariant (real Postgres)", () => {
  it("should supersede the old variant row and insert a fresh active one with the edited text", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with a variant");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ ok: true, variantId: expect.any(String), knowledgeBitId: bitId });

    const { rows: oldRows } = await client.query(
      `SELECT prompt, answer, superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(oldRows[0]!.prompt).toBe("Old prompt");
    expect(oldRows[0]!.answer).toBe("Old answer");
    expect(oldRows[0]!.superseded_at).not.toBeNull();

    const newVariantId = (result as { ok: true; variantId: string }).variantId;
    const { rows: newRows } = await client.query(
      `SELECT knowledge_bit_id, kind, "order", prompt, answer, superseded_at
       FROM knowledge_bit_question_variants WHERE id = $1`,
      [newVariantId],
    );

    expect(newRows[0]!.knowledge_bit_id).toBe(bitId);
    expect(newRows[0]!.kind).toBe("wh_question");
    expect(newRows[0]!.order).toBe(0);
    expect(newRows[0]!.prompt).toBe("New prompt");
    expect(newRows[0]!.answer).toBe("New answer");
    expect(newRows[0]!.superseded_at).toBeNull();
  });

  it("should return not_found for a variant id that does not exist", async () => {
    const result = await editKnowledgeBitQuestionVariant("kbqv_missing", "New prompt", "New answer");

    expect(result).toEqual({ error: "not_found" });
  });

  it("should return not_found for a variant that is already superseded", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with a variant");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0);

    await editKnowledgeBitQuestionVariant(variantId, "First edit", "First edit answer");
    const secondResult = await editKnowledgeBitQuestionVariant(
      variantId,
      "Second edit",
      "Second edit answer",
    );

    expect(secondResult).toEqual({ error: "not_found" });
  });

  it("should edit an approved bit's variant by superseding it with the new text", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "An approved bit", null, "approved");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ ok: true, variantId: expect.any(String) });

    const { rows } = await client.query(
      `SELECT prompt, answer, superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.superseded_at).not.toBeNull();
  });

  it("should return blocked and leave the variant untouched for a rejected bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A rejected bit", null, "rejected");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ error: "blocked" });

    const { rows } = await client.query(
      `SELECT prompt, answer, superseded_at FROM knowledge_bit_question_variants WHERE id = $1`,
      [variantId],
    );

    expect(rows[0]!.prompt).toBe("Old prompt");
    expect(rows[0]!.answer).toBe("Old answer");
    expect(rows[0]!.superseded_at).toBeNull();
  });

  it("should still edit normally for a pending bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0);

    const result = await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    expect(result).toEqual({ ok: true, variantId: expect.any(String) });
  });

  it("should let only one of two concurrent edits on the same variant win", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0);

    const [first, second] = await Promise.all([
      editKnowledgeBitQuestionVariant(variantId, "Racer A", "Racer A answer"),
      editKnowledgeBitQuestionVariant(variantId, "Racer B", "Racer B answer"),
    ]);

    const outcomes = [first, second];
    const wins = outcomes.filter((r) => "ok" in r);
    const losses = outcomes.filter((r) => "error" in r);

    expect(wins).toHaveLength(1);
    expect(losses).toEqual([{ error: "not_found" }]);

    const winningVariantId = (wins[0] as { ok: true; variantId: string }).variantId;
    const { rows } = await client.query(
      `SELECT id, prompt, superseded_at FROM knowledge_bit_question_variants
       WHERE knowledge_bit_id = $1 AND kind = 'wh_question' AND "order" = 0`,
      [bitId],
    );

    const active = rows.filter((row) => row.superseded_at === null);

    expect(active).toHaveLength(1);
    expect(active[0]!.id).toBe(winningVariantId);
    expect(["Racer A", "Racer B"]).toContain(active[0]!.prompt);
  });
});

describe("listPendingKnowledgeBitsForReview (real Postgres)", () => {
  it("should group pending bits by their knowledge source with their active question variants", async () => {
    const sourceId = await seedKnowledgeSource("The source prose.");
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit", "Some background.");
    await seedQuestionVariant(bitId, "wh_question", 0, "What prompt?", "What answer");
    await seedQuestionVariant(bitId, "fill_in_the_blank", 1, "Fill ___", "blank");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeDefined();
    expect(thisSource!.sourceText).toBe("The source prose.");
    expect(thisSource!.bits).toHaveLength(1);
    expect(thisSource!.bits[0]!.id).toBe(bitId);
    expect(thisSource!.bits[0]!.background).toBe("Some background.");
    expect(thisSource!.bits[0]!.variants.map((v) => v.prompt).sort()).toEqual(
      ["Fill ___", "What prompt?"].sort(),
    );
  });

  it("should exclude an approved bit and a rejected bit", async () => {
    const sourceId = await seedKnowledgeSource();
    await seedKnowledgeBit(sourceId, 0, "An approved bit", null, "approved");
    await seedKnowledgeBit(sourceId, 1, "A rejected bit", null, "rejected");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeUndefined();
  });

  it("should return subjectName from linked subject when present", async () => {
    const subjectId = `subj_${randomUUID()}`;

    await client.query(
      `INSERT INTO subjects (id, name, kind) VALUES ($1, 'Physics', 'architecture-mentor')`,
      [subjectId],
    );

    const sourceId = `ksrc_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'Some prose.', 'pending', $2)`,
      [sourceId, subjectId],
    );

    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with subject");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeDefined();
    expect(thisSource!.subjectName).toBe("Physics");

    await client.query(`DELETE FROM knowledge_bits WHERE id = $1`, [bitId]);
    await client.query(`DELETE FROM knowledge_sources WHERE id = $1`, [sourceId]);
    await client.query(`DELETE FROM subjects WHERE id = $1`, [subjectId]);
  });

  it("should return null subjectName when source has no subject", async () => {
    const sourceId = await seedKnowledgeSource("Prose without subject.");
    await seedKnowledgeBit(sourceId, 0, "A bit without subject");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource).toBeDefined();
    expect(thisSource!.subjectName).toBeNull();
  });

  it("should never include a superseded variant for a pending bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A pending bit");
    const variantId = await seedQuestionVariant(bitId, "wh_question", 0, "Old prompt", "Old answer");

    await editKnowledgeBitQuestionVariant(variantId, "New prompt", "New answer");

    const sources = await listPendingKnowledgeBitsForReview(100);
    const thisSource = sources.find((source) => source.knowledgeSourceId === sourceId);

    expect(thisSource!.bits[0]!.variants).toHaveLength(1);
    expect(thisSource!.bits[0]!.variants[0]!.prompt).toBe("New prompt");
  });
});
