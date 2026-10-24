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

const dbName = `knowledge_bit_triage_undo_${randomUUID().replace(/-/g, "_")}`;
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

const { triageKnowledgeBit } = await import("./knowledge-bit-triage.repo.js");
const { undoTriageKnowledgeBit } = await import("./knowledge-bit-triage-undo.repo.js");

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

async function activeVariantIds(bitId: string): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 AND superseded_at IS NULL ORDER BY id`,
    [bitId],
  );

  return rows.map((row) => row.id as string).sort();
}

async function seedPieceWithThreeVariants(
  approvalState: "pending" | "approved" | "rejected" = "pending",
): Promise<{ bitId: string; variantIds: string[] }> {
  const sourceId = await seedKnowledgeSource();
  const bitId = await seedKnowledgeBit(sourceId, 0, "A piece", null, approvalState);
  const variantIds = [
    await seedQuestionVariant(bitId, "basic", 0),
    await seedQuestionVariant(bitId, "fill_in_the_blank", 0),
    await seedQuestionVariant(bitId, "wh_question", 0),
  ];

  return { bitId, variantIds };
}

async function bitState(bitId: string): Promise<string> {
  const { rows } = await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [bitId]);

  return rows[0]!.approval_state as string;
}

async function verdicts(bitId: string): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT verdict FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1`,
    [bitId],
  );

  return rows.map((row) => row.verdict as string);
}

async function keepFirst(bitId: string, variantIds: string[]): Promise<string[]> {
  const result = await triageKnowledgeBit(bitId, [variantIds[0]!]);

  if (typeof result !== "object") {
    throw new Error(`triage refused: ${result}`);
  }

  return result.droppedVariantIds;
}

describe("undoTriageKnowledgeBit (real Postgres)", () => {
  it("should restore the dropped variants, put the piece back to pending and clear the approval", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);

    expect(await undoTriageKnowledgeBit(bitId, dropped)).toBe(true);

    expect(await activeVariantIds(bitId)).toEqual([...variantIds].sort());
    expect(await bitState(bitId)).toBe("pending");
    expect(await verdicts(bitId)).toEqual([]);
  });

  it("should keep a reviewer rating on the decision when the keep is undone", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);

    await client.query(`UPDATE knowledge_bit_feedback SET rating = 4 WHERE knowledge_bit_id = $1`, [bitId]);
    await undoTriageKnowledgeBit(bitId, dropped);

    const { rows } = await client.query(
      `SELECT verdict, rating FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1`,
      [bitId],
    );

    expect(rows).toEqual([{ verdict: "pending", rating: 4 }]);
  });

  it("should restore only the ids asked for and still pending-ise the piece", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);

    expect(await undoTriageKnowledgeBit(bitId, [dropped[0]!])).toBe(true);
    expect(await activeVariantIds(bitId)).toEqual([variantIds[0], dropped[0]].sort());
  });

  it("should be a no-op success when the piece is already pending and the ids are active", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);

    await undoTriageKnowledgeBit(bitId, dropped);

    expect(await undoTriageKnowledgeBit(bitId, dropped)).toBe(true);
    expect(await bitState(bitId)).toBe("pending");
  });

  it("should allow keeping again after an undo", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);

    await undoTriageKnowledgeBit(bitId, dropped);

    expect(await triageKnowledgeBit(bitId, [variantIds[2]!])).toMatchObject({ ok: true });
    expect(await activeVariantIds(bitId)).toEqual([variantIds[2]]);
    expect(await verdicts(bitId)).toEqual(["approved"]);
  });

  it("should refuse a variant that is still active on an approved piece", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);

    expect(await undoTriageKnowledgeBit(bitId, [variantIds[0]!, dropped[0]!])).toBe("variant_not_superseded");
    expect(await bitState(bitId)).toBe("approved");
    expect(await activeVariantIds(bitId)).toEqual([variantIds[0]]);
  });

  it("should refuse a dropped variant that belongs to another piece", async () => {
    const first = await seedPieceWithThreeVariants();
    const second = await seedPieceWithThreeVariants();

    await keepFirst(first.bitId, first.variantIds);

    const otherDropped = await keepFirst(second.bitId, second.variantIds);

    expect(await undoTriageKnowledgeBit(first.bitId, [otherDropped[0]!])).toBe("variant_not_superseded");
    expect(await bitState(first.bitId)).toBe("approved");
  });

  it("should refuse with slot_taken when an active variant now occupies the restored slot", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);
    const droppedRow = await client.query(
      `SELECT kind, "order" FROM knowledge_bit_question_variants WHERE id = $1`,
      [dropped[0]],
    );

    await seedQuestionVariant(bitId, droppedRow.rows[0].kind as string, droppedRow.rows[0].order as number);

    expect(await undoTriageKnowledgeBit(bitId, dropped)).toBe("slot_taken");
    expect(await bitState(bitId)).toBe("approved");
    expect(await activeVariantIds(bitId)).toHaveLength(2);
  });

  it("should answer blocked for a rejected piece", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants("rejected");

    expect(await undoTriageKnowledgeBit(bitId, [variantIds[0]!])).toBe("blocked");
  });

  it("should answer blocked when a pending piece has a non-active variant named", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();

    await client.query(`UPDATE knowledge_bit_question_variants SET superseded_at = now() WHERE id = $1`, [
      variantIds[0],
    ]);

    expect(await undoTriageKnowledgeBit(bitId, [variantIds[0]!])).toBe("blocked");
  });

  it("should answer not_found for a missing piece", async () => {
    expect(await undoTriageKnowledgeBit("kb_missing", ["kbqv_x"])).toBe("not_found");
  });

  it("should leave attempt history of a restored variant untouched", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const dropped = await keepFirst(bitId, variantIds);

    await client.query(
      `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback)
       VALUES ($1, $2, 'my answer', 80, 'good', 'nice')`,
      [`kbva_${randomUUID()}`, dropped[0]],
    );
    await undoTriageKnowledgeBit(bitId, dropped);

    const { rows } = await client.query(
      `SELECT score FROM knowledge_bit_variant_attempts WHERE variant_id = $1`,
      [dropped[0]],
    );

    expect(rows).toEqual([{ score: 80 }]);
  });
});
