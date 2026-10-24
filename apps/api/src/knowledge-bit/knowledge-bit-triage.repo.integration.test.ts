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

const dbName = `knowledge_bit_triage_${randomUUID().replace(/-/g, "_")}`;
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

describe("triageKnowledgeBit (real Postgres)", () => {
  it("should keep one chosen variant, drop the others and approve the piece", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();

    const result = await triageKnowledgeBit(bitId, [variantIds[1]!]);

    expect(result).toMatchObject({ ok: true });
    expect(result).toEqual({ ok: true, droppedVariantIds: expect.arrayContaining([variantIds[0], variantIds[2]]) });
    expect(await activeVariantIds(bitId)).toEqual([variantIds[1]]);

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.approval_state).toBe("approved");

    const dropped = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 AND superseded_at IS NOT NULL`,
      [bitId],
    );

    expect(dropped.rows).toHaveLength(2);
  });

  it("should keep two chosen variants and drop only the third", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();

    expect(await triageKnowledgeBit(bitId, [variantIds[0]!, variantIds[2]!])).toEqual({
      ok: true,
      droppedVariantIds: [variantIds[1]],
    });

    expect(await activeVariantIds(bitId)).toEqual([variantIds[0], variantIds[2]].sort());
  });

  it("should record one approved decision like a plain approve", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();

    await triageKnowledgeBit(bitId, [variantIds[0]!]);

    const { rows } = await client.query(
      `SELECT verdict FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1`,
      [bitId],
    );

    expect(rows.map((row) => row.verdict)).toEqual(["approved"]);
  });

  it("should refuse a variant that belongs to another piece and change nothing", async () => {
    const first = await seedPieceWithThreeVariants();
    const second = await seedPieceWithThreeVariants();

    expect(await triageKnowledgeBit(first.bitId, [second.variantIds[0]!])).toBe("variant_not_active");

    expect(await activeVariantIds(first.bitId)).toEqual([...first.variantIds].sort());

    const { rows } = await client.query(
      `SELECT approval_state FROM knowledge_bits WHERE id = $1`,
      [first.bitId],
    );

    expect(rows[0]!.approval_state).toBe("pending");
  });

  it("should refuse a variant that was already dropped", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();

    await client.query(
      `UPDATE knowledge_bit_question_variants SET superseded_at = now() WHERE id = $1`,
      [variantIds[0]],
    );

    expect(await triageKnowledgeBit(bitId, [variantIds[0]!])).toBe("variant_not_active");
  });

  it("should succeed on a retry with the same ids and leave the state as it was", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();

    await triageKnowledgeBit(bitId, [variantIds[0]!, variantIds[1]!]);

    expect(await triageKnowledgeBit(bitId, [variantIds[1]!, variantIds[0]!])).toEqual({
      ok: true,
      droppedVariantIds: [],
    });
    expect(await activeVariantIds(bitId)).toEqual([variantIds[0], variantIds[1]].sort());

    const { rows } = await client.query(
      `SELECT verdict FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1`,
      [bitId],
    );

    expect(rows).toHaveLength(1);
  });

  it("should answer blocked for a retry with different ids on an approved piece", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();

    await triageKnowledgeBit(bitId, [variantIds[0]!]);

    expect(await triageKnowledgeBit(bitId, [variantIds[1]!])).toBe("blocked");
    expect(await activeVariantIds(bitId)).toEqual([variantIds[0]]);
  });

  it("should answer blocked for a rejected piece and keep its variants active", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants("rejected");

    expect(await triageKnowledgeBit(bitId, [variantIds[0]!])).toBe("blocked");
    expect(await activeVariantIds(bitId)).toEqual([...variantIds].sort());
  });

  it("should answer not_found for a missing piece", async () => {
    expect(await triageKnowledgeBit("kb_missing", ["kbqv_x"])).toBe("not_found");
  });

  it("should answer no_variant for a pending piece without active variants", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "Empty piece");

    expect(await triageKnowledgeBit(bitId, ["kbqv_x"])).toBe("no_variant");
  });

  it("should leave the attempt history of a dropped variant untouched", async () => {
    const { bitId, variantIds } = await seedPieceWithThreeVariants();
    const droppedId = variantIds[2]!;

    await client.query(
      `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback)
       VALUES ($1, $2, 'my answer', 80, 'good', 'nice')`,
      [`kbva_${randomUUID()}`, droppedId],
    );

    await triageKnowledgeBit(bitId, [variantIds[0]!]);

    const { rows } = await client.query(
      `SELECT user_answer, score, verdict FROM knowledge_bit_variant_attempts WHERE variant_id = $1`,
      [droppedId],
    );

    expect(rows).toEqual([{ user_answer: "my answer", score: 80, verdict: "good" }]);
  });
});
